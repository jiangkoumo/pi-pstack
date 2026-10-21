/**
 * Pi publication gate for pstack's opening-a-pr contract.
 *
 * Policy source: upstream pstack `skills/poteto-mode/playbooks/opening-a-pr.md`
 * (pinned f713f14203cd6420cec13cd7c55c32d598dbab68), MIT, Copyright (c) 2026
 * Lauren Tan. The enforcement code, command parser and receipt store are Pi
 * additions; they do not change the upstream prose contract.
 *
 * The gate inspects the request before `git commit` and `gh pr create` run:
 * it never executes git, gh, a shell or model code. It blocks the tool call
 * when a title is not `type(scope): subject`, when a body is missing a heading
 * or puts one out of the fixed order, or when a reported test count cannot be
 * traced to the last recorded run of that command.
 *
 * A body with the fixed headings is required for `gh pr create`. For
 * `git commit`, only the title is checked: ordinary commit bodies may carry
 * `Fixes #12` and other prose without the PR headings. `requireCommitBody`
 * opts into the stricter PR-shaped commit body. The receipt store lives in the
 * Git directory so it never appears in the working tree.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TITLE_TYPES = Object.freeze([
  'feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'build', 'ci', 'style', 'revert',
]);
export const REQUIRED_SECTIONS = Object.freeze(['Why', 'What changed', 'Scope', 'Blast Radius', 'Verification']);
export const SECTION_ORDER = Object.freeze(['Why', 'What changed', 'Scope', 'Tradeoffs', 'Blast Radius', 'Verification']);
export const RECEIPT_VERSION = 1;
export const MAX_RECEIPTS = 50;

const TITLE = /^([a-z]+)(\(([^()\s]+)\))(!)?: (\S.*)$/;
const HEADING = /^##[ \t]+(.+?)[ \t]*$/;
const PLACEHOLDER = /^<[^<>\n]+>$/;
const PLACEHOLDER_WORD = /\b(?:TODO|TBD|CHANGEME)\b/;
const TEST_TYPES = new Set(['test', 'check']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const WRAPPERS = new Set(['sudo', 'command', 'exec', 'time', 'nohup', 'builtin']);
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SUDO_VALUE_OPTIONS = new Set(['-u', '-g', '-p', '-h', '-C', '-T', '-r', '-t', '-U']);
const ENV_VALUE_OPTIONS = new Set(['-u', '--unset', '-C', '--chdir', '-S', '--split-string']);
const COMMIT_VALUE_OPTIONS = new Set([
  '-C', '--reuse-message', '-c', '--reedit-message', '-t', '--template', '--fixup', '--squash',
]);
const GIT_GLOBAL_VALUE_OPTIONS = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path',
]);
const RAW_COMMIT = /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace|super-prefix|config-env|exec-path)=\S+|--no-pager|--no-replace-objects|--no-optional-locks|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|-p))*\s+commit\b/;
const RAW_PR = /\bgh\b[^\n;&|)]*\bpr\b[^\n;&|)]*\bcreate\b/;

/** Read at most `limit` bytes; refusal is explicit rather than a silent partial read. */
function readText(path, limit = 1024 * 1024) {
  let info;
  try { info = statSync(path); }
  catch { throw new Error(`cannot read ${path}: file does not exist`); }
  if (!info.isFile()) throw new Error(`cannot read ${path}: not a regular file`);
  if (info.size > limit) throw new Error(`cannot read ${path}: file is larger than ${limit} bytes`);
  return readFileSync(path, 'utf8');
}

// ---------------------------------------------------------------------------
// Title and body contract
// ---------------------------------------------------------------------------

/** Return every reason `title` is not Conventional Commits `type(scope): subject`. */
export function validateTitle(title) {
  if (typeof title !== 'string' || !title.trim()) return ['title is empty'];
  if (/[\r\n]/.test(title)) return ['title must be one line'];
  const problems = [];
  const value = title.trim();
  if (value !== title) problems.push('title must not start or end with whitespace');
  if (/[.!?]$/.test(value)) problems.push(`title must not end with a period or punctuation; got ${JSON.stringify(value)}`);
  const match = value.match(TITLE);
  if (!match) {
    return [...problems, `title must match Conventional Commits \`type(scope): subject\`; got ${JSON.stringify(value)}`];
  }
  const [, type, , scope, bang, subject] = match;
  if (!TITLE_TYPES.includes(type)) {
    problems.push(`title type ${JSON.stringify(type)} is not one of ${TITLE_TYPES.join(', ')}`);
  }
  if (!/^[a-z0-9][a-z0-9._/-]*$/.test(scope)) {
    problems.push(`title scope ${JSON.stringify(scope)} must be a lowercase area such as pstack or poteto-mode`);
  }
  if (bang) problems.push('breaking-change markers are not part of this gate; state the break in ## Blast Radius');
  if (!/\S/.test(subject) || PLACEHOLDER.test(subject) || PLACEHOLDER_WORD.test(subject)) {
    problems.push('title subject must be concrete text without template placeholders');
  }
  return problems;
}

