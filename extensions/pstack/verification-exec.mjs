/**
 * Restricted verification execution for the pstack verifier.
 *
 * Two layers, deliberately reported as two different things:
 *
 * 1. `parseVerificationCommand` accepts a small argv grammar for tests, builds,
 *    lints and read-only Git. It refuses shell composition and inline code. This
 *    is intent filtering only: `npm test` and `npm run lint` still execute
 *    repository-controlled code (including npm lifecycle scripts), so the
 *    strings in package.json are not a security boundary.
 *
 * 2. `runVerification` executes the accepted argv with no shell, inside an OS
 *    sandbox (macOS seatbelt via sandbox-exec, or Linux bubblewrap). The sandbox
 *    denies network and denies file writes except a private scratch directory.
 *
 * 3. When no OS sandbox can be applied, execution falls back to an explicitly
 *    degraded mode: a temporary Git worktree with the current changes, a
 *    sanitized environment, a private scratch directory, output caps and a
 *    process-tree timeout. That fallback is NOT an OS sandbox. It does not
 *    block network access and does not stop writes outside the temporary
 *    worktree and scratch. Every degraded result carries that warning, the
 *    responsible party, and `degraded: true`; the capability query exposes the
 *    same facts to `/poteto-mode status` and `/setup-pstack status`.
 *
 * Explicit non-goals: read confinement (repository code can read everything the
 * user can read), secret confidentiality, process/signal containment beyond the
 * timeout, resource quotas, syscall filtering against kernel bugs, and supply
 * chain integrity. macOS sandbox-exec is a deprecated API; bubblewrap depends on
 * kernel/user-namespace support. Both are best-effort local containment.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tlcJarPathFromConfig } from './runtime.mjs';

export const TOOL_NAME = 'verification_exec';
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_OUTPUT_BYTES = 128 * 1024;
export const DEGRADED_WARNING = 'DEGRADED: no OS sandbox can be applied. The command runs as the current user in a temporary Git worktree. This is NOT an OS sandbox: network access is not blocked, and writes outside the temporary worktree and scratch directory are not prevented. Credential-like environment variables are removed, output is capped, and the timeout kills the process tree.';
export const DEGRADED_RESPONSIBLE_PARTY = 'The operator who authorizes verification on this host is responsible for accepting degraded (non-sandboxed) execution.';
export const DEGRADED_LIMITATIONS = Object.freeze([
  'network: not blocked; verification code can open network connections',
  'writes: not blocked outside the temporary workspace and scratch directory; verification code can write anywhere the current user can',
  'shared dependencies: node_modules is symlinked read-through from the source checkout, so writes through it affect the source checkout',
  'credentials: credential-like environment variables are removed, but readable credential files remain readable',
  'processes: same-user signals, child processes, CPU, memory and disk are not contained beyond the timeout and output cap',
  'workspace form: when Git worktree metadata cannot be created, a temporary shared clone is used',
  'workspace snapshot: Git-ignored files other than shared node_modules are omitted; local ignored configuration and generated artifacts are not verified',
]);
const SANDBOX_KINDS = new Set(['macos-seatbelt', 'linux-bwrap']);
const execFileAsync = promisify(execFile);

// --- Restricted TLC (TLA+ model checker) entry ----------------------------
// Java is never bundled, downloaded or resolved from a user string. TLC runs
// only with the operator-configured tla2tools.jar, repository .tla/.cfg files
// and a fixed option whitelist. Every other java invocation is refused.
export const TLC_ENV_VARS = Object.freeze(['TLA2TOOLS_JAR', 'TLA2TOOLS']);
export const TLC_MIN_JAVA_MAJOR = 11;
export const DEFAULT_TLC_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const TLC_MISSING_WARNING = 'FORMAL VERIFICATION NOT PERFORMED: 未做形式化验证，原因是缺少 TLC. Fall back to generated-input tests that run the real code (the upstream no-verifier rule), and do not report that fallback as a formal pass.';
export const TLC_FALLBACK_RULE = 'Upstream no-verifier rule: when no verifier runs on this language, say so, and test the real code with generated inputs, not a hand model of the function.';
const TLC_FLAG_OPTIONS = new Set(['-cleanup', '-nowarning', '-deadlock', '-continue', '-difftrace']);
const TLC_VALUE_OPTIONS = new Set(['-workers', '-depth', '-seed', '-coverage']);
const TLC_SPEC_EXTENSION = '.tla';
const TLC_CONFIG_EXTENSION = '.cfg';
const MAX_TLC_OPTIONS = 16;

const SHELL_METACHARACTERS = /[;&|<>`$()\[\]{}*?~!\\'"]/;
const CONTROL_CHARACTERS = /[\0\n\r]/;
const SAFE_PATH = /^[A-Za-z0-9_@.:+,/-]+$/;
const SAFE_REVISION = /^[A-Za-z0-9_][A-Za-z0-9_./~^@:{}+-]*$/;
const SAFE_SCRIPT = /^(test|lint|build|typecheck|check|verify|format|fmt|coverage)(?::[A-Za-z0-9][A-Za-z0-9:_-]*)?$/;
const NODE_SCRIPT = /\.(?:mjs|cjs|js)$/;

const GIT_SUBCOMMANDS = Object.freeze(['status', 'diff', 'show', 'log', 'rev-parse']);
const GIT_OPTIONS = Object.freeze({
  status: new Set([
    '--porcelain', '--porcelain=v1', '--porcelain=v2', '--short', '-s', '--branch', '-b',
    '--untracked-files=no', '--untracked-files=normal', '--untracked-files=all',
    '--ignored=no', '--ignored=traditional', '--ignored=matching', '--no-renames',
  ]),
  diff: new Set([
    '--stat', '--numstat', '--name-only', '--name-status', '--raw', '--patch', '-p',
    '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--check',
    '--word-diff', '--ignore-space-change', '--ignore-all-space', '--ignore-blank-lines',
    '--minimal', '--patience', '--histogram', '--binary', '--quiet', '--exit-code',
    '--cached', '--staged',
  ]),
  show: new Set([
    '--stat', '--numstat', '--name-only', '--name-status', '--patch', '-p',
    '--no-color', '--no-ext-diff', '--no-textconv', '--summary', '--abbrev-commit',
    '--no-renames', '--no-patch', '-s',
  ]),
  log: new Set([
    '--stat', '--numstat', '--name-only', '--name-status', '--patch', '-p',
    '--no-color', '--oneline', '--decorate', '--graph', '--first-parent', '--merges',
    '--no-merges', '--reverse', '--date-order', '--topo-order', '--abbrev-commit',
    '--no-patch',
  ]),
  'rev-parse': new Set([
    '--verify', '--short', '--abbrev-ref', '--show-toplevel', '--show-prefix',
    '--is-inside-work-tree', '--is-inside-git-dir', '--git-dir', '--absolute-git-dir',
    '--show-superproject-working-tree',
  ]),
});
const GIT_VALUE_OPTIONS = Object.freeze({
  status: [/^--porcelain=v[12]$/, /^--untracked-files=(?:no|normal|all)$/, /^--ignored=(?:no|traditional|matching)$/],
  diff: [/^--unified=\d{1,4}$/, /^-U\d{1,4}$/, /^--inter-hunk-context=\d{1,4}$/],
  show: [/^--unified=\d{1,4}$/, /^-U\d{1,4}$/],
  log: [/^-n\d{1,6}$/, /^--max-count=\d{1,6}$/, /^--skip=\d{1,6}$/],
  'rev-parse': [/^--short=\d{1,4}$/],
});
// Options that take the next token as their numeric value.
const GIT_PAIRED_VALUE_OPTIONS = Object.freeze({
  status: new Set(),
  diff: new Set(['-U', '--unified', '--inter-hunk-context']),
  show: new Set(['-U', '--unified']),
  log: new Set(['-n', '--max-count', '--skip']),
  'rev-parse': new Set(),
});

function refuse(reason) {
  return { ok: false, reason };
}

function isSafeRelativePath(token) {
  if (!token || token.startsWith('-') || isAbsolute(token)) return false;
  if (token.split('/').some(part => part === '..')) return false;
  return SAFE_PATH.test(token);
}

function isRevision(token) {
  return SAFE_REVISION.test(token);
}

function hasValueOption(subcommand, token) {
  return GIT_VALUE_OPTIONS[subcommand].some(pattern => pattern.test(token));
}

/** Parse one command line into a bounded argv. Pure: no filesystem or process access. */
export function parseVerificationCommand(command) {
  if (typeof command !== 'string') return refuse('The command must be a string.');
  const trimmed = command.trim();
  if (!trimmed) return refuse('The command is empty.');
  if (CONTROL_CHARACTERS.test(command)) return refuse('Only a single line without control characters is allowed.');
  const tokens = trimmed.split(/\s+/);
  if (tokens.some(token => SHELL_METACHARACTERS.test(token))) {
    return refuse('Shell composition, redirection, quoting, expansion and wildcards are not allowed; pass a plain argv-style command.');
  }
  const program = tokens[0];
  if (program === 'git') return parseGit(tokens);
  if (program === 'npm') return parseNpm(tokens);
  if (program === 'node') return parseNode(tokens);
  if (program === 'java') {
    return refuse('java is not allowed here: the only java entry is the restricted TLC runner, which requires the configured tla2tools.jar with repository .tla/.cfg files and whitelisted TLC options.');
  }
  return refuse(`Only npm, node and read-only git are allowed; refused: ${program}`);
}

