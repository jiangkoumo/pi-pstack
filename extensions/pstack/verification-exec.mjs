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
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

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
]);
const SANDBOX_KINDS = new Set(['macos-seatbelt', 'linux-bwrap']);
const execFileAsync = promisify(execFile);

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
  if (subcommand === 'rev-parse' && !revision) return refuse('git rev-parse requires a revision or ref.');
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
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!existsSync(cwd)) return { ok: false, status: 'refused', command, reason: `Working directory does not exist: ${cwd}` };
  const sandbox = options.sandbox ?? await detectSandbox();
  const sandboxUsable = sandbox.available && SANDBOX_KINDS.has(sandbox.kind);
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
    ? Math.min(options.timeoutMs, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0
    ? options.maxOutputBytes
    : MAX_OUTPUT_BYTES;
  let scratchDir;
  let rawScratch;
  let worktree;
  try {
    // Seatbelt matches canonical vnode paths. On macOS os.tmpdir() returns
    // /var/folders/..., a symlink path to /private/var/...; an uncanonicalized
    // subpath rule therefore leaves the scratch directory read-only.
    rawScratch = options.scratchDir ?? await mkdtemp(join(tmpdir(), 'pstack-verify-'));
    scratchDir = await realpath(rawScratch);
    await prepareEnvironmentFiles(scratchDir);
  } catch (error) {
    if (!options.scratchDir && rawScratch) await rm(rawScratch, { recursive: true, force: true }).catch(() => {});
    return { ok: false, status: 'launch-failed', command, reason: `Could not prepare the scratch directory: ${firstLine(error)}` };
  }
  try {
    const env = buildVerificationEnvironment(scratchDir, options.env);
    let prepared;
    let executionCwd = cwd;
    let isolation = 'os-sandbox';
    let enforcement = sandbox.enforcement;
    let warning = null;
    let responsibleParty = null;
    let workspace = 'source-working-directory';
    if (sandboxUsable) {
      prepared = buildPlan(sandbox, [parsed.program, ...parsed.argv], scratchDir, cwd);
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
      prepared = { executable: parsed.program, args: parsed.argv };
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
      signal: options.signal,
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
      argv: parsed.argv,
      category: parsed.category,
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
    if (!options.scratchDir && scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
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

/**
 * Tool definition for the host to register. The caller owns registration
 * (`pi.registerTool(createVerificationTool())`); the module performs execution.
 */
export function createVerificationTool() {
  return {
    name: TOOL_NAME,
    label: 'Verification Exec',
    description: 'Run one restricted verification command (npm test, npm run test/lint/build/check, node --test, node --check, a repository node script, or read-only git) and return its real exit code. With an OS sandbox, network is denied and writes are limited to a private scratch directory. Without one, it runs in a temporary Git worktree and labels the result DEGRADED: network and writes outside that worktree are not isolated, and the result names the responsible party. Refuses shell composition, installs, publish, push and inline code.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'One argv-style command, for example "npm test", "npm run lint", "node --test scripts/foo.test.mjs", "git diff --stat main...HEAD". Shell operators, quotes and inline code are refused.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
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
  } else {
    const textMode = args[0] === '--text';
    const command = textMode ? args[1] : args[0];
    if (!command) {
      console.error('Usage: node extensions/pstack/verification-exec.mjs [--text] "<command>" | --capability');
      process.exitCode = 2;
    } else {
      const result = await runVerification(command, { cwd: process.cwd() });
      console.log(textMode ? renderVerificationResult(result) : JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 2;
    }
  }
}