/** Split a Markdown body into level-2 sections, preserving line numbers. */
export function parseBodySections(body) {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  const problems = [];
  let current = null;
  let fence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && line.startsWith('#')) {
      const heading = line.match(HEADING);
      if (!heading) {
        problems.push(`line ${index + 1}: headings must use \`## Heading\` with one space; got ${JSON.stringify(line)}`);
        continue;
      }
      current = { heading: heading[1].trim(), line: index + 1, content: [] };
      sections.push(current);
      continue;
    }
    if (current) current.content.push(line);
  }
  for (const section of sections) section.text = section.content.join('\n').trim();
  return { sections, problems };
}

function isEmptyOrPlaceholder(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return 'empty';
  if (lines.every(line => PLACEHOLDER.test(line) || PLACEHOLDER_WORD.test(line))) return 'placeholder';
  return null;
}

/**
 * Validate a PR or commit body against the fixed opening-a-pr contract.
 * `receipts` is the recorded run store; when omitted, test-count claims fail
 * closed because they cannot be traced to an actual run.
 */
export function validateBody(body, { receipts } = {}) {
  const { sections, problems } = parseBodySections(body);
  const seen = new Set();
  const known = new Set(SECTION_ORDER);
  let cursor = 0;
  for (const section of sections) {
    const { heading } = section;
    if (!known.has(heading)) {
      problems.push(`## ${heading} is not part of the fixed order (${SECTION_ORDER.join(', ')})`);
      continue;
    }
    if (seen.has(heading)) problems.push(`## ${heading} appears more than once`);
    seen.add(heading);
    const order = SECTION_ORDER.indexOf(heading);
    if (order < cursor) problems.push(`## ${heading} is out of order; expected ${SECTION_ORDER.join(' → ')}`);
    else cursor = order + 1;
    if (section.text === '') {
      if (heading !== 'Tradeoffs') problems.push(`## ${heading} must not be empty; keep the heading and state why there is nothing to report`);
      continue;
    }
    const empty = isEmptyOrPlaceholder(section.text);
    if (empty === 'placeholder') problems.push(`## ${heading} still contains a template placeholder`);
    else if (empty === 'empty' && heading !== 'Tradeoffs') problems.push(`## ${heading} must not be empty`);
  }
  for (const heading of REQUIRED_SECTIONS) {
    if (!seen.has(heading)) problems.push(`body is missing required heading ## ${heading}`);
  }
  const verification = sections.find(section => section.heading === 'Verification');
  if (verification?.text) problems.push(...validateCountClaims(verification.text, receipts));
  return problems;
}

// ---------------------------------------------------------------------------
// Test-count traceability
// ---------------------------------------------------------------------------

function normalizeCommand(command) {
  return String(command ?? '').replace(/\s+/g, ' ').trim();
}

function commandTokens(command) {
  const parsed = tokenize(command);
  return parsed.error ? null : parsed.tokens;
}

/** Commands match only when their argv tokens match exactly, including test filters. */
function sameCommand(cited, run) {
  const citedTokens = commandTokens(cited);
  if (!citedTokens?.length) return false;
  const runTokens = Array.isArray(run?.argv) ? run.argv : commandTokens(run?.command);
  if (!runTokens?.length || runTokens.length !== citedTokens.length) return false;
  return runTokens.every((token, index) => token === citedTokens[index]);
}