function parseGit(tokens) {
  const subcommand = tokens[1];
  if (!subcommand || !GIT_SUBCOMMANDS.includes(subcommand)) {
    return refuse(`Only git ${GIT_SUBCOMMANDS.join(', git ')} are allowed; refused: git ${subcommand ?? ''}`.trim());
  }
  const argv = [subcommand];
  let pathMode = false;
  let revision = false;
  let pathCount = 0;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      if (pathMode) return refuse('Only one `--` separator is allowed.');
      pathMode = true;
      argv.push(token);
      continue;
    }
    if (pathMode) {
      if (!isSafeRelativePath(token)) return refuse(`Unsafe path argument: ${token}`);
      pathCount += 1;
      argv.push(token);
      continue;
    }
    if (token.startsWith('-')) {
      if (GIT_OPTIONS[subcommand].has(token) || hasValueOption(subcommand, token)) {
        argv.push(token);
        continue;
      }
      if (GIT_PAIRED_VALUE_OPTIONS[subcommand].has(token)) {
        const value = tokens[index + 1];
        if (!value || !/^\d{1,6}$/.test(value)) return refuse(`Git option ${token} requires a numeric value.`);
        argv.push(token, value);
        index += 1;
        continue;
      }
      return refuse(`Git option is not in the read-only whitelist (no --output, -c, --exec, --ext-diff or --textconv): ${token}`);
    }
    if (!isRevision(token)) return refuse(`Unsafe revision argument: ${token}`);
    revision = true;
    argv.push(token);
  }
  if (pathMode && pathCount === 0) return refuse('`--` must be followed by a path.');
  const informationOnly = argv.some(arg => ['--show-toplevel', '--show-prefix', '--is-inside-work-tree', '--is-inside-git-dir', '--git-dir', '--absolute-git-dir', '--show-superproject-working-tree'].includes(arg));
  if (subcommand === 'rev-parse' && !revision && (!informationOnly || argv.includes('--verify'))) return refuse('git rev-parse requires a revision or ref.');
  return { ok: true, argv, program: 'git', category: 'git-read-only', display: `git ${argv.join(' ')}` };
}

function parseNpm(tokens) {
  if (tokens.length === 2 && tokens[1] === 'test') {
    return { ok: true, argv: ['test'], program: 'npm', category: 'test', display: 'npm test' };
  }
  if (tokens.length === 3 && tokens[1] === 'run' && SAFE_SCRIPT.test(tokens[2])) {
    return { ok: true, argv: ['run', tokens[2]], program: 'npm', category: 'npm-script', display: `npm run ${tokens[2]}` };
  }
  if (tokens.length === 2 && tokens[1] === 'run') return refuse('npm run requires a verification script name.');
  return refuse('Only `npm test` or `npm run <test|lint|build|typecheck|check|verify|format|coverage[:sub]>` are allowed; install, publish, exec, audit, pack and arbitrary arguments are refused.');
}

function parseNode(tokens) {
  const args = tokens.slice(1);
  if (args.length === 0) return refuse('node requires --test, --check or a repository script path.');
  if (args[0] === '--test') {
    for (const token of args.slice(1)) {
      if (token.startsWith('-') || !isSafeRelativePath(token)) return refuse(`Unsafe node --test argument: ${token}`);
    }
    return { ok: true, argv: args, program: 'node', category: 'node-test', display: `node ${args.join(' ')}` };
  }
  if (args[0] === '--check') {
    if (args.length !== 2 || !isSafeRelativePath(args[1]) || !NODE_SCRIPT.test(args[1])) {
      return refuse('node --check accepts exactly one repository .js, .cjs or .mjs path.');
    }
    return { ok: true, argv: args, program: 'node', category: 'node-check', display: `node ${args.join(' ')}` };
  }
  if (args.length !== 1 || !isSafeRelativePath(args[0]) || !NODE_SCRIPT.test(args[0])) {
    return refuse('Inline evaluation (-e, -p, --input-type) is refused; node accepts one repository .js, .cjs or .mjs path, or --test/--check.');
  }
  return { ok: true, argv: args, program: 'node', category: 'node-script', display: `node ${args[0]}` };
}

/** Seatbelt profile: default allow, then remove network and non-scratch writes. */
export function buildSandboxProfile(scratchDir) {
  const quote = value => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-write*)',
    '(allow file-write*',
    `  (subpath "${quote(scratchDir)}")`,
    '  (literal "/dev/null")',
    '  (literal "/dev/zero")',
    '  (literal "/dev/stdout")',
    '  (literal "/dev/stderr")',
    '  (literal "/dev/tty"))',
    '',
  ].join('\n');
}

