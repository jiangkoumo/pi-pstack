/**
 * Read-only Git inspection for the comment-sicko review agent.
 *
 * Whitelist design: only `git diff`, `git show` and `git log` survive, and only
 * with options that cannot change command behavior, execute a program, or write
 * a file. Everything else (other subcommands, global options, shell composition)
 * is refused with a reason. Validation happens here; execution uses execFile, so
 * no shell ever parses the command string.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execGit = promisify(execFile);
export const READ_SUBCOMMANDS = Object.freeze(['diff', 'show', 'log']);

const OPTIONS = {
  diff: new Set([
    '--stat', '--numstat', '--name-only', '--name-status', '--raw', '--patch', '-p',
    '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--check',
    '--word-diff', '--ignore-space-change', '--ignore-all-space', '--ignore-blank-lines',
    '--minimal', '--patience', '--histogram', '--binary',
  ]),
  show: new Set([
    '--stat', '--numstat', '--name-only', '--name-status', '--patch', '-p',
    '--no-color', '--no-ext-diff', '--no-textconv', '--summary', '--abbrev-commit',
    '--no-renames',
  ]),
  log: new Set([
    '--stat', '--numstat', '--name-only', '--name-status', '--patch', '-p',
    '--no-color', '--oneline', '--decorate', '--graph', '--first-parent', '--merges',
    '--no-merges', '--reverse', '--date-order', '--topo-order', '--abbrev-commit',
  ]),
};
const VALUE_OPTIONS = {
  diff: [/^--unified=\d{1,4}$/, /^-U\d{1,4}$/, /^--inter-hunk-context=\d{1,4}$/],
  show: [/^--unified=\d{1,4}$/, /^-U\d{1,4}$/],
  log: [/^-n\d{1,6}$/, /^-\d{1,6}$/, /^--max-count=\d{1,6}$/, /^--skip=\d{1,6}$/],
};

// Revision-ish token: starts with an object character, then rev syntax. A leading
// dash is never a revision here, so `-c`, `--exec` and friends cannot slip through.
const REVISION = /^[A-Za-z0-9_][A-Za-z0-9_./~^@:{}+-]*$/;
// A path is only accepted after `--`. No shell characters are reachable anyway;
// this keeps the accepted grammar small and testable.
const SAFE_PATH = /^[A-Za-z0-9_@.:+,/-]+$/;

function reject(reason) {
  return { ok: false, reason };
}

function isRev(token) {
  return REVISION.test(token);
}

function isValueOption(subcommand, token) {
  return VALUE_OPTIONS[subcommand].some(pattern => pattern.test(token));
}

/** Parse a proposed command into a git argv, or refuse with a reason. */
export function parseGitReadCommand(command) {
  if (typeof command !== 'string') return reject('The command must be a string.');
  const trimmed = command.trim();
  if (!trimmed) return reject('The command is empty.');
  if (/[\0\n\r]/.test(command)) return reject('The command must be a single line without control characters.');
  const tokens = trimmed.split(/\s+/);
  if (tokens[0] !== 'git') return reject(`Only git is allowed; refused: ${tokens[0]}`);
  const subcommand = tokens[1];
  if (!subcommand || !READ_SUBCOMMANDS.includes(subcommand)) {
    return reject(`Only git ${READ_SUBCOMMANDS.join(', git ')} are allowed; refused: git ${subcommand ?? ''}`.trim());
  }
  const argv = [subcommand];
  let revision = false;
  let pathMode = false;
  let pathCount = 0;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      if (pathMode) return reject('Only one `--` separator is allowed.');
      pathMode = true;
      argv.push(token);
      continue;
    }
    if (pathMode) {
      if (!SAFE_PATH.test(token)) return reject(`Unsafe path argument: ${token}`);
      pathCount += 1;
      argv.push(token);
      continue;
    }
    if (token.startsWith('-')) {
      if (subcommand === 'log' && token === '-n') {
        const count = tokens[index + 1];
        if (typeof count !== 'string' || !/^\d{1,6}$/.test(count)) {
          return reject('Git log -n requires a count of 1 to 6 digits.');
        }
        argv.push(token, count);
        index += 1;
        continue;
      }
      if (OPTIONS[subcommand].has(token) || isValueOption(subcommand, token)) {
        argv.push(token);
        continue;
      }
      return reject(`Git option is not in the read-only whitelist (no --output, -c, --exec or --ext-diff): ${token}`);
    }
    if (!isRev(token)) return reject(`Unsafe revision argument: ${token}`);
    revision = true;
    argv.push(token);
  }
  if (pathMode && pathCount === 0) return reject('`--` must be followed by a path.');
  // Only execution knows the repository's default branch. Explicit revisions
  // bypass that lookup; show always needs a single object rather than a range.
  if (!revision && subcommand === 'show') argv.splice(1, 0, 'HEAD');
  return { ok: true, argv, needsDefaultRange: !revision && subcommand !== 'show' };
}

function messageOf(error, stderr) {
  const detail = String(stderr || '').trim() || String(error?.message ?? error);
  return detail.split('\n')[0].slice(0, 400);
}

/** Resolve commit refs in priority order, without accepting a same-named tag. */
async function defaultBranch(options) {
  for (const [ref, name] of [
    ['refs/remotes/origin/HEAD', 'origin/HEAD'],
    ['refs/heads/main', 'main'],
    ['refs/heads/master', 'master'],
  ]) {
    try {
      await execGit('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], options);
      return { ref, name };
    } catch {
      // Missing, unborn or dangling refs are not usable defaults. Try the next.
    }
  }
  return null;
}

/** Execute a whitelisted command in a repository. Never reaches a shell. */
export async function runGitRead(command, { cwd, timeoutMs = 20000, maxBytes = 2 * 1024 * 1024 } = {}) {
  if (typeof cwd !== 'string' || !cwd) return reject('A working directory is required.');
  const parsed = parseGitReadCommand(command);
  if (!parsed.ok) return parsed;
  const options = { cwd, timeout: timeoutMs, maxBuffer: maxBytes, encoding: 'utf8' };
  if (parsed.needsDefaultRange) {
    const base = await defaultBranch(options);
    if (!base) return reject('Cannot resolve the default branch (tried origin/HEAD, main, master). Pass an explicit revision or range.');
    try {
      await execGit('git', ['merge-base', '--is-ancestor', 'HEAD', base.ref], options);
    } catch (error) {
      if (error.code !== 1) return reject(`Cannot compare HEAD with the default branch: ${messageOf(error, error.stderr)}`);
      parsed.argv.splice(1, 0, `${base.name}...HEAD`);
    }
  }
  return new Promise(resolvePromise => {
    execFile('git', parsed.argv, options, (error, stdout, stderr) => {
      const output = { argv: parsed.argv, stdout: stdout ?? '', stderr: stderr ?? '' };
      if (error) {
        return resolvePromise({ ok: false, reason: `git ${parsed.argv.join(' ')} failed: ${messageOf(error, stderr)}`, ...output });
      }
      resolvePromise({ ok: true, ...output });
    });
  });
}

/** Render a tool result for the model. */
export function renderGitReadResult(result) {
  if (!result.ok) return `REFUSED: ${result.reason}`;
  const text = result.stdout.trim();
  return text || `(git ${result.argv.join(' ')} produced no output)`;
}