/** Extract the first backticked or plain test command from one line. */
export function citedTestCommand(line) {
  const spans = [...String(line).matchAll(/`([^`\n]+)`/g)].map(match => match[1]);
  for (const span of spans) {
    if (/\b(?:npm|pnpm|yarn|bun|npx|node)\b/.test(span) && /(?:test|check|lint)/.test(span)) return normalizeCommand(span);
  }
  const plain = String(line).match(/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[\w:.-]+|\bnode\s+--test\b[^\n]*/);
  return plain ? normalizeCommand(plain[0]) : null;
}

/** Extract the test numbers a verification line claims. */
export function extractCountClaims(line) {
  const text = String(line);
  const claims = {};
  let match;
  if ((match = text.match(/(\d+)\s*\/\s*(\d+)/))) {
    claims.pass = Number(match[1]);
    claims.tests = Number(match[2]);
  }
  if ((match = text.match(/\b(\d+)\s+(?:tests?|test cases|passing)\b/i))) claims.tests ??= Number(match[1]);
  if ((match = text.match(/\b(?:tests?|test cases)\s*[:=]?\s*(\d+)/i))) claims.tests ??= Number(match[1]);
  if ((match = text.match(/\bpass(?:ed)?\s*[:=]?\s*(\d+)/i))) claims.pass ??= Number(match[1]);
  if ((match = text.match(/\b(\d+)\s+pass(?:ed)?\b/i))) claims.pass ??= Number(match[1]);
  if ((match = text.match(/\bfail(?:ed)?\s*[:=]?\s*(\d+)/i))) claims.fail ??= Number(match[1]);
  if ((match = text.match(/\b(\d+)\s+fail(?:ed)?\b/i))) claims.fail ??= Number(match[1]);
  if ((match = text.match(/\bskip(?:ped)?\s*[:=]?\s*(\d+)/i))) claims.skipped ??= Number(match[1]);
  if ((match = text.match(/\b(\d+)\s+skip(?:ped)?\b/i))) claims.skipped ??= Number(match[1]);
  return claims;
}

function hasClaims(claims) {
  return Object.keys(claims).length > 0;
}

function latestRun(receipts, cited) {
  const list = Array.isArray(receipts) ? receipts : [];
  const matches = cited ? list.filter(run => sameCommand(cited, run)) : list;
  return matches.length ? matches[matches.length - 1] : null;
}

function validateCountClaims(text, receipts) {
  const problems = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const claims = extractCountClaims(line);
    if (!hasClaims(claims)) continue;
    const cited = citedTestCommand(line);
    const latest = latestRun(receipts, cited);
    if (!latest) {
      const missing = cited ? `recorded run of \`${cited}\`` : 'recorded test run';
      problems.push(`Verification reports test counts (${line}) but there is no ${missing}; run the command first so the gate can record it`);
      continue;
    }
    const scope = cited ? `the last recorded \`${cited}\` run` : 'the last recorded test run';
    for (const field of ['tests', 'pass', 'fail', 'skipped']) {
      if (claims[field] === undefined) continue;
      if (latest[field] === undefined) {
        problems.push(`Verification claims ${claims[field]} ${field} but ${scope} did not record ${field}`);
        continue;
      }
      if (latest[field] === claims[field]) continue;
      const older = (Array.isArray(receipts) ? receipts : [])
        .filter(run => (!cited || sameCommand(cited, run)) && run[field] === claims[field] && run !== latest)
        .pop();
      problems.push(older
        ? `Verification reuses a stale test count: ${claims[field]} ${field} belongs to an older \`${latest.command}\` run; the last run reported ${latest[field]} ${field}`
        : `Verification claims ${claims[field]} ${field} but ${scope} reported ${latest[field]}; use the actual result`);
    }
  }
  return problems;
}