function findExecutable(name, pathValue = process.env.PATH ?? '') {
  for (const entry of pathValue.split(delimiter)) {
    if (!entry) continue;
    const candidate = join(entry, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function firstLine(error, stderr) {
  const detail = String(stderr || '').trim() || String(error?.message ?? error ?? '');
  return detail.split('\n')[0].slice(0, 400);
}

function runProcess(executable, args, { cwd, env, timeoutMs, signal, maxOutputBytes = MAX_OUTPUT_BYTES }) {
  return new Promise(resolvePromise => {
    let child;
    try {
      // detached makes the child a process-group leader, so timeout/abort can
      // kill the whole verification tree. npm runs tests as grandchildren; if
      // only npm is killed, a grandchild can keep the stdout pipe open and the
      // close event never fires.
      child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) {
      resolvePromise({ launchError: firstLine(error), stdout: '', stderr: '', exitCode: null, signalName: null, timedOut: false, aborted: false, outputTruncated: false });
      return;
    }
    const startedAt = Date.now();
    const stdout = { chunks: [], bytes: 0 };
    const stderr = { chunks: [], bytes: 0 };
    let outputTruncated = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let forceFinishTimer;
    const collect = (chunk, stream) => {
      const target = stream === 'stdout' ? stdout : stderr;
      if (target.bytes >= maxOutputBytes) {
        outputTruncated = true;
        return;
      }
      // Cap by bytes, not characters, so multi-byte output cannot exceed the
      // configured capture limit.
      const part = chunk.length > maxOutputBytes - target.bytes
        ? chunk.subarray(0, maxOutputBytes - target.bytes)
        : chunk;
      target.chunks.push(part);
      target.bytes += part.length;
      if (part.length < chunk.length) outputTruncated = true;
    };
    child.stdout?.on('data', chunk => collect(chunk, 'stdout'));
    child.stderr?.on('data', chunk => collect(chunk, 'stderr'));
    const finish = (exitCode, signalName, launchError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceFinishTimer);
      if (signal) signal.removeEventListener('abort', onAbort);
      const decode = target => {
        let text = Buffer.concat(target.chunks).toString('utf8');
        // A byte cut can split a multi-byte character and expand it to U+FFFD
        // on decode. Trim until the reported string is within the byte cap.
        while (Buffer.byteLength(text, 'utf8') > maxOutputBytes) {
          text = text.slice(0, -1);
          outputTruncated = true;
        }
        return text;
      };
      resolvePromise({
        launchError,
        stdout: decode(stdout),
        stderr: decode(stderr),
        exitCode,
        signalName,
        timedOut,
        aborted,
        outputTruncated,
        durationMs: Date.now() - startedAt,
      });
    };
    const terminate = () => {
      clearTimeout(forceFinishTimer);
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch { try { child.kill('SIGKILL'); } catch {} }
      // Never let a surviving descendant hold the pipes open forever. The
      // group kill normally closes immediately; this is the bounded fallback.
      forceFinishTimer = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(null, 'SIGKILL');
      }, 2000);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminate();
    }, timeoutMs);
    const onAbort = () => {
      if (settled) return;
      aborted = true;
      terminate();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('error', error => finish(null, null, firstLine(error)));
    child.on('close', (code, signalName) => finish(code, signalName));
  });
}

let sandboxProbe;
export function resetSandboxProbe() {
  sandboxProbe = undefined;
}

async function probeSandbox() {
  if (process.platform === 'darwin') {
    const executable = '/usr/bin/sandbox-exec';
    if (!existsSync(executable)) return { available: false, kind: 'macos-seatbelt', reason: 'sandbox-exec is not installed' };
    const probe = await runProcess(executable, ['-p', '(version 1)(allow default)', '/usr/bin/true'], {
      cwd: tmpdir(), env: process.env, timeoutMs: 5000,
    });
    if (probe.exitCode === 0) {
      return {
        available: true,
        kind: 'macos-seatbelt',
        executable,
        enforcement: 'macOS seatbelt: network denied; file writes limited to a private scratch directory (deprecated sandbox-exec API)',
      };
    }
    return { available: false, kind: 'macos-seatbelt', reason: `sandbox-exec could not apply a profile: ${probe.launchError ?? firstLine(null, probe.stderr)}` };
  }
  if (process.platform === 'linux') {
    const executable = findExecutable('bwrap');
    if (!executable) return { available: false, kind: 'linux-bwrap', reason: 'bubblewrap (bwrap) is not installed' };
    const probe = await runProcess(executable, [
      '--die-with-parent', '--unshare-all', '--ro-bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '/bin/true',
    ], { cwd: tmpdir(), env: process.env, timeoutMs: 5000 });
    if (probe.exitCode === 0) {
      return {
        available: true,
        kind: 'linux-bwrap',
        executable,
        enforcement: 'Linux bubblewrap: network namespace unshared; filesystem read-only except a private scratch bind mount',
      };
    }
    return { available: false, kind: 'linux-bwrap', reason: `bubblewrap could not start a namespace: ${probe.launchError ?? firstLine(null, probe.stderr)}` };
  }
  return { available: false, kind: 'unsupported-platform', reason: `no OS sandbox adapter for platform ${process.platform}` };
}

/** Probe once per process whether a real OS sandbox can be applied. */
export function detectSandbox() {
  sandboxProbe ??= probeSandbox();
  return sandboxProbe;
}

/**
 * Describe the actual execution boundary without overstating it. This is the
 * capability query `/poteto-mode status` and `/setup-pstack status` should show.
 */
export function capabilityFromSandbox(sandbox) {
  if (sandbox?.available && SANDBOX_KINDS.has(sandbox.kind)) {
    return {
      isolation: 'os-sandbox',
      degraded: false,
      sandbox: sandbox.kind,
      enforcement: sandbox.enforcement,
      warning: null,
      responsibleParty: null,
      limitations: [],
      limits: {
        network: 'denied by the OS sandbox',
        writes: 'denied outside the private scratch directory by the OS sandbox',
        credentials: 'credential-like environment variables are removed; readable files remain visible',
        resources: 'timeout, process-tree kill and output cap only',
      },
    };
  }
  return {
    isolation: 'degraded-worktree',
    degraded: true,
    sandbox: sandbox?.kind ?? null,
    unavailableReason: sandbox?.reason ?? `no OS sandbox adapter for ${sandbox?.kind ?? 'this host'}`,
    enforcement: DEGRADED_WARNING,
    warning: DEGRADED_WARNING,
    responsibleParty: DEGRADED_RESPONSIBLE_PARTY,
    limitations: [...DEGRADED_LIMITATIONS],
    limits: {
      network: 'not isolated',
      writes: 'not isolated outside the temporary Git worktree and scratch directory',
      credentials: 'credential-like environment variables are removed; readable files remain visible',
      resources: 'timeout, process-tree kill and output cap only',
    },
  };
}

/** Probe the host and return the honest capability record. */
export async function getVerificationCapability(options = {}) {
  return capabilityFromSandbox(options.sandbox ?? await detectSandbox());
}

function buildPlan(sandbox, argv, scratchDir, cwd) {
  if (sandbox.kind === 'macos-seatbelt') {
    return { executable: sandbox.executable, args: ['-p', buildSandboxProfile(scratchDir), ...argv] };
  }
  if (sandbox.kind === 'linux-bwrap') {
    return {
      executable: sandbox.executable,
      args: [
        '--die-with-parent', '--unshare-all', '--ro-bind', '/', '/', '--bind', scratchDir, scratchDir,
        '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--chdir', cwd, ...argv,
      ],
    };
  }
  return null;
}

async function runGit(cwd, args, env) {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...args], {
      cwd,
      env,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30_000,
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    const detail = String(error.stderr ?? error.message ?? error).trim().split('\n').filter(Boolean).at(-1) ?? '';
    return {
      ok: false,
      stdout: Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.from(error.stdout ?? ''),
      stderr: Buffer.isBuffer(error.stderr) ? error.stderr : Buffer.from(error.stderr ?? ''),
      reason: detail.slice(0, 400),
    };
  }
}

async function populateDegradedWorkspace(workspace, cwd, scratchDir, env) {
  const patch = await runGit(cwd, ['diff', 'HEAD', '--binary'], env);
  if (!patch.ok) throw new Error(`git diff HEAD failed: ${patch.reason ?? 'unknown reason'}`);
  if (patch.stdout.length > 0) {
    const patchPath = join(scratchDir, 'current-changes.patch');
    await writeFile(patchPath, patch.stdout);
    const applied = await runGit(workspace, ['apply', '--binary', '--whitespace=nowarn', patchPath], env);
    if (!applied.ok) throw new Error(`could not apply current changes to the temporary workspace: ${applied.reason ?? 'unknown reason'}`);
  }
  const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], env);
  if (!untracked.ok) throw new Error(`git ls-files failed: ${untracked.reason ?? 'unknown reason'}`);
  for (const relativePath of untracked.stdout.toString('utf8').split('\0').filter(Boolean)) {
    if (isAbsolute(relativePath) || relativePath.split('/').includes('..')) continue;
    if (relativePath === 'node_modules' || relativePath.startsWith('node_modules/') || relativePath.startsWith('.git/')) continue;
    const destination = join(workspace, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    // A failed copy would silently produce an incomplete snapshot; fail the
    // workspace preparation instead and let the caller report it.
    try {
      await copyFile(join(cwd, relativePath), destination);
    } catch (error) {
      throw new Error(`could not copy untracked file ${relativePath} into the temporary workspace: ${firstLine(error)}`);
    }
  }
  // Most test commands need installed dependencies. Symlink the source
  // node_modules read-through instead of copying it; dependencies are not a
  // write boundary in degraded mode and the warning says so.
  if (existsSync(join(cwd, 'node_modules')) && !existsSync(join(workspace, 'node_modules'))) {
    await symlink(join(cwd, 'node_modules'), join(workspace, 'node_modules'), 'dir').catch(() => {});
  }
}

/**
 * Build a throwaway workspace that reflects the current working tree (HEAD
 * plus tracked changes plus untracked files). A Git worktree is the primary
 * form; when the host forbids writing the main Git directory, a shared clone is
 * used instead and the result says so. Either way this is a workspace copy,
 * not a security boundary: code can still write anywhere the user can.
 */
async function prepareDegradedWorkspace(cwd, scratchDir, env) {
  const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'], env);
  if (!inside.ok || inside.stdout.toString().trim() !== 'true') {
    throw new Error('the working directory is not a Git work tree; a temporary workspace cannot be prepared');
  }
  const head = await runGit(cwd, ['rev-parse', '--verify', 'HEAD'], env);
  if (!head.ok) throw new Error(`the Git work tree has no HEAD commit: ${head.reason ?? 'unknown reason'}`);
  const worktree = join(scratchDir, 'worktree');
  const added = await runGit(cwd, ['worktree', 'add', '--detach', worktree, 'HEAD'], env);
  if (added.ok) {
    try {
      await populateDegradedWorkspace(worktree, cwd, scratchDir, env);
      return {
        path: worktree,
        kind: 'worktree',
        note: null,
        async cleanup() {
          // Remove only this run's worktree. Never run `git worktree prune`:
          // it is repository-global and could delete another writer's state.
          const removed = await runGit(cwd, ['worktree', 'remove', '--force', worktree], env);
          if (!removed.ok) await rm(worktree, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await runGit(cwd, ['worktree', 'remove', '--force', worktree], env).catch(() => {});
      throw error;
    }
  }
  // Some hosts (for example a nested agent sandbox) deny writes to the main
  // repository's .git/worktrees directory. A shared clone needs writes only
  // inside the private scratch directory, so it preserves the workspace copy
  // while making the limitation explicit.
  const checkout = join(scratchDir, 'checkout');
  const cloned = await runGit(cwd, ['clone', '--shared', '--no-checkout', '--quiet', cwd, checkout], env);
  if (!cloned.ok) {
    throw new Error(`git worktree add failed (${added.reason ?? 'unknown reason'}) and the fallback clone failed (${cloned.reason ?? 'unknown reason'})`);
  }
  const checkedOut = await runGit(checkout, ['checkout', '--detach', 'HEAD', '--quiet'], env);
  if (!checkedOut.ok) throw new Error(`could not check out the fallback clone: ${checkedOut.reason ?? 'unknown reason'}`);
  try {
    await populateDegradedWorkspace(checkout, cwd, scratchDir, env);
  } catch (error) {
    throw error;
  }
  return {
    path: checkout,
    kind: 'checkout',
    note: 'git worktree metadata could not be created, so a temporary shared clone was used instead',
    async cleanup() {},
  };
}

// Allowlist, not a denylist: ambient credentials, proxy settings, NODE_OPTIONS,
// npm auth config and shell injection hooks never reach the verification child.
// HOME and the npm/git config paths point at the private scratch directory.
const SAFE_ENV_KEYS = new Set([
  'PATH', 'SHELL', 'TERM', 'TZ', 'USER', 'LOGNAME', 'NODE_ENV', 'CI',
  'COLUMNS', 'LINES', 'FORCE_COLOR', 'NO_COLOR', 'COLORTERM',
]);

function buildVerificationEnvironment(scratchDir, extraEnv) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SAFE_ENV_KEYS.has(key) || key === 'LANG' || key.startsWith('LC_')) env[key] = value;
  }
  Object.assign(env, {
    HOME: join(scratchDir, 'home'),
    TMPDIR: scratchDir,
    TMP: scratchDir,
    TEMP: scratchDir,
    npm_config_cache: join(scratchDir, 'npm-cache'),
    npm_config_logs_dir: join(scratchDir, 'npm-logs'),
    npm_config_userconfig: join(scratchDir, 'npmrc'),
    npm_config_globalconfig: join(scratchDir, 'npmrc-global'),
    npm_config_update_notifier: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_progress: 'false',
    CI: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(scratchDir, 'gitconfig'),
    GIT_OPTIONAL_LOCKS: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
  });
  for (const [key, value] of Object.entries(extraEnv ?? {})) {
    if (value !== undefined) env[key] = String(value);
  }
  return env;
}

async function prepareEnvironmentFiles(scratchDir) {
  await mkdir(join(scratchDir, 'home'), { recursive: true });
  await mkdir(join(scratchDir, 'npm-cache'), { recursive: true });
  await mkdir(join(scratchDir, 'npm-logs'), { recursive: true });
  await writeFile(join(scratchDir, 'npmrc'), '');
  await writeFile(join(scratchDir, 'npmrc-global'), '');
  await writeFile(join(scratchDir, 'gitconfig'), '');
}

/**
 * Execute one parsed verification command. With an OS sandbox the command runs
 * inside it. Without one, it runs in a temporary Git worktree and every result
 * is marked degraded. `ok` means the process was launched and its exit status
 * collected; it does not mean the command passed. Refusals are `ok:false`.
 */