/** Parse the test summary Node prints for one or more `node --test` processes. */
export function parseTestCounts(output) {
  const totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  let recorded = false;
  const add = (field, value) => { totals[field] += value; recorded = true; };
  for (const line of String(output ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const tap = line.match(/^#\s*(tests|pass|fail|skipped|cancelled|todo)\s+(\d+)\s*$/);
    const spec = line.match(/^ℹ\s*(tests|pass|fail|skipped|cancelled|todo)\s+(\d+)\s*$/u);
    const match = tap ?? spec;
    if (match && match[1] in totals) add(match[1], Number(match[2]));
    const passing = line.match(/^(\d+)\s+passing\b/);
    if (passing) { add('tests', Number(passing[1])); add('pass', Number(passing[1])); }
    const failing = line.match(/^(\d+)\s+failing\b/);
    if (failing) add('fail', Number(failing[1]));
  }
  return recorded ? totals : null;
}

const REDIRECTION = /^(?:&>|\d*[<>])/;

/** Return every exact test invocation in a command, in order. */
export function testInvocationsOf(command) {
  const invocations = [];
  const { segments } = splitSegments(String(command ?? ''));
  for (const segment of segments) {
    const parsed = tokenize(segment);
    if (parsed.error) continue;
    const tokens = stripWrappers(parsed.tokens);
    const cut = tokens.findIndex(token => REDIRECTION.test(token));
    const argv = cut === -1 ? tokens : tokens.slice(0, cut);
    if (!argv.length) continue;
    const head = basename(argv[0]);
    if (head === 'node' && argv.slice(1).some(token => token === '--test')) {
      invocations.push({ command: normalizeCommand(argv.join(' ')), argv });
      continue;
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(head)) {
      const runIndex = argv[1] === 'run' ? 2 : 1;
      const script = argv[runIndex];
      if (['test', 'check'].includes(script) || script?.startsWith('check:') || script?.startsWith('test:')) {
        invocations.push({ command: normalizeCommand(argv.join(' ')), argv });
      }
    }
  }
  return invocations;
}

/** Return the recorded command text when a segment actually runs tests. */
export function testCommandOf(command) {
  return testInvocationsOf(command)[0]?.command ?? null;
}

/** Resolve the receipt store, keeping it out of the working tree. */
export function defaultReceiptPath(cwd) {
  const dotGit = join(cwd, '.git');
  if (!existsSync(dotGit)) return temporaryReceiptPath(cwd);
  const info = statSync(dotGit);
  if (info.isDirectory()) return join(dotGit, 'pstack-publication-receipts.json');
  if (!info.isFile()) return temporaryReceiptPath(cwd);
  const first = readFileSync(dotGit, 'utf8').split('\n')[0];
  const link = first.match(/^gitdir:\s*(.+?)\s*$/);
  if (!link) return temporaryReceiptPath(cwd);
  const gitDir = resolve(cwd, link[1]);
  const inside = relative(cwd, gitDir);
  // A linked worktree keeps its gitdir in the main repository, which may be
  // outside the sandbox or workspace the agent may write. Keep the store in a
  // per-checkout temp directory instead of failing closed on every publication.
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return temporaryReceiptPath(cwd);
  return join(gitDir, 'pstack-publication-receipts.json');
}

function temporaryReceiptPath(cwd) {
  const key = createHash('sha1').update(resolve(cwd)).digest('hex').slice(0, 12);
  return join(tmpdir(), 'pstack-publication', `${key}-receipts.json`);
}

export function readReceipts(path) {
  if (!path || !existsSync(path)) return { version: RECEIPT_VERSION, runs: [] };
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || parsed.version !== RECEIPT_VERSION || !Array.isArray(parsed.runs)) {
    throw new Error(`receipt store ${path} has an unknown shape`);
  }
  return parsed;
}

function writeReceipts(path, store) {
  if (!path) throw new Error('no receipt path is available outside a Git repository');
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n');
  try { renameSync(temporary, path); }
  catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

/**
 * Append one actual test run. The run is recorded even when it failed: the next
 * publication must not claim an older green count as the latest result.
 */
export function recordTestRun({ command, output, ok = true, at = new Date().toISOString(), cwd = process.cwd(), receiptPath = defaultReceiptPath(cwd) } = {}) {
  const invocations = testInvocationsOf(command);
  // One bash command with several test runs would mix their summaries into one
  // receipt; require each run to be its own command so the count stays exact.
  if (invocations.length !== 1) return null;
  const [invocation] = invocations;
  const counts = parseTestCounts(output);
  if (!counts) return null;
  const run = { command: invocation.command, argv: invocation.argv, ok: Boolean(ok), at, ...counts };
  const store = readReceipts(receiptPath);
  store.runs.push(run);
  if (store.runs.length > MAX_RECEIPTS) store.runs = store.runs.slice(-MAX_RECEIPTS);
  writeReceipts(receiptPath, store);
  return run;
}

// ---------------------------------------------------------------------------
// Shell request parsing
// ---------------------------------------------------------------------------

/** Split a shell command on unquoted control operators; quote bodies stay intact. */
export function splitSegments(text) {
  const segments = [];
  let buffer = '';
  let quote = null;
  let escaped = false;
  const source = String(text ?? '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { buffer += char; escaped = false; continue; }
    if (quote) {
      buffer += char;
      if (char === '\\' && quote !== "'") { escaped = true; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '\\') { buffer += char; escaped = true; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; buffer += char; continue; }
    if (char === '\n' || char === ';' || char === '|') {
      segments.push(buffer); buffer = '';
      if (char === '|' && source[index + 1] === '|') index += 1;
      continue;
    }
    if (char === '&') {
      const next = source[index + 1];
      const previous = source[index - 1];
      const standalone = next === '&' || previous === undefined || /[\s;|]/.test(previous);
      if (standalone) {
        segments.push(buffer); buffer = '';
        if (next === '&') index += 1;
        continue;
      }
    }
    buffer += char;
  }
  segments.push(buffer);
  return { segments: segments.map(segment => segment.trim()).filter(Boolean), unterminated: Boolean(quote || escaped) };
}

/** Tokenize one segment, removing shell quotes and honoring escapes. */
export function tokenize(segment) {
  const tokens = [];
  let buffer = '';
  let quote = null;
  let escaped = false;
  let started = false;
  const push = () => { if (started || buffer) { tokens.push(buffer); buffer = ''; started = false; } };
  for (const char of String(segment ?? '')) {
    if (escaped) { buffer += char; escaped = false; started = true; continue; }
    if (quote === "'") {
      if (char === "'") quote = null; else buffer += char;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\') escaped = true;
      else buffer += char;
      started = true;
      continue;
    }
    if (quote === '`') {
      if (char === '`') quote = null; else buffer += char;
      started = true;
      continue;
    }
    if (char === '\\') { escaped = true; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; started = true; continue; }
    if (/\s/.test(char)) { push(); continue; }
    buffer += char;
    started = true;
  }
  if (quote) return { error: 'unterminated quote' };
  if (escaped) return { error: 'trailing escape' };
  push();
  return { tokens };
}

function stripWrappers(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (ENV_ASSIGNMENT.test(token)) { index += 1; continue; }
    if (!WRAPPERS.has(token)) break;
    index += 1;
    if (token === 'sudo' || token === 'env') {
      const withValue = token === 'sudo' ? SUDO_VALUE_OPTIONS : ENV_VALUE_OPTIONS;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === '--') { index += 1; break; }
        if (!option.startsWith('-')) break;
        index += withValue.has(option) ? 2 : 1;
      }
    }
    while (index < tokens.length && ENV_ASSIGNMENT.test(tokens[index])) index += 1;
  }
  return tokens.slice(index);
}

function subcommandAfterGlobals(tokens, globals) {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') return { index: index + 1, command: tokens[index + 1] };
    if (!token.startsWith('-')) return { index, command: token };
    if (globals.has(token)) { index += 2; continue; }
    if ([...globals].some(option => option.startsWith('--') && token.startsWith(option + '='))) { index += 1; continue; }
    index += 1;
  }
  return { index, command: undefined };
}

function valueAfter(tokens, index, flag, inlinePrefix) {
  const token = tokens[index];
  if (token === flag) return { value: tokens[index + 1], next: index + 2 };
  if (inlinePrefix && token.startsWith(inlinePrefix)) return { value: token.slice(inlinePrefix.length), next: index + 1 };
  return null;
}

function parseCommitArgs(args, cwd) {
  const problems = [];
  const messages = [];
  let messageFile = null;
  let unverifiable = null;
  let reusesExistingMessage = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') break;
    if (token === '--help' || token === '-h') return { request: null };
    if (token === '-m' || token === '--message') {
      if (args[index + 1] === undefined) { problems.push('`git commit -m` needs a message'); index += 1; continue; }
      messages.push(args[index + 1]); index += 1; continue;
    }
    if (token.startsWith('--message=')) { messages.push(token.slice('--message='.length)); continue; }
    if (token.startsWith('-m') && token.length > 2) { messages.push(token.slice(2)); continue; }
    const file = valueAfter(args, index, '-F', '--file=');
    const shortFile = token.startsWith('-F') && token.length > 2 ? { value: token.slice(2), next: index + 1 } : file;
    if (shortFile) {
      if (shortFile.value === undefined) { problems.push('`git commit -F` needs a file path'); index += 1; continue; }
      messageFile = shortFile.value; index = shortFile.next - 1; continue;
    }
    if (token === '--file') {
      if (args[index + 1] === undefined) { problems.push('`git commit --file` needs a file path'); index += 1; continue; }
      messageFile = args[index + 1]; index += 1; continue;
    }
    if (token === '--amend' || token === '--no-edit') {
      reusesExistingMessage = true;
      continue;
    }
    if (token === '-e' || token === '--edit') {
      if (!unverifiable) unverifiable = `\`git commit ${token}\` opens an editor the gate cannot verify`;
      continue;
    }
    if (COMMIT_VALUE_OPTIONS.has(token)) {
      if (!unverifiable) unverifiable = `\`git commit ${token}\` reuses a message the gate cannot verify; pass -m or -F`;
      index += 1; continue;
    }
    if (token.startsWith('--fixup=') || token.startsWith('--squash')) {
      if (!unverifiable) unverifiable = '`git commit --fixup/--squash` writes an automatic message the gate cannot verify';
      continue;
    }
    if (token.startsWith('--reuse-message=') || token.startsWith('--reedit-message=') || token.startsWith('--template=')) {
      if (!unverifiable) unverifiable = `\`git commit ${token.split('=')[0]}\` reuses a message the gate cannot verify; pass -m or -F`;
      continue;
    }
    if (token === '--allow-empty-message') { problems.push('an empty commit message is not publishable'); continue; }
    if (/^-[A-Za-z]+$/.test(token) && !token.startsWith('--')) {
      const short = token.slice(1);
      if (short.includes('m')) {
        if (args[index + 1] === undefined) { problems.push('`git commit -m` needs a message'); index += 1; continue; }
        messages.push(args[index + 1]); index += 1; continue;
      }
      if (short.includes('F')) {
        if (args[index + 1] === undefined) { problems.push('`git commit -F` needs a file path'); index += 1; continue; }
        messageFile = args[index + 1]; index += 1; continue;
      }
      if (short.includes('C') || short.includes('c')) {
        if (!unverifiable) unverifiable = '`git commit -C/-c` reuses a message the gate cannot verify; pass -m or -F';
      }
      if (short.includes('e')) {
        if (!unverifiable) unverifiable = '`git commit -e` opens an editor the gate cannot verify';
      }
    }
  }
  if (reusesExistingMessage && !messages.length && !messageFile) {
    unverifiable ??= '`git commit --amend/--no-edit` keeps an existing message the gate cannot verify; pass -m or -F';
  }
  if (unverifiable) problems.push(unverifiable);
  if (messageFile && messages.length) problems.push('pass either -m/--message or -F/--file, not both');
  let message = messages.join('\n\n');
  if (messageFile) {
    if (messageFile === '-') problems.push('`git commit -F -` reads stdin, which the gate cannot verify; use a file');
    else {
      try { message = readText(resolve(cwd, messageFile)); }
      catch (error) { problems.push(error.message); }
    }
  }
  if (!messageFile && messages.length === 0) {
    problems.push('`git commit` has no verifiable message; pass -m/--message or -F/--file');
  }
  return { request: { kind: 'commit', message, cwd }, problems };
}