export async function runVerification(command, options = {}) {
  const parsed = parseVerificationCommand(command);
  if (!parsed.ok) return { ok: false, status: 'refused', command, reason: parsed.reason };
  return executeWithinBoundary({
    command,
    category: parsed.category,
    program: parsed.program,
    argv: parsed.argv,
    buildArgs: () => parsed.argv,
    cwd: resolve(options.cwd ?? process.cwd()),
    sandbox: options.sandbox,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
    extraEnv: options.env,
    signal: options.signal,
    scratchDir: options.scratchDir,
  });
}

/**
 * Shared boundary for every executed command: OS sandbox when available,
 * otherwise the explicitly degraded temporary workspace. `buildArgs` receives
 * the directory the command actually runs in and the private scratch directory,
 * so callers can resolve paths and writable locations without knowing which
 * boundary was chosen.
 */
async function executeWithinBoundary(request) {
  const { command, category, program, buildArgs, cwd } = request;
  if (!existsSync(cwd)) return { ok: false, status: 'refused', command, reason: `Working directory does not exist: ${cwd}` };
  const sandbox = request.sandbox ?? await detectSandbox();
  const sandboxUsable = sandbox.available && SANDBOX_KINDS.has(sandbox.kind);
  const timeoutMs = Number.isSafeInteger(request.timeoutMs) && request.timeoutMs > 0
    ? Math.min(request.timeoutMs, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = Number.isSafeInteger(request.maxOutputBytes) && request.maxOutputBytes > 0
    ? request.maxOutputBytes
    : MAX_OUTPUT_BYTES;
  let scratchDir;
  let rawScratch;
  let worktree;
  try {
    // Seatbelt matches canonical vnode paths. On macOS os.tmpdir() returns
    // /var/folders/..., a symlink path to /private/var/...; an uncanonicalized
    // subpath rule therefore leaves the scratch directory read-only.
    rawScratch = request.scratchDir ?? await mkdtemp(join(tmpdir(), 'pstack-verify-'));
    scratchDir = await realpath(rawScratch);
    await prepareEnvironmentFiles(scratchDir);
  } catch (error) {
    if (!request.scratchDir && rawScratch) await rm(rawScratch, { recursive: true, force: true }).catch(() => {});
    return { ok: false, status: 'launch-failed', command, reason: `Could not prepare the scratch directory: ${firstLine(error)}` };
  }
  try {
    const env = buildVerificationEnvironment(scratchDir, request.extraEnv);
    let prepared;
    let executionCwd = cwd;
    let isolation = 'os-sandbox';
    let enforcement = sandbox.enforcement;
    let warning = null;
    let responsibleParty = null;
    let workspace = 'source-working-directory';
    if (sandboxUsable) {
      prepared = buildPlan(sandbox, [program, ...await buildArgs({ workspaceCwd: cwd, scratchDir })], scratchDir, cwd);
      if (!prepared) return { ok: false, status: 'unavailable', command, reason: `No OS sandbox plan for ${sandbox.kind}` };
    } else {
      try {
        worktree = await prepareDegradedWorkspace(cwd, scratchDir, env);
      } catch (error) {
        return {
          ok: false,
          status: 'unavailable',
          command,
          reason: `No usable OS sandbox (${sandbox.reason ?? sandbox.kind ?? 'unknown'}), and the degraded workspace could not be prepared: ${firstLine(error)}`,
          sandbox: sandbox.kind ?? null,
        };
      }
      executionCwd = worktree.path;
      prepared = { executable: program, args: await buildArgs({ workspaceCwd: executionCwd, scratchDir }) };
      isolation = 'degraded-worktree';
      enforcement = DEGRADED_WARNING;
      warning = worktree.note ? `${DEGRADED_WARNING} Workspace note: ${worktree.note}.` : DEGRADED_WARNING;
      responsibleParty = DEGRADED_RESPONSIBLE_PARTY;
      workspace = worktree.kind === 'worktree' ? 'temporary-git-worktree' : 'temporary-git-checkout';
    }
    const result = await runProcess(prepared.executable, prepared.args, {
      cwd: executionCwd,
      env,
      timeoutMs,
      signal: request.signal,
      maxOutputBytes,
    });
    if (result.launchError) {
      return { ok: false, status: 'launch-failed', command, reason: result.launchError, sandbox: sandbox.kind ?? null };
    }
    if (sandboxUsable && sandbox.kind === 'macos-seatbelt' && /sandbox_apply/i.test(result.stderr)) {
      return { ok: false, status: 'unavailable', command, reason: `sandbox-exec could not apply the profile: ${firstLine(null, result.stderr)}`, sandbox: sandbox.kind };
    }
    const status = result.aborted ? 'aborted' : result.timedOut ? 'timed-out' : result.exitCode === 0 ? 'passed' : 'failed';
    return {
      ok: true,
      command,
      argv: request.argv,
      category,
      sandbox: sandbox.kind ?? null,
      isolation,
      degraded: isolation !== 'os-sandbox',
      enforcement,
      warning,
      responsibleParty,
      limitations: isolation === 'os-sandbox' ? [] : [...DEGRADED_LIMITATIONS],
      workspace,
      status,
      exitCode: result.exitCode,
      signal: result.signalName,
      timedOut: result.timedOut,
      aborted: result.aborted,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
      outputTruncated: result.outputTruncated,
    };
  } finally {
    if (worktree) await worktree.cleanup().catch(() => {});
    if (!request.scratchDir && scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Render a result for the model. Exit code is always the executed command's. */
export function renderVerificationResult(result) {
  if (!result.ok) {
    const label = result.status === 'unavailable' ? 'UNAVAILABLE' : 'REFUSED';
    return `${label}: ${result.reason}`;
  }
  const lines = [
    `COMMAND: ${result.command}`,
    `ISOLATION: ${result.isolation}`,
    `ENFORCEMENT: ${result.enforcement}`,
    `STATUS: ${result.status}`,
    `EXIT CODE: ${result.exitCode === null ? 'null (no exit status)' : result.exitCode}${result.signal ? ` (signal ${result.signal})` : ''}`,
    `DURATION: ${result.durationMs}ms`,
  ];
  if (result.degraded) lines.push(`WARNING: ${result.warning}`);
  if (result.responsibleParty) lines.push(`RESPONSIBLE: ${result.responsibleParty}`);
  for (const limitation of result.limitations ?? []) lines.push(`LIMITATION: ${limitation}`);
  if (result.timedOut) lines.push('The command was killed after the timeout; this is not a pass.');
  if (result.outputTruncated) lines.push('Output was truncated at the capture limit.');
  lines.push('', 'STDOUT:', result.stdout.trim() || '(empty)', '', 'STDERR:', result.stderr.trim() || '(empty)');
  return lines.join('\n');
}

/** What the no-verifier fallback is allowed to claim: generated-input tests, never a formal pass. */
export function tlcFallbackPlan(reason) {
  return {
    kind: 'generated-input-tests',
    formal: false,
    warning: TLC_MISSING_WARNING,
    reason: reason ?? 'TLC is not available on this host',
    upstreamRule: TLC_FALLBACK_RULE,
    steps: [
      'State in the result that no formal verification ran, and name the missing TLC.',
      'Test the real code with generated inputs for the property TLC would have checked; do not model the function by hand.',
      'Report the result as generated-input test coverage, never as a formal verification pass.',
    ],
  };
}

async function probeJava(env) {
  const found = findExecutable('java', env.PATH ?? '');
  if (!found) return { available: false, path: null, version: null, major: null, meetsMinimum: false, reason: 'java was not found on PATH' };
  const path = await realpath(found).catch(() => found);
  const probe = await runProcess(found, ['-version'], { cwd: tmpdir(), env, timeoutMs: 10_000, maxOutputBytes: 64 * 1024 });
  const text = `${probe.stdout}\n${probe.stderr}`;
  const version = text.match(/version "([^"]+)"/)?.[1] ?? null;
  const major = Number(version?.match(/^(?:1\.)?(\d+)/)?.[1] ?? NaN);
  if (probe.exitCode !== 0) {
    return { available: false, path, version, major: null, meetsMinimum: false, reason: `java -version failed: ${firstLine(null, probe.stderr) || 'unknown error'}` };
  }
  if (!Number.isSafeInteger(major)) {
    return { available: false, path, version, major: null, meetsMinimum: false, reason: 'could not read a java version from java -version' };
  }
  if (major < TLC_MIN_JAVA_MAJOR) {
    return { available: false, path, version, major, meetsMinimum: false, reason: `java ${version} is older than Java ${TLC_MIN_JAVA_MAJOR}, which TLC requires` };
  }
  return { available: true, path, version, major, meetsMinimum: true, reason: null };
}

/**
 * Resolve the configured tla2tools.jar. The operator declares it through
 * TLA2TOOLS_JAR (or the upstream TLA2TOOLS name) or tla.tla2toolsJar in
 * pstack.json. Conflicting declarations are refused instead of guessed, and the
 * path is canonicalized so a symlink swap cannot pass an identity check later.
 */
async function resolveTlcJar({ config, env }) {
  const declared = [];
  for (const name of TLC_ENV_VARS) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) declared.push({ value: value.trim(), source: `env:${name}` });
  }
  const configured = tlcJarPathFromConfig(config);
  if (configured) declared.push({ value: configured, source: 'pstack.json:tla.tla2toolsJar' });
  if (declared.length === 0) {
    return { ok: false, reason: `no tla2tools.jar is configured; set ${TLC_ENV_VARS[0]} (or ${TLC_ENV_VARS[1]}) or pstack.json tla.tla2toolsJar to the jar path; this package never downloads it` };
  }
  const [first] = declared;
  const conflicting = declared.find(entry => entry.value !== first.value);
  if (conflicting) return { ok: false, reason: `conflicting tla2tools.jar paths (${first.source} vs ${conflicting.source}); keep exactly one configured path` };
  if (CONTROL_CHARACTERS.test(first.value)) return { ok: false, reason: `${first.source}: the jar path must not contain control characters` };
  if (!isAbsolute(first.value)) return { ok: false, reason: `${first.source}: expected an absolute path to tla2tools.jar, got ${first.value}` };
  let canonical;
  try {
    const info = await stat(first.value);
    if (!info.isFile()) return { ok: false, reason: `${first.source}: ${first.value} is not a regular file` };
    canonical = await realpath(first.value);
  } catch {
    return { ok: false, reason: `${first.source}: ${first.value} does not exist` };
  }
  return { ok: true, path: canonical, source: first.source };
}

/**
 * Probe Java and the configured jar. This is the capability record `/setup-pstack
 * status` should show. It never downloads anything and never treats a missing
 * TLC as a pass.
 */
export async function detectTlc(options = {}) {
  const env = options.env ?? process.env;
  const [java, jar] = await Promise.all([
    probeJava(env),
    resolveTlcJar({ config: options.config, env }),
  ]);
  const available = java.available && jar.ok;
  const reasons = [];
  if (!java.available) reasons.push(java.reason);
  if (!jar.ok) reasons.push(jar.reason);
  const reason = available ? null : reasons.join('; ');
  return {
    available,
    formal: available ? 'tlc' : 'none',
    java: {
      available: java.available,
      path: java.path,
      version: java.version,
      major: java.major,
      minimumMajor: TLC_MIN_JAVA_MAJOR,
      meetsMinimum: java.meetsMinimum,
      reason: java.reason,
    },
    jar: jar.ok
      ? { configured: true, path: jar.path, source: jar.source, reason: null }
      : { configured: false, path: null, source: null, reason: jar.reason },
    reason,
    warning: available ? null : TLC_MISSING_WARNING,
    fallback: available ? null : tlcFallbackPlan(reason),
    limits: {
      scope: 'TLC checks only the properties the .cfg file states, under the model and bounds written in the .tla and .cfg files',
      invocation: 'the configured jar only, with repository .tla/.cfg paths and whitelisted TLC options; no other java command can run',
      dependencies: 'Java and tla2tools.jar are never bundled or downloaded by this package',
    },
  };
}

/** Capability query for status surfaces, named like `getVerificationCapability`. */
export async function getTlcCapability(options = {}) {
  return detectTlc(options);
}

/** Validate the restricted TLC option list. Pure: no filesystem or process access. */
export function parseTlcOptions(options) {
  if (options === undefined) return { ok: true, argv: [] };
  if (!Array.isArray(options)) return refuse('TLC options must be an array of whitelisted option strings.');
  if (options.length > MAX_TLC_OPTIONS) return refuse(`Too many TLC options; pass at most ${MAX_TLC_OPTIONS} whitelisted options.`);
  const argv = [];
  for (let index = 0; index < options.length; index += 1) {
    const token = options[index];
    if (typeof token !== 'string' || !token) return refuse('Each TLC option must be a non-empty string.');
    if (token.length > 64) return refuse(`TLC option is too long: ${token.slice(0, 32)}...`);
    if (CONTROL_CHARACTERS.test(token) || SHELL_METACHARACTERS.test(token)) {
      return refuse(`Shell composition, quoting and redirection are not allowed in TLC options: ${token}`);
    }
    if (TLC_FLAG_OPTIONS.has(token)) {
      argv.push(token);
      continue;
    }
    if (token === '-config' || token === '--config') {
      return refuse('Pass the .cfg path as the request config field; -config is built from it and is not accepted inside options.');
    }
    if (TLC_VALUE_OPTIONS.has(token)) {
      const value = options[index + 1];
      if (typeof value === 'string' && (CONTROL_CHARACTERS.test(value) || SHELL_METACHARACTERS.test(value))) {
        return refuse(`Shell composition, quoting and redirection are not allowed in TLC option values: ${value}`);
      }
      const pattern = token === '-workers' ? /^(?:auto|\d{1,3})$/ : /^\d{1,9}$/;
      if (typeof value !== 'string' || !pattern.test(value)) {
        return refuse(`TLC option ${token} requires ${token === '-workers' ? 'a worker count or auto' : 'a numeric value'}.`);
      }
      argv.push(token, value);
      index += 1;
      continue;
    }
    return refuse(`TLC option is not in the restricted whitelist (${[...TLC_FLAG_OPTIONS, ...TLC_VALUE_OPTIONS].join(', ')}): ${token}`);
  }
  return { ok: true, argv };
}

async function resolveRepositoryFile(root, token, extension, label) {
  if (typeof token !== 'string' || !token.trim()) return refuse(`The TLC ${label} must be a repository ${extension} path.`);
  const value = token.trim();
  if (CONTROL_CHARACTERS.test(value) || SHELL_METACHARACTERS.test(value)) {
    return refuse(`The TLC ${label} path must be a plain path without shell metacharacters: ${value}`);
  }
  if (!isAbsolute(value) && value.split('/').some(part => part === '..')) {
    return refuse(`The TLC ${label} path must stay inside the repository: ${value}`);
  }
  let realRoot;
  let canonical;
  try {
    realRoot = await realpath(root);
    canonical = await realpath(isAbsolute(value) ? value : resolve(realRoot, value));
  } catch {
    return refuse(`The TLC ${label} does not exist: ${value}`);
  }
  if (canonical !== realRoot && !canonical.startsWith(realRoot + sep)) {
    return refuse(`The TLC ${label} resolves outside the repository (path or symlink escape): ${value}`);
  }
  if (!canonical.endsWith(extension)) return refuse(`The TLC ${label} must be a ${extension} file: ${value}`);
  const info = await stat(canonical).catch(() => null);
  if (!info?.isFile()) return refuse(`The TLC ${label} is not a file: ${value}`);
  return { ok: true, file: { path: canonical, relative: relative(realRoot, canonical) } };
}

/** Resolve and validate a TLC request against the repository the run happens in. */
export async function parseTlcRequest(request, options = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return refuse('The TLC request must be an object with spec and config.');
  for (const key of Object.keys(request)) if (!['spec', 'config', 'options'].includes(key)) return refuse(`Unknown TLC request field: ${key}`);
  const optionCheck = parseTlcOptions(request.options);
  if (!optionCheck.ok) return optionCheck;
  const spec = await resolveRepositoryFile(resolve(options.root ?? process.cwd()), request.spec, TLC_SPEC_EXTENSION, 'spec');
  if (!spec.ok) return spec;
  const config = await resolveRepositoryFile(resolve(options.root ?? process.cwd()), request.config, TLC_CONFIG_EXTENSION, 'config');
  if (!config.ok) return config;
  return { ok: true, spec: spec.file, config: config.file, options: optionCheck.argv };
}

/**
 * Classify a TLC run from its output, not from its exit code alone. With
 * `-continue` TLC exits 0 while reporting broken invariants, so a pass needs a
 * positive `Model checking completed.` line and no other `Error:` line. This
 * mirrors the upstream integrity check in the statechart helper.
 */
function classifyTlcOutput(executed) {
  const output = `${executed.stdout}\n${executed.stderr}`;
  const completed = /^Model checking completed\./m.test(output);
  const violation = /Invariant \S+ is violated/.test(output);
  const toolError = output
    .split('\n')
    .find(line => line.startsWith('Error: ') && !/^Error: (Invariant \S+ is violated|The behavior up to this point is)/.test(line)) ?? null;
  const outcome = toolError
    ? 'error'
    : violation
      ? 'invariant-violated'
      : completed
        ? (executed.exitCode === 0 ? 'passed' : 'error')
        : 'incomplete';
  return { outcome, completed, violation, toolError };
}

/**
 * Run TLC through the restricted entry. With no configured TLC this returns an
 * explicit `not-performed` result plus the generated-input fallback; it never
 * reports a formal pass.
 */
export async function runTlcVerification(request, options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const capability = options.capability ?? await detectTlc({ config: options.config, env });
  if (!capability.available) {
    return {
      ok: false,
      status: 'unavailable',
      command: null,
      formalVerification: 'not-performed',
      warning: TLC_MISSING_WARNING,
      reason: `${TLC_MISSING_WARNING} Cause: ${capability.reason}`,
      capability,
      fallback: capability.fallback ?? tlcFallbackPlan(capability.reason),
    };
  }
  if (!existsSync(cwd)) {
    return { ok: false, status: 'refused', command: null, formalVerification: 'not-performed', reason: `Working directory does not exist: ${cwd}`, capability, fallback: null };
  }
  const parsed = await parseTlcRequest(request, { root: cwd });
  if (!parsed.ok) {
    return { ok: false, status: 'refused', command: null, formalVerification: 'not-performed', reason: parsed.reason, capability, fallback: null };
  }
  const jarPath = capability.jar.path;
  const shownOptions = parsed.options.length ? ` ${parsed.options.join(' ')}` : '';
  const command = `java -jar ${jarPath} -metadir <scratch>/tlc-metadir${shownOptions} -config ${parsed.config.relative} ${parsed.spec.relative} (TLC)`;
  const executed = await executeWithinBoundary({
    command,
    category: 'tlc',
    // Run the same java binary the capability probe resolved. Re-resolving
    // `java` through PATH could start a different interpreter than the one whose
    // version was checked.
    program: capability.java.path,
    cwd,
    sandbox: options.sandbox,
    timeoutMs: options.timeoutMs ?? DEFAULT_TLC_TIMEOUT_MS,
    maxOutputBytes: options.maxOutputBytes,
    extraEnv: options.env,
    signal: options.signal,
    scratchDir: options.scratchDir,
    buildArgs: async ({ workspaceCwd, scratchDir }) => {
      // TLC writes its state directory and the standard modules it generates
      // to these locations; both must sit in the private scratch directory so
      // an OS sandbox can keep the repository and the rest of the disk read-only.
      const metaDir = join(scratchDir, 'tlc-metadir');
      const javaTmp = join(scratchDir, 'java-tmp');
      await mkdir(metaDir, { recursive: true });
      await mkdir(javaTmp, { recursive: true });
      return [
        `-Djava.io.tmpdir=${javaTmp}`,
        '-jar', jarPath,
        '-metadir', metaDir,
        ...parsed.options,
        '-config', join(workspaceCwd, parsed.config.relative),
        join(workspaceCwd, parsed.spec.relative),
      ];
    },
  });
  if (!executed.ok) {
    return {
      ...executed,
      formalVerification: 'not-performed',
      capability,
      fallback: executed.status === 'unavailable' ? tlcFallbackPlan(executed.reason) : null,
    };
  }
  const classification = classifyTlcOutput(executed);
  const status = executed.status === 'passed' && classification.outcome !== 'passed' ? 'failed' : executed.status;
  return {
    ...executed,
    status,
    formalVerification: 'performed',
    capability,
    fallback: null,
    tlc: {
      ...classification,
      java: capability.java.path,
      spec: parsed.spec.relative,
      config: parsed.config.relative,
      options: parsed.options,
      jar: jarPath,
    },
  };
}

/** Render a TLC result, keeping the formal claim and the fallback claim separate. */
export function renderTlcResult(result) {
  if (!result.ok) {
    if (result.status !== 'unavailable') return `REFUSED: ${result.reason}`;
    const capability = result.capability ?? {};
    return [
      'FORMAL VERIFICATION: not performed',
      `REASON: ${result.warning ?? TLC_MISSING_WARNING}`,
      `CAUSE: ${capability.reason ?? result.reason ?? 'unknown'}`,
      'FALLBACK: generated-input tests against the real code (not a hand model). A passing fallback is not a formal verification pass.',
      `JAVA: ${capability.java?.available ? `${capability.java.version ?? 'unknown version'} at ${capability.java.path}` : (capability.java?.reason ?? 'unavailable')}`,
      `JAR: ${capability.jar?.path ?? capability.jar?.reason ?? 'not configured'}`,
      ...(result.fallback?.steps ?? []).map(step => `FALLBACK STEP: ${step}`),
      'SKIPPED: TLC did not run, so this request has no formal result.',
    ].join('\n');
  }
  const lines = [
    'FORMAL VERIFICATION: performed (TLC)',
    `FORMAL OUTCOME: ${result.tlc.outcome}`,
  ];
  if (result.tlc.outcome !== 'passed') {
    lines.push('TLC did not pass. Report a counterexample or a TLC error as a finding in the code\'s terms; do not weaken the property or the model until it passes.');
    if (result.exitCode === 0) {
      lines.push('TLC exited 0, but its output is not a pass: a violated invariant (often with -continue), another TLC error, or no "Model checking completed." line. The exit code is kept as-is and must not be read as success.');
    }
    if (result.tlc.outcome === 'incomplete') {
      lines.push('TLC stopped before "Model checking completed.", so its findings are incomplete and prove nothing; this is not a pass.');
    }
  }
  lines.push(renderVerificationResult(result));
  return lines.join('\n');
}

/**
 * Tool definition for a distinct TLC entry. The caller owns registration; the
 * module owns the whitelist, the jar identity and the fallback reporting.
 *
 * `loadConfig` is the explicit contract for pstack.json: the host injects an
 * async callback that returns an already validated config, for example
 * `() => readConfig(paths.project)` or a merged `loadConfig` result. It is read
 * per execution, so a configuration edit applies without a restart. A callback
 * that throws is reported as a refusal; a config problem must not be presented
 * as "TLC is missing".
 */
export function createTlcVerificationTool(options = {}) {
  const { loadConfig } = options;
  if (loadConfig !== undefined && typeof loadConfig !== 'function') {
    throw new TypeError('createTlcVerificationTool: loadConfig must be a function that returns a validated pstack config');
  }
  return {
    name: 'tlc_verify',
    label: 'TLC Verify',
    description: 'Model-check a TLA+ spec with TLC using the operator-configured tla2tools.jar, a repository .tla file and a repository .cfg file. Accepts only whitelisted TLC options (-cleanup, -nowarning, -deadlock, -continue, -difftrace, -workers N|auto, -depth N, -seed N, -coverage N). Any other java invocation is refused. Without a configured jar and Java 11+ this returns an explicit "formal verification not performed" result with the generated-input fallback; a fallback is never a formal pass.',
    parameters: {
      type: 'object',
      properties: {
        spec: { type: 'string', description: 'Repository-relative .tla file to model check.' },
        config: { type: 'string', description: 'Repository-relative .cfg file that states INIT, NEXT, INVARIANT and bounds.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Whitelisted TLC options only, for example ["-cleanup", "-workers", "4"]. The -config path comes from the config field.',
        },
      },
      required: ['spec', 'config'],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let config;
      if (loadConfig) {
        try {
          config = await loadConfig(ctx);
        } catch (error) {
          const reason = `pstack.json could not be loaded, so the TLC entry did not run: ${firstLine(error)}`;
          return {
            content: [{ type: 'text', text: `REFUSED: ${reason}` }],
            details: { ok: false, status: 'refused', formalVerification: 'not-performed', formalOutcome: null, exitCode: null, reason, fallback: null, warning: null },
          };
        }
      }
      const result = await runTlcVerification(
        { spec: params?.spec, config: params?.config, options: params?.options },
        { cwd: ctx?.cwd, signal, config },
      );
      return {
        content: [{ type: 'text', text: renderTlcResult(result) }],
        details: {
          ok: result.ok,
          status: result.status,
          formalVerification: result.formalVerification,
          formalOutcome: result.tlc?.outcome ?? null,
          exitCode: result.exitCode ?? null,
          reason: result.ok ? undefined : result.reason,
          fallback: result.fallback?.kind ?? null,
          warning: result.warning ?? null,
        },
      };
    },
  };
}

/**
 * Tool definition for the host to register. The caller owns registration
 * (`pi.registerTool(createVerificationTool())`); the module performs execution.
 */
export function createVerificationTool(options = {}) {
  const tlcTool = createTlcVerificationTool(options);
  return {
    name: TOOL_NAME,
    label: 'Verification Exec',
    description: 'Run one restricted verification command (npm test, npm run test/lint/build/check, node --test, node --check, a repository node script, or read-only git) and return its real exit code. For TLC use command="tlc" with spec, config and optional options fields; only the configured jar and repository .tla/.cfg files are accepted. Missing TLC explicitly returns the generated-input fallback, never a formal pass. With an OS sandbox, network is denied and writes are limited to a private scratch directory. Without one, it runs in a temporary Git worktree and labels the result DEGRADED: network and writes outside that worktree are not isolated, and the result names the responsible party. Refuses shell composition, installs, publish, push and inline code.',
    parameters: {
      type: 'object',
      properties: {
        ...tlcTool.parameters.properties,
        command: {
          type: 'string',
          description: 'One argv-style command, for example "npm test", "npm run lint", "node --test scripts/foo.test.mjs", "git diff --stat main...HEAD", or "tlc" with the structured TLC fields. Shell operators, quotes and inline code are refused.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params?.command === 'tlc') return tlcTool.execute(_toolCallId, params, signal, _onUpdate, ctx);
      if (['spec', 'config', 'options'].some(key => params?.[key] !== undefined)) {
        return { content: [{ type: 'text', text: 'REFUSED: TLC fields require command="tlc".' }], details: { ok: false, status: 'refused' } };
      }
      const result = await runVerification(params?.command, { cwd: ctx?.cwd, signal });
      return {
        content: [{ type: 'text', text: renderVerificationResult(result) }],
        details: {
          ok: result.ok,
          status: result.status,
          exitCode: result.exitCode ?? null,
          sandbox: result.sandbox ?? null,
          isolation: result.isolation ?? null,
          degraded: Boolean(result.degraded),
          warning: result.warning ?? null,
          responsibleParty: result.responsibleParty ?? null,
          limitations: result.limitations ?? [],
          category: result.category ?? null,
          reason: result.ok ? undefined : result.reason,
        },
      };
    },
  };
}

// Manual validation entry: node extensions/pstack/verification-exec.mjs [--text] "<command>"
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry && entry === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--capability') {
    const capability = await getVerificationCapability();
    console.log(JSON.stringify(capability, null, 2));
    process.exitCode = 0;
  } else if (args[0] === '--tlc-capability') {
    const capability = await detectTlc();
    console.log(JSON.stringify(capability, null, 2));
    if (!capability.available) console.log(renderTlcResult({ ok: false, status: 'unavailable', warning: TLC_MISSING_WARNING, capability, fallback: capability.fallback }));
    process.exitCode = 0;
  } else {
    const textMode = args[0] === '--text';
    const command = textMode ? args[1] : args[0];
    if (!command) {
      console.error('Usage: node extensions/pstack/verification-exec.mjs [--text] "<command>" | --capability | --tlc-capability');
      process.exitCode = 2;
    } else {
      const result = await runVerification(command, { cwd: process.cwd() });
      console.log(textMode ? renderVerificationResult(result) : JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 2;
    }
  }
}