function parsePrArgs(args, cwd) {
  const problems = [];
  let title;
  let body;
  let bodyFile;
  let filled = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--help' || token === '-h') return { request: null };
    if (token === '--fill' || token === '-f' || token === '--fill-first' || token === '--fill-verbose' || token === '--web' || token === '-w') {
      filled = true;
      continue;
    }
    const titleFlag = token === '--title' ? { value: args[++index], next: index + 1 } : valueAfter(args, index, '-t', '--title=');
    if (titleFlag) { title = titleFlag.value; index = titleFlag.next - 1; continue; }
    if (token.startsWith('-t') && token.length > 2 && !token.startsWith('--')) { title = token.slice(2); continue; }
    const bodyFlag = token === '--body' ? { value: args[++index], next: index + 1 } : valueAfter(args, index, '-b', '--body=');
    if (bodyFlag) { body = bodyFlag.value; index = bodyFlag.next - 1; continue; }
    if (token.startsWith('-b') && token.length > 2 && !token.startsWith('--')) { body = token.slice(2); continue; }
    const bodyFileFlag = token === '--body-file' ? { value: args[++index], next: index + 1 } : valueAfter(args, index, '-F', '--body-file=');
    if (bodyFileFlag) { bodyFile = bodyFileFlag.value; index = bodyFileFlag.next - 1; continue; }
    if (token.startsWith('-F') && token.length > 2 && !token.startsWith('--')) { bodyFile = token.slice(2); continue; }
  }
  if (filled) problems.push('`gh pr create --fill/--web` derives the title and body from commits or an editor the gate cannot verify; pass --title and --body-file');
  if (title === undefined) problems.push('`gh pr create` needs --title');
  if (body !== undefined && bodyFile !== undefined) problems.push('pass either --body or --body-file, not both');
  if (body === undefined && bodyFile === undefined && !filled) problems.push('`gh pr create` has no verifiable body; pass --body or --body-file');
  let text = body;
  if (bodyFile !== undefined) {
    if (bodyFile === '-') problems.push('`gh pr create --body-file -` reads stdin, which the gate cannot verify; use a file');
    else {
      try { text = readText(resolve(cwd, bodyFile)); }
      catch (error) { problems.push(error.message); }
    }
  }
  return { request: { kind: 'pr', title, body: text, cwd }, problems };
}

function requestFromTokens(tokens, cwd) {
  const head = basename(tokens[0]);
  if (head === 'git') {
    const { index, command } = subcommandAfterGlobals(tokens, GIT_GLOBAL_VALUE_OPTIONS);
    if (command !== 'commit') return { request: null };
    return parseCommitArgs(tokens.slice(index + 1), cwd);
  }
  if (head === 'gh') {
    let index = tokens.findIndex((token, position) => position > 0 && token === 'pr' && tokens[position + 1] === 'create');
    if (index === -1) index = tokens.findIndex((token, position) => position > 0 && token === 'pr');
    if (index === -1) return { request: null };
    if (tokens[index + 1] !== 'create') return { request: null };
    return parsePrArgs(tokens.slice(index + 2), cwd);
  }
  return { request: null };
}

function parseSegment(segment, cwd) {
  const parsed = tokenize(segment);
  if (parsed.error) return { requests: [], problems: [], recurse: [], error: parsed.error };
  const tokens = stripWrappers(parsed.tokens);
  if (!tokens.length) return { requests: [], problems: [], recurse: [] };
  const head = basename(tokens[0]);
  if (SHELLS.has(head)) {
    const flagIndex = tokens.findIndex((token, position) => position > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(token));
    if (flagIndex !== -1 && tokens[flagIndex + 1] !== undefined) {
      return { requests: [], problems: [], recurse: [tokens.slice(flagIndex + 1).join(' ')] };
    }
  }
  if (head === 'eval') return { requests: [], problems: [], recurse: [tokens.slice(1).join(' ')] };
  if (head === 'xargs') {
    let index = 1;
    while (index < tokens.length && tokens[index].startsWith('-')) index += 1;
    if (tokens[index] !== undefined) return { requests: [], problems: [], recurse: [tokens.slice(index).join(' ')] };
  }
  if (head !== 'git' && head !== 'gh') return { requests: [], problems: [], recurse: [] };
  const { request, problems = [] } = requestFromTokens(tokens, cwd);
  return { requests: request ? [request] : [], problems, recurse: [] };
}

// ---------------------------------------------------------------------------
// Request evaluation
// ---------------------------------------------------------------------------

function loadReceiptsForInspection({ receipts, receiptPath }) {
  if (Array.isArray(receipts)) return { runs: receipts, error: null };
  try { return { runs: readReceipts(receiptPath).runs, error: null }; }
  catch (error) { return { runs: [], error: error.message }; }
}

function validateRequest(request, runs, { requireCommitBody = false } = {}) {
  const problems = [];
  if (request.kind === 'commit') {
    const lines = String(request.message ?? '').replace(/\r\n/g, '\n').split('\n');
    const title = lines[0] ?? '';
    const body = lines.slice(1).join('\n').trim();
    // Ordinary commit bodies carry Fixes #12 and prose; only the PR body owns
    // the fixed heading contract unless the operator opts into the strict form.
    problems.push(...validateTitle(title));
    if (requireCommitBody) {
      if (body) problems.push(...validateBody(body, { receipts: runs }));
      else problems.push('`git commit` needs a body with the fixed opening-a-pr headings');
    }
    return problems;
  }
  if (request.kind === 'pr') {
    problems.push(...validateTitle(request.title));
    if (typeof request.body !== 'string' || !request.body.trim()) problems.push('`gh pr create` needs a non-empty body');
    else problems.push(...validateBody(request.body, { receipts: runs }));
    return problems;
  }
  return problems;
}

/**
 * Inspect a proposed shell command. Pure: reads the cited body/message files and
 * the receipt store, but never runs git, gh or any part of the command.
 */
export function inspectCommand(command, { cwd = process.cwd(), receipts, receiptPath = defaultReceiptPath(cwd), requireCommitBody = false } = {}) {
  if (typeof command !== 'string' || !command.trim()) return { status: 'allow', requests: [], problems: [] };
  const loaded = loadReceiptsForInspection({ receipts, receiptPath });
  const problems = [];
  const requests = [];
  const queue = [{ text: command, depth: 0 }];
  const seen = new Set();
  let unterminated = false;
  while (queue.length) {
    const { text, depth } = queue.shift();
    const { segments, unterminated: broken } = splitSegments(text);
    unterminated ||= broken;
    if (depth > 3) {
      if (RAW_COMMIT.test(text) || RAW_PR.test(text)) problems.push('nested shell payloads are too deep for the publication gate to verify');
      continue;
    }
    for (const segment of segments) {
      if (seen.has(segment)) continue;
      seen.add(segment);
      const parsed = parseSegment(segment, cwd);
      if (parsed.error) { problems.push(`cannot parse a shell segment (${parsed.error}); rewrite the commit or PR request without it`); continue; }
      for (const request of parsed.requests) requests.push(request);
      for (const reason of parsed.problems) problems.push(reason);
      for (const payload of parsed.recurse) queue.push({ text: payload, depth: depth + 1 });
    }
  }
  if (unterminated) problems.push('the command has an unterminated quote, so the gate cannot verify what will run');
  if (requests.length === 0 && (RAW_COMMIT.test(command) || RAW_PR.test(command))) {
    problems.push('a git commit or gh pr create appears in the command, but the gate cannot isolate a verifiable request; run it without wrappers, substitutions or quoting that hide the arguments');
  }
  if (loaded.error && requests.length) problems.push(`the test receipt store could not be read: ${loaded.error}`);
  for (const request of requests) problems.push(...validateRequest(request, loaded.runs, { requireCommitBody }));
  if (!problems.length) return { status: 'allow', requests: requests.map(({ kind, title, message }) => ({ kind, title, message })), problems: [] };
  const unique = [...new Set(problems)];
  const reason = [
    'Publication gate blocked this request before it ran:',
    ...unique.map(problem => `- ${problem}`),
    'Fix the title/body or rerun the test command so its actual counts are recorded.',
  ].join('\n');
  return { status: 'block', requests, problems: unique, reason };
}

// ---------------------------------------------------------------------------
// Pi wiring and CLI
// ---------------------------------------------------------------------------

/**
 * Register the gate on the host. The main entry only needs:
 *   import { registerPublicationGate } from './publication-gate.mjs';
 *   registerPublicationGate(pi);
 * `enabled` lets a host keep the gate behind poteto-mode; by default it is a
 * mechanical gate that runs whenever the extension is loaded.
 */
export function registerPublicationGate(pi, { enabled = () => true, cwd: fixedCwd, receiptPath, requireCommitBody = false } = {}) {
  pi.on('tool_call', async (event, ctx) => {
    if (!enabled()) return;
    if (event?.toolName !== 'bash' || typeof event?.input?.command !== 'string') return;
    const cwd = fixedCwd ?? ctx?.cwd ?? process.cwd();
    const result = inspectCommand(event.input.command, { cwd, receiptPath: receiptPath ?? defaultReceiptPath(cwd), requireCommitBody });
    if (result.status === 'block') return { block: true, reason: result.reason };
  });
  pi.on('tool_result', async (event, ctx) => {
    if (event?.toolName !== 'bash') return;
    const command = event.input?.command;
    if (typeof command !== 'string') return;
    const cwd = fixedCwd ?? ctx?.cwd ?? process.cwd();
    let output = (event.content ?? []).filter(part => part?.type === 'text').map(part => part.text).join('\n');
    const fullOutputPath = event.details?.fullOutputPath;
    if (typeof fullOutputPath === 'string' && fullOutputPath) {
      try { output = readText(fullOutputPath, 16 * 1024 * 1024); }
      catch { /* fall back to the inline content */ }
    }
    try { recordTestRun({ command, output, ok: !event.isError, cwd, receiptPath: receiptPath ?? defaultReceiptPath(cwd) }); }
    catch { /* recording must never break the tool result */ }
  });
}

const USAGE = [
  'Usage:',
  '  node extensions/pstack/publication-gate.mjs inspect --command "<shell command>"',
  '  node extensions/pstack/publication-gate.mjs check --kind pr|commit --title <title> [--body <text> | --body-file <path>] [--receipt-path <path>]',
  '  node extensions/pstack/publication-gate.mjs record --command "<test command>" --output-file <path> [--failed] [--receipt-path <path>]',
].join('\n');

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument ${token}`);
    const body = token.slice(2);
    const equals = body.indexOf('=');
    if (equals !== -1) flags[body.slice(0, equals)] = body.slice(equals + 1);
    else if (body === 'failed') flags.failed = true;
    else flags[body] = argv[++index];
  }
  return flags;
}

function safeReceiptRuns(path = defaultReceiptPath(process.cwd())) {
  try { return readReceipts(path).runs; }
  catch { return []; }
}

export function main(argv, io = { out: console.log, err: console.error }) {
  const [action, ...rest] = argv;
  let flags;
  try { flags = parseFlags(rest); }
  catch (error) { io.err(error.message); io.err(USAGE); return 2; }
  if (action === 'inspect') {
    if (typeof flags.command !== 'string') { io.err(USAGE); return 2; }
    const result = inspectCommand(flags.command, { receiptPath: flags['receipt-path'] });
    io.out(JSON.stringify({ status: result.status, requests: result.requests.map(({ kind, title, message }) => ({ kind, title, message })), problems: result.problems }, null, 2));
    return result.status === 'allow' ? 0 : 1;
  }
  if (action === 'check') {
    if (!['pr', 'commit'].includes(flags.kind) || typeof flags.title !== 'string') { io.err(USAGE); return 2; }
    if (flags.body !== undefined && flags['body-file'] !== undefined) { io.err('pass either --body or --body-file'); return 2; }
    let body = flags.body;
    if (flags['body-file'] !== undefined) {
      try { body = readText(resolve(flags['body-file'])); }
      catch (error) { io.err(error.message); return 1; }
    }
    const problems = validateTitle(flags.title);
    const runs = safeReceiptRuns(flags['receipt-path']);
    if (flags.kind === 'pr') {
      if (typeof body !== 'string' || !body.trim()) problems.push('`gh pr create` needs a non-empty body');
      else problems.push(...validateBody(body, { receipts: runs }));
    }
    for (const problem of problems) io.err(`- ${problem}`);
    io.out(problems.length ? `${problems.length} problems` : 'publication contract satisfied');
    return problems.length ? 1 : 0;
  }
  if (action === 'record') {
    if (typeof flags.command !== 'string' || typeof flags['output-file'] !== 'string') { io.err(USAGE); return 2; }
    const invocations = testInvocationsOf(flags.command);
    if (invocations.length === 0) { io.err('not a recognized test command'); return 1; }
    if (invocations.length > 1) {
      io.err('refusing to record: this command runs more than one test invocation; run each command separately so its counts cannot mix');
      return 1;
    }
    let output;
    try { output = readText(resolve(flags['output-file'])); }
    catch (error) { io.err(error.message); return 1; }
    const run = recordTestRun({ command: flags.command, output, ok: !flags.failed, receiptPath: flags['receipt-path'] });
    if (!run) { io.err('no test summary found in the output file'); return 1; }
    io.out(JSON.stringify(run, null, 2));
    return 0;
  }
  io.err(USAGE);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
