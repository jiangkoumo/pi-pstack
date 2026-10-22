import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEGRADED_LIMITATIONS,
  TOOL_NAME,
  TLC_MISSING_WARNING,
  buildSandboxProfile,
  capabilityFromSandbox,
  createTlcVerificationTool,
  createVerificationTool,
  detectSandbox,
  detectTlc,
  getVerificationCapability,
  parseTlcRequest,
  parseVerificationCommand,
  renderTlcResult,
  renderVerificationResult,
  runTlcVerification,
  runVerification,
} from '../extensions/pstack/verification-exec.mjs';
import { parseConfig, tlcJarPathFromConfig } from '../extensions/pstack/runtime.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sandbox = await detectSandbox();

test('required OS sandbox coverage fails instead of accepting fallback', () => {
  if (process.env.PSTACK_VERIFY_REQUIRE_SANDBOX === '1') {
    assert.equal(sandbox.available, true, `OS sandbox required: ${sandbox.reason}`);
  } else {
    assert.equal(typeof sandbox.available, 'boolean');
  }
});

function gitFixture(t, files) {
  return (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pstack-verify-fixture-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git(['init', '-b', 'main']);
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
    return dir;
  })();
}

// The verifier itself must never be pointed at the package checkout from its
// own suite: `npm test` there would re-enter this file and recurse.
function assertIsolatedFixture(cwd) {
  const value = resolve(cwd);
  assert.notEqual(value, root, `refusing to execute a test command in the package repository: ${value}`);
  assert.ok(value.startsWith(resolve(tmpdir()) + sep), `refusing to execute outside the temporary test root: ${value}`);
  assert.ok(value.includes('pstack-verify-fixture-'), `refusing to execute in an unrecognized fixture: ${value}`);
}

async function runFixture(command, options) {
  assertIsolatedFixture(options.cwd);
  return runVerification(command, options);
}

const ESCAPE_SCRIPT = `
import { writeFileSync } from 'node:fs';
import { connect } from 'node:net';

const token = process.env.PSTACK_ESCAPE_TOKEN;
const port = Number(process.env.PSTACK_ESCAPE_PORT);
const attempts = [];
try {
  writeFileSync('../escaped-' + token + '.txt', 'escaped');
  attempts.push('WRITE_OUTSIDE:allowed');
} catch (error) {
  attempts.push('WRITE_OUTSIDE:blocked:' + error.code);
}
try {
  writeFileSync('inside-' + token + '.txt', 'escaped');
  attempts.push('WRITE_INSIDE:allowed');
} catch (error) {
  attempts.push('WRITE_INSIDE:blocked:' + error.code);
}
await new Promise(resolvePromise => {
  const socket = connect(port, '127.0.0.1');
  socket.setTimeout(2000);
  socket.on('connect', () => { attempts.push('NET:allowed'); socket.destroy(); resolvePromise(); });
  socket.on('timeout', () => { attempts.push('NET:timeout'); socket.destroy(); resolvePromise(); });
  socket.on('error', error => { attempts.push('NET:blocked:' + error.code); resolvePromise(); });
});
console.log(attempts.join('\\n'));
`;

const DESCENDANT_SCRIPT = `
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.HEARTBEAT, 'parent');
spawn(process.execPath, ['-e', 'const fs = require("fs"); setInterval(() => fs.appendFileSync(process.env.HEARTBEAT, "x"), 100);'], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
setInterval(() => {}, 1000);
`;

test('parser refuses shell composition, redirection, inline code, push, installs and network tools', () => {
  const refused = [
    ['echo hi > out.txt', /Shell composition/],
    ['npm test >> log.txt', /Shell composition/],
    ['npm test 2>&1', /Shell composition/],
    ['npm test && touch pwned', /Shell composition/],
    ['npm test; touch pwned', /Shell composition/],
    ['npm test | tee out.txt', /Shell composition/],
    ['npm test $(whoami)', /Shell composition/],
    ['npm test `whoami`', /Shell composition/],
    ['npm test\ntouch pwned', /single line/],
    ['git push origin main', /Only git status/],
    ['git commit -m x', /Only git status/],
    ['git fetch', /Only git status/],
    ['git -c core.pager=cat log', /Only git status/],
    ['git diff --output=/tmp/x', /read-only whitelist/],
    ['git show --ext-diff HEAD', /read-only whitelist/],
    ['npm install left-pad', /Only `npm test`/],
    ['npm publish', /Only `npm test`/],
    ['npm run postinstall', /Only `npm test`/],
    ['npm run test -- --watch', /Only `npm test`/],
    ['npx vitest', /Only npm, node/],
    ['curl https://example.com', /Only npm, node/],
    ['wget https://example.com', /Only npm, node/],
    ['sh -c "npm test"', /Shell composition|Only npm, node/],
    ['bash -c "npm test"', /Shell composition|Only npm, node/],
    ['env FOO=bar npm test', /Only npm, node/],
    ['node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"', /Shell composition/],
    ['node -p "process.env.HOME"', /Shell composition/],
    ['node --input-type=module -e "x"', /Shell composition|Inline evaluation/],
    ['node --require ./hook.mjs script.mjs', /Inline evaluation/],
    ['node --test ../outside.test.mjs', /Unsafe node --test/],
    ['node --test scripts/ok.test.mjs --watch', /Unsafe node --test/],
    ['node /etc/passwd.js', /repository \.js/],
  ];
  for (const [command, reason] of refused) {
    const parsed = parseVerificationCommand(command);
    assert.equal(parsed.ok, false, `expected refusal: ${command}`);
    assert.match(parsed.reason, reason, command);
  }
});

test('parser accepts the bounded verification grammar', () => {
  const accepted = [
    ['npm test', ['test'], 'test'],
    ['npm run lint', ['run', 'lint'], 'npm-script'],
    ['npm run build', ['run', 'build'], 'npm-script'],
    ['npm run check:p3', ['run', 'check:p3'], 'npm-script'],
    ['node --test scripts/verification-exec.test.mjs', ['--test', 'scripts/verification-exec.test.mjs'], 'node-test'],
    ['node --test', ['--test'], 'node-test'],
    ['node --check extensions/pstack/verification-exec.mjs', ['--check', 'extensions/pstack/verification-exec.mjs'], 'node-check'],
    ['node scripts/probe.mjs', ['scripts/probe.mjs'], 'node-script'],
    ['git status --porcelain', ['status', '--porcelain'], 'git-read-only'],
    ['git diff --stat main...HEAD', ['diff', '--stat', 'main...HEAD'], 'git-read-only'],
    ['git log --oneline -n 20', ['log', '--oneline', '-n', '20'], 'git-read-only'],
    ['git show --stat HEAD', ['show', '--stat', 'HEAD'], 'git-read-only'],
    ['git rev-parse --verify HEAD', ['rev-parse', '--verify', 'HEAD'], 'git-read-only'],
    ['git rev-parse --show-toplevel', ['rev-parse', '--show-toplevel'], 'git-read-only'],
    ['git diff -- README.md', ['diff', '--', 'README.md'], 'git-read-only'],
  ];
  for (const [command, argv, category] of accepted) {
    const parsed = parseVerificationCommand(command);
    assert.equal(parsed.ok, true, `${command}: ${parsed.reason ?? ''}`);
    assert.deepEqual(parsed.argv, argv, command);
    assert.equal(parsed.category, category, command);
  }
});

test('seatbelt profile denies network and non-scratch writes', () => {
  const profile = buildSandboxProfile('/private/tmp/pstack-verify-example');
  assert.match(profile, /^\(deny network\*\)$/m);
  assert.match(profile, /^\(deny file-write\*\)$/m);
  assert.match(profile, /\(subpath "\/private\/tmp\/pstack-verify-example"\)/);
  assert.doesNotMatch(profile, /subpath "\/Users\//);
});

test('the test harness refuses to execute against the package repository', () => {
  assert.throws(() => assertIsolatedFixture(root), /package repository/);
});

test('capability query reports the real boundary and degraded limitations', async () => {
  const degraded = await getVerificationCapability({ sandbox: { available: false, kind: 'linux-bwrap', reason: 'bwrap unavailable in test' } });
  assert.equal(degraded.isolation, 'degraded-worktree');
  assert.equal(degraded.degraded, true);
  assert.match(degraded.warning, /NOT an OS sandbox/);
  assert.match(degraded.responsibleParty, /responsible/);
  assert.deepEqual(degraded.limitations, [...DEGRADED_LIMITATIONS]);
  assert.ok(degraded.limitations.some(line => line.includes('network: not blocked')));
  assert.ok(degraded.limitations.some(line => line.includes('node_modules')));
  const sandboxed = capabilityFromSandbox({ available: true, kind: 'macos-seatbelt', enforcement: 'seatbelt test' });
  assert.equal(sandboxed.isolation, 'os-sandbox');
  assert.equal(sandboxed.degraded, false);
  assert.deepEqual(sandboxed.limitations, []);
});

test('without an OS sandbox, a real npm test runs in a labeled degraded workspace', async t => {
  const passing = await gitFixture(t, {
    'package.json': JSON.stringify({ name: 'verify-degraded-pass', version: '1.0.0', private: true, scripts: { test: 'node pass.mjs' } }),
    'pass.mjs': 'import { writeFileSync } from "node:fs"; writeFileSync("artifact.txt", "workspace"); console.log("DEGRADED_FIXTURE_PASS");\n',
  });
  const result = await runFixture('npm test', {
    cwd: passing,
    sandbox: { available: false, kind: 'linux-bwrap', reason: 'bwrap unavailable in test' },
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.degraded, true);
  assert.equal(result.isolation, 'degraded-worktree');
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /DEGRADED_FIXTURE_PASS/);
  assert.match(result.enforcement, /NOT an OS sandbox/);
  assert.match(result.warning, /network access is not blocked/);
  assert.match(result.responsibleParty, /responsible/);
  assert.deepEqual(result.limitations, [...DEGRADED_LIMITATIONS]);
  assert.ok(['temporary-git-worktree', 'temporary-git-checkout'].includes(result.workspace), result.workspace);
  assert.equal(existsSync(join(passing, 'artifact.txt')), false, 'the source fixture must not receive the command write');
  assert.match(renderVerificationResult(result), /^ISOLATION: degraded-worktree$/m);
  assert.match(renderVerificationResult(result), /^LIMITATION: network: not blocked/m);

  const failing = await gitFixture(t, {
    'package.json': JSON.stringify({ name: 'verify-degraded-fail', version: '1.0.0', private: true, scripts: { test: 'node fail.mjs' } }),
    'fail.mjs': 'process.exit(7);\n',
  });
  const failed = await runFixture('npm test', {
    cwd: failing,
    sandbox: { available: false, kind: 'linux-bwrap', reason: 'bwrap unavailable in test' },
  });
  assert.equal(failed.ok, true, failed.reason);
  assert.equal(failed.degraded, true);
  assert.equal(failed.exitCode, 7);
  assert.equal(failed.status, 'failed');
  assert.match(renderVerificationResult(failed), /^EXIT CODE: 7$/m);
});

test('degraded workspace includes current tracked and untracked changes', async t => {
  const dir = await gitFixture(t, {
    'package.json': JSON.stringify({ name: 'verify-degraded-change', version: '1.0.0', private: true, scripts: { test: 'node feature.mjs && node untracked.mjs' } }),
    'feature.mjs': 'console.log("COMMITTED");\n',
  });
  await writeFile(join(dir, 'feature.mjs'), 'console.log("UNCOMMITTED_TRACKED");\n');
  await writeFile(join(dir, 'untracked.mjs'), 'console.log("UNCOMMITTED_UNTRACKED");\n');
  const result = await runFixture('npm test', {
    cwd: dir,
    sandbox: { available: false, kind: 'linux-bwrap', reason: 'bwrap unavailable in test' },
  });
  assert.equal(result.ok, true, result.reason);
  assert.match(result.stdout, /UNCOMMITTED_TRACKED/);
  assert.match(result.stdout, /UNCOMMITTED_UNTRACKED/);
});

test('degraded execution explicitly reports omitted Git-ignored files', async t => {
  const dir = await gitFixture(t, {
    '.gitignore': 'ignored.txt\n',
    'package.json': JSON.stringify({ scripts: { test: 'node check.mjs' } }),
    'check.mjs': 'import { existsSync } from "node:fs"; console.log("IGNORED=" + existsSync("ignored.txt"));',
  });
  await writeFile(join(dir, 'ignored.txt'), 'local-only');
  const result = await runFixture('npm test', { cwd: dir, sandbox: { available: false, reason: 'forced unavailable' } });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /IGNORED=false/);
  assert(result.limitations.some(line => /Git-ignored files.*omitted/.test(line)));
});

test('a non-Git cwd is refused instead of silently running without a workspace copy', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pstack-verify-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'verify-not-git', version: '1.0.0', private: true, scripts: { test: 'node pass.mjs' } }));
  await writeFile(join(dir, 'pass.mjs'), 'console.log("SHOULD_NOT_RUN");\n');
  const result = await runFixture('npm test', {
    cwd: dir,
    sandbox: { available: false, kind: 'linux-bwrap', reason: 'bwrap unavailable in test' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unavailable');
  assert.match(result.reason, /degraded workspace could not be prepared/);
});

test('refused commands render as REFUSED with the parser reason', () => {
  const result = { ok: false, status: 'refused', reason: 'git push is not allowed' };
  assert.match(renderVerificationResult(result), /^REFUSED: git push is not allowed/);
});

test('tool definition is the registration contract for the host', () => {
  const definition = createVerificationTool();
  assert.equal(definition.name, TOOL_NAME);
  assert.equal(definition.parameters.required[0], 'command');
  assert.equal(definition.parameters.additionalProperties, false);
  assert.equal(typeof definition.execute, 'function');
});

test('executes read-only git in the configured boundary and reports a real exit code', async t => {
  const dir = await gitFixture(t, { 'tracked.txt': 'content\n' });
  const result = await runFixture('git status --porcelain', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
  if (sandbox.available) {
    assert.equal(result.isolation, 'os-sandbox');
    assert.equal(result.sandbox, sandbox.kind);
    assert.match(result.enforcement, /network denied|network namespace/);
  } else {
    assert.equal(result.isolation, 'degraded-worktree');
    assert.match(result.warning, /NOT an OS sandbox/);
  }
});

test('executes npm test in a fixture and reports exit code 0', async t => {
  const dir = await gitFixture(t, {
    'package.json': JSON.stringify({ name: 'verify-pass', version: '1.0.0', private: true, scripts: { test: 'node pass.mjs' } }),
    'pass.mjs': 'console.log("FIXTURE_PASS");\n',
  });
  const result = await runFixture('npm test', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'passed');
  assert.match(result.stdout, /FIXTURE_PASS/);
});

test('reports a failing npm test exit code without treating it as launch failure', async t => {
  const dir = await gitFixture(t, {
    'package.json': JSON.stringify({ name: 'verify-fail', version: '1.0.0', private: true, scripts: { test: 'node fail.mjs' } }),
    'fail.mjs': 'process.exit(7);\n',
  });
  const result = await runFixture('npm test', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 7);
  assert.equal(result.status, 'failed');
  assert.match(renderVerificationResult(result), /^EXIT CODE: 7$/m);
});

test('a malicious npm script cannot write outside scratch or reach the network when the OS sandbox is active', async t => {
  if (!sandbox.available) {
    assert.equal((await getVerificationCapability({ sandbox })).degraded, true);
    t.diagnostic(`OS sandbox unavailable; degraded behavior is covered by the explicit fallback tests: ${sandbox.reason}`);
    return;
  }
  const token = `escape-${process.pid}-${Date.now()}`;
  let connections = 0;
  const server = createServer(socket => { connections += 1; socket.destroy(); });
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  try {
    const dir = await gitFixture(t, {
      'package.json': JSON.stringify({ name: 'verify-escape', version: '1.0.0', private: true, scripts: { test: 'node escape.mjs' } }),
      'escape.mjs': ESCAPE_SCRIPT,
    });
    const result = await runFixture('npm test', {
      cwd: dir,
      env: { PSTACK_ESCAPE_TOKEN: token, PSTACK_ESCAPE_PORT: port },
    });
    assert.equal(result.ok, true, result.reason);
    assert.match(result.stdout, /WRITE_OUTSIDE:blocked:/);
    assert.match(result.stdout, /WRITE_INSIDE:blocked:/);
    assert.match(result.stdout, /NET:blocked:/);
    assert.doesNotMatch(result.stdout, /:allowed/);
    assert.equal(connections, 0, 'the sandboxed script must not reach the local server');
    assert.equal(existsSync(join(dir, '..', `escaped-${token}.txt`)), false);
    assert.equal(existsSync(join(dir, `inside-${token}.txt`)), false);
    assert.equal(result.exitCode, 0, 'the script catches blocked attempts and exits 0; effects are still contained');
  } finally {
    await new Promise(resolvePromise => server.close(resolvePromise));
  }
});

test('a malicious direct node script cannot write outside scratch or reach the network when the OS sandbox is active', async t => {
  if (!sandbox.available) {
    assert.equal((await getVerificationCapability({ sandbox })).degraded, true);
    t.diagnostic(`OS sandbox unavailable; degraded behavior is covered by the explicit fallback tests: ${sandbox.reason}`);
    return;
  }
  const token = `node-escape-${process.pid}-${Date.now()}`;
  let connections = 0;
  const server = createServer(socket => { connections += 1; socket.destroy(); });
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  try {
    const dir = await gitFixture(t, { 'escape.mjs': ESCAPE_SCRIPT });
    const result = await runFixture('node escape.mjs', {
      cwd: dir,
      env: { PSTACK_ESCAPE_TOKEN: token, PSTACK_ESCAPE_PORT: port },
    });
    assert.equal(result.ok, true, result.reason);
    assert.match(result.stdout, /WRITE_OUTSIDE:blocked:/);
    assert.match(result.stdout, /WRITE_INSIDE:blocked:/);
    assert.match(result.stdout, /NET:blocked:/);
    assert.equal(connections, 0);
    assert.equal(existsSync(join(dir, '..', `escaped-${token}.txt`)), false);
    assert.equal(existsSync(join(dir, `inside-${token}.txt`)), false);
  } finally {
    await new Promise(resolvePromise => server.close(resolvePromise));
  }
});

test('allows builds to write inside the private scratch directory', async t => {
  const dir = await gitFixture(t, {
    'probe.mjs': `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(process.env.TMPDIR, 'scratch-proof.txt'), 'ok');
console.log('SCRATCH_WRITE:ok');
`,
  });
  const result = await runFixture('node probe.mjs', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /SCRATCH_WRITE:ok/);
});

test('caps captured output by bytes for multi-byte text', async t => {
  const dir = await gitFixture(t, {
    'unicode.mjs': 'process.stdout.write("汉".repeat(4000));\n',
  });
  const result = await runFixture('node unicode.mjs', { cwd: dir, maxOutputBytes: 1024 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.outputTruncated, true);
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 1024, `captured ${Buffer.byteLength(result.stdout, 'utf8')} bytes`);
});

test('timeout kills the whole process tree, not only the direct child', async t => {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'pstack-verify-tree-')));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const heartbeat = join(scratch, 'heartbeat.log');
  const dir = await gitFixture(t, {
    'tree.mjs': DESCENDANT_SCRIPT,
  });
  const result = await runFixture('node tree.mjs', {
    cwd: dir,
    scratchDir: scratch,
    env: { HEARTBEAT: heartbeat },
    timeoutMs: 600,
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 'timed-out');
  assert.ok(result.durationMs < 4000, `timeout settled after ${result.durationMs}ms`);
  const first = (await stat(heartbeat)).size;
  await new Promise(resolvePromise => setTimeout(resolvePromise, 400));
  const second = (await stat(heartbeat)).size;
  assert.equal(second, first, 'a descendant survived the timeout and kept writing');
});

test('times out a long-running command and reports it as not passed', async t => {
  const dir = await gitFixture(t, {
    'sleep.mjs': 'setTimeout(() => process.exit(0), 10000);\n',
  });
  const result = await runFixture('node sleep.mjs', { cwd: dir, timeoutMs: 500 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 'timed-out');
  assert.equal(result.exitCode, null);
  assert.match(renderVerificationResult(result), /killed after the timeout/);
});

// --- Restricted TLC entry -------------------------------------------------
// The stub below stands in for `java`. It exists to check the whitelist, argv,
// boundary, timeout and output cap plumbing. It is NOT a TLC run and nothing
// here is evidence about real formal verification. The optional test further
// down runs real TLC when the operator configured tla2tools.jar.
const STUB_JAVA = [
  '#!/bin/sh',
  'if [ "$1" = "-version" ]; then',
  '  printf \'openjdk version "%s" 2026-01-01\\n\' "${PSTACK_STUB_JAVA_VERSION:-21.0.4}" >&2',
  '  exit 0',
  'fi',
  'if [ -n "$PSTACK_STUB_TLC_SLEEP" ]; then sleep "$PSTACK_STUB_TLC_SLEEP"; fi',
  'echo "STUB_JAVA_SELF: $0"',
  'echo "STUB_TLC_ARGS: $*"',
  'echo "TLC2 Version 2.19 of 2025"',
  'if [ -n "$PSTACK_STUB_TLC_NOISE" ]; then',
  '  i=0',
  '  while [ "$i" -lt "$PSTACK_STUB_TLC_NOISE" ]; do echo "TLC_TRACE_LINE_PADDING_PADDING_PADDING"; i=$((i+1)); done',
  'fi',
  'if [ "${PSTACK_STUB_TLC_TOOL_ERROR:-}" = "1" ]; then',
  '  echo "Error: Parsing or semantic analysis failed."',
  'fi',
  'if [ "${PSTACK_STUB_TLC_VIOLATION:-}" = "1" ]; then',
  '  echo "Error: Invariant Safety is violated."',
  'fi',
  'if [ "${PSTACK_STUB_TLC_EXIT:-0}" != "0" ]; then',
  '  exit "$PSTACK_STUB_TLC_EXIT"',
  'fi',
  'if [ "${PSTACK_STUB_TLC_INCOMPLETE:-}" != "1" ]; then',
  '  echo "Model checking completed. No error has been found."',
  'fi',
  'exit 0',
  '',
].join('\n');

const TLC_SPEC_FILES = {
  'spec.tla': [
    '---- MODULE Counter ----',
    'EXTENDS Naturals',
    'VARIABLE x',
    'Init == x = 0',
    "Next == x < 5 /\\ x' = x + 1",
    'Inv == x >= 0',
    '====',
    '',
  ].join('\n'),
  'spec.cfg': 'INIT Init\nNEXT Next\nINVARIANT Inv\n',
  'spec.txt': 'not a TLA+ spec\n',
  'other.cfg': 'INIT Init\n',
};

// A stub `java` on PATH plus a jar file the operator could have configured.
async function tlcFixture(t, files = TLC_SPEC_FILES) {
  const dir = await gitFixture(t, files);
  const bin = join(dir, 'bin');
  const jar = join(dir, 'tla2tools.jar');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'java'), STUB_JAVA, { mode: 0o755 });
  await writeFile(jar, 'stub jar, not a real TLA+ toolkit\n');
  return { dir, bin, jar };
}

function stubEnv(bin, extra = {}) {
  return { PATH: `${bin}:${process.env.PATH ?? ''}`, ...extra };
}

async function stubJavaBin(t) {
  const bin = await mkdtemp(join(tmpdir(), 'pstack-tlc-stub-'));
  t.after(() => rm(bin, { recursive: true, force: true }));
  await writeFile(join(bin, 'java'), STUB_JAVA, { mode: 0o755 });
  return bin;
}

test('arbitrary java invocations are refused; the restricted TLC entry is the only java path', async t => {
  for (const command of ['java -version', 'java -jar tla2tools.jar spec.tla', 'java -Xmx1g tlc2.TLC spec.tla']) {
    const parsed = parseVerificationCommand(command);
    assert.equal(parsed.ok, false, command);
    assert.match(parsed.reason, /restricted TLC runner/);
  }
  const { dir } = await tlcFixture(t);
  const result = await runFixture('java -jar tla2tools.jar spec.tla', { cwd: dir });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /restricted TLC runner/);
});

test('TLC capability reports missing or too-old java and a missing jar instead of pretending to verify', async t => {
  const noJava = await detectTlc({ env: { PATH: join(tmpdir(), 'pstack-no-java-on-this-path') } });
  assert.equal(noJava.available, false);
  assert.equal(noJava.formal, 'none');
  assert.match(noJava.java.reason, /not found on PATH/);
  assert.match(noJava.reason, /tla2tools\.jar/);
  assert.match(noJava.warning, /未做形式化验证，原因是缺少 TLC/);
  assert.equal(noJava.fallback.kind, 'generated-input-tests');
  assert.equal(noJava.fallback.formal, false);

  const noJar = await detectTlc({ env: { PATH: process.env.PATH ?? '' } });
  assert.equal(noJar.available, false);
  assert.equal(noJar.jar.configured, false);
  assert.match(noJar.jar.reason, /no tla2tools\.jar is configured/);

  const bin = await stubJavaBin(t);
  const old = await detectTlc({ env: { PATH: `${bin}:${process.env.PATH ?? ''}`, PSTACK_STUB_JAVA_VERSION: '1.8.0_402' } });
  assert.equal(old.java.available, false);
  assert.equal(old.java.major, 8);
  assert.equal(old.java.minimumMajor, 11);
  assert.match(old.java.reason, /older than Java 11/);
  assert.equal(old.available, false);
});

test('a run without TLC returns an explicit no-formal-verification result and the generated-input fallback', async t => {
  const { dir } = await tlcFixture(t);
  const result = await runTlcVerification({ spec: 'spec.tla', config: 'spec.cfg' }, {
    cwd: dir,
    env: { PATH: process.env.PATH ?? '' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.formalVerification, 'not-performed');
  assert.match(result.reason, /未做形式化验证，原因是缺少 TLC/);
  assert.equal(result.warning, TLC_MISSING_WARNING);
  assert.equal(result.fallback.kind, 'generated-input-tests');
  assert.equal(result.fallback.formal, false);
  const rendered = renderTlcResult(result);
  assert.match(rendered, /^FORMAL VERIFICATION: not performed$/m);
  assert.match(rendered, /未做形式化验证，原因是缺少 TLC/);
  assert.match(rendered, /^FALLBACK: generated-input tests against the real code/m);
  assert.match(rendered, /not a formal verification pass/);
  assert.match(rendered, /^SKIPPED: TLC did not run/m);
  assert.doesNotMatch(rendered, /^STATUS: passed$/m);
});

test('the TLC entry refuses option injection, non-repository paths and symlink escapes', async t => {
  const outside = await mkdtemp(join(tmpdir(), 'pstack-tlc-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'outside.tla'), '---- MODULE Outside ----\n====\n');
  await writeFile(join(outside, 'outside.cfg'), 'INIT Init\n');
  const { dir } = await tlcFixture(t);
  await symlink(join(outside, 'outside.tla'), join(dir, 'linked.tla'));
  await symlink(join(outside, 'outside.cfg'), join(dir, 'linked.cfg'));
  const refused = [
    [{ spec: 'spec.tla', config: 'spec.cfg', options: ['-javaoptions', '-Dx=y'] }, /not in the restricted whitelist/],
    [{ spec: 'spec.tla', config: 'spec.cfg', options: ['-metadir', '/tmp/elsewhere'] }, /not in the restricted whitelist/],
    [{ spec: 'spec.tla', config: 'spec.cfg', options: ['-workers', '4; rm -rf /'] }, /Shell composition/],
    [{ spec: 'spec.tla', config: 'spec.cfg', options: ['-config', 'other.cfg'] }, /not accepted inside options/],
    [{ spec: 'spec.tla', config: 'spec.cfg', options: ['-depth', 'ten'] }, /requires a numeric value/],
    [{ spec: 'spec.tla', config: 'spec.cfg', options: '-cleanup' }, /must be an array/],
    [{ spec: 'spec.tla', config: 'spec.cfg', jar: join(outside, 'other.jar') }, /Unknown TLC request field/],
    [{ spec: '../outside.tla', config: 'spec.cfg' }, /must stay inside the repository/],
    [{ spec: 'linked.tla', config: 'spec.cfg' }, /resolves outside the repository/],
    [{ spec: 'spec.tla', config: 'linked.cfg' }, /resolves outside the repository/],
    [{ spec: 'spec.txt', config: 'spec.cfg' }, /must be a \.tla file/],
    [{ spec: 'spec.tla', config: 'spec.txt' }, /must be a \.cfg file/],
    [{ spec: 'spec.tla', config: 'missing.cfg' }, /does not exist/],
  ];
  for (const [request, reason] of refused) {
    const parsed = await parseTlcRequest(request, { root: dir });
    assert.equal(parsed.ok, false, JSON.stringify(request));
    assert.match(parsed.reason, reason, JSON.stringify(request));
  }
  const accepted = await parseTlcRequest({ spec: 'spec.tla', config: 'spec.cfg', options: ['-cleanup', '-workers', 'auto', '-depth', '12'] }, { root: dir });
  assert.equal(accepted.ok, true, accepted.reason);
  assert.deepEqual(accepted.options, ['-cleanup', '-workers', 'auto', '-depth', '12']);
  assert.equal(accepted.spec.relative, 'spec.tla');
  assert.equal(accepted.config.relative, 'spec.cfg');
});

test('a simulated TLC run uses the configured jar and the whitelisted argv inside the boundary', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const result = await runTlcVerification(
    { spec: 'spec.tla', config: 'spec.cfg', options: ['-cleanup', '-workers', '4'] },
    { cwd: dir, env: stubEnv(bin, { TLA2TOOLS_JAR: jar }) },
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
  assert.equal(result.formalVerification, 'performed');
  assert.equal(result.tlc.outcome, 'passed');
  assert.equal(result.tlc.completed, true);
  assert.equal(result.tlc.toolError, null);
  assert.equal(result.tlc.jar, await realpath(jar));
  assert.equal(result.tlc.java, await realpath(join(bin, 'java')));
  assert.ok(['os-sandbox', 'degraded-worktree'].includes(result.isolation), result.isolation);
  const rendered = renderTlcResult(result);
  assert.match(rendered, /^FORMAL VERIFICATION: performed \(TLC\)$/m);
  assert.match(rendered, /^FORMAL OUTCOME: passed$/m);
  const echoed = result.stdout.split('\n').find(line => line.startsWith('STUB_TLC_ARGS: '));
  assert.ok(echoed, result.stdout);
  // The executed java must be the binary the capability probe checked, not a
  // PATH lookup that could resolve elsewhere.
  const self = result.stdout.split('\n').find(line => line.startsWith('STUB_JAVA_SELF: '));
  assert.equal(self, `STUB_JAVA_SELF: ${await realpath(join(bin, 'java'))}`, result.stdout);
  assert.match(echoed, /-cleanup -workers 4 -config /);
  assert.match(echoed, /-metadir /);
  assert.match(echoed, /-Djava\.io\.tmpdir=/);
  assert.ok(echoed.includes(`-jar ${await realpath(jar)}`), echoed);
  assert.match(echoed, /spec\.tla$/);
  assert.doesNotMatch(echoed, /[;&|`$()]/);
});

test('a simulated TLC run in the degraded workspace resolves spec and config inside the temporary copy', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const result = await runTlcVerification({ spec: 'spec.tla', config: 'spec.cfg' }, {
    cwd: dir,
    sandbox: { available: false, kind: 'linux-bwrap', reason: 'bwrap unavailable in test' },
    env: stubEnv(bin, { TLA2TOOLS_JAR: jar }),
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.isolation, 'degraded-worktree');
  assert.equal(result.degraded, true);
  assert.equal(result.status, 'passed');
  assert.match(result.warning, /NOT an OS sandbox/);
  const echoed = result.stdout.split('\n').find(line => line.startsWith('STUB_TLC_ARGS: '));
  assert.ok(echoed, result.stdout);
  assert.ok(echoed.includes(`/${result.workspace === 'temporary-git-worktree' ? 'worktree' : 'checkout'}/`), echoed);
  assert.ok(!echoed.includes(` ${dir}/spec.cfg`), 'the degraded run must not read the source checkout paths');
  assert.match(echoed, /-metadir .*tlc-metadir/);
});

test('a simulated TLC invariant violation returns a non-zero exit and is never reported as a pass', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const result = await runTlcVerification(
    { spec: 'spec.tla', config: 'spec.cfg' },
    { cwd: dir, env: stubEnv(bin, { TLA2TOOLS_JAR: jar, PSTACK_STUB_TLC_EXIT: '12', PSTACK_STUB_TLC_VIOLATION: '1' }) },
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 12);
  assert.equal(result.tlc.outcome, 'invariant-violated');
  const rendered = renderTlcResult(result);
  assert.match(rendered, /^FORMAL OUTCOME: invariant-violated$/m);
  assert.match(rendered, /do not weaken the property/);
  assert.doesNotMatch(rendered, /^STATUS: passed$/m);
});

test('a -continue style exit 0 with a violated invariant is a failure, not a pass (simulated java)', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const result = await runTlcVerification({ spec: 'spec.tla', config: 'spec.cfg' }, {
    cwd: dir,
    env: stubEnv(bin, { TLA2TOOLS_JAR: jar, PSTACK_STUB_TLC_VIOLATION: '1' }),
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 0, 'the real exit code must be preserved');
  assert.equal(result.status, 'failed');
  assert.equal(result.tlc.outcome, 'invariant-violated');
  assert.equal(result.tlc.completed, true);
  const rendered = renderTlcResult(result);
  assert.match(rendered, /^FORMAL OUTCOME: invariant-violated$/m);
  assert.match(rendered, /^STATUS: failed$/m);
  assert.match(rendered, /^EXIT CODE: 0$/m);
  assert.match(rendered, /must not be read as success/);
  assert.doesNotMatch(rendered, /^STATUS: passed$/m);
});

test('an exit 0 run with another TLC error or without completion is not a formal pass (simulated java)', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const toolError = await runTlcVerification({ spec: 'spec.tla', config: 'spec.cfg' }, {
    cwd: dir,
    env: stubEnv(bin, { TLA2TOOLS_JAR: jar, PSTACK_STUB_TLC_TOOL_ERROR: '1' }),
  });
  assert.equal(toolError.ok, true, toolError.reason);
  assert.equal(toolError.exitCode, 0);
  assert.equal(toolError.status, 'failed');
  assert.equal(toolError.tlc.outcome, 'error');
  assert.match(toolError.tlc.toolError, /Parsing or semantic analysis failed/);
  assert.doesNotMatch(renderTlcResult(toolError), /^STATUS: passed$/m);

  const incomplete = await runTlcVerification({ spec: 'spec.tla', config: 'spec.cfg' }, {
    cwd: dir,
    env: stubEnv(bin, { TLA2TOOLS_JAR: jar, PSTACK_STUB_TLC_INCOMPLETE: '1' }),
  });
  assert.equal(incomplete.ok, true, incomplete.reason);
  assert.equal(incomplete.exitCode, 0);
  assert.equal(incomplete.status, 'failed');
  assert.equal(incomplete.tlc.outcome, 'incomplete');
  assert.equal(incomplete.tlc.completed, false);
  const rendered = renderTlcResult(incomplete);
  assert.match(rendered, /^FORMAL OUTCOME: incomplete$/m);
  assert.match(rendered, /stopped before "Model checking completed\.", so its findings are incomplete/);
  assert.doesNotMatch(rendered, /^STATUS: passed$/m);
});

test('the restricted TLC run starts the java binary the capability probe resolved, even through a symlink', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const real = join(bin, 'java-real');
  await rename(join(bin, 'java'), real);
  await symlink(real, join(bin, 'java'));
  const result = await runTlcVerification({ spec: 'spec.tla', config: 'spec.cfg' }, {
    cwd: dir,
    env: stubEnv(bin, { TLA2TOOLS_JAR: jar }),
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.tlc.java, await realpath(real));
  const self = result.stdout.split('\n').find(line => line.startsWith('STUB_JAVA_SELF: '));
  assert.equal(self, `STUB_JAVA_SELF: ${await realpath(real)}`, result.stdout);
  assert.notEqual(self, `STUB_JAVA_SELF: ${join(bin, 'java')}`);
});

test('TLC runs keep the shared timeout and output caps (simulated java)', async t => {
  const { dir, bin, jar } = await tlcFixture(t);
  const timedOut = await runTlcVerification(
    { spec: 'spec.tla', config: 'spec.cfg' },
    { cwd: dir, env: stubEnv(bin, { TLA2TOOLS_JAR: jar, PSTACK_STUB_TLC_SLEEP: '5' }), timeoutMs: 700 },
  );
  assert.equal(timedOut.ok, true, timedOut.reason);
  assert.equal(timedOut.status, 'timed-out');
  assert.equal(timedOut.exitCode, null);
  assert.equal(timedOut.tlc.outcome, 'incomplete');
  assert.match(renderTlcResult(timedOut), /killed after the timeout/);

  const capped = await runTlcVerification(
    { spec: 'spec.tla', config: 'spec.cfg' },
    { cwd: dir, env: stubEnv(bin, { TLA2TOOLS_JAR: jar, PSTACK_STUB_TLC_NOISE: '2000' }), maxOutputBytes: 512 },
  );
  assert.equal(capped.ok, true, capped.reason);
  assert.equal(capped.outputTruncated, true);
  assert.ok(Buffer.byteLength(capped.stdout, 'utf8') <= 512, `captured ${Buffer.byteLength(capped.stdout, 'utf8')} bytes`);
});

test('pstack.json can declare the jar path and strict validation still rejects unknown fields', async t => {
  assert.equal(tlcJarPathFromConfig(parseConfig({ version: 1, roles: {}, tla: { tla2toolsJar: '/opt/tla2tools.jar' } })), '/opt/tla2tools.jar');
  assert.equal(tlcJarPathFromConfig(parseConfig({ version: 1, roles: {} })), undefined);
  assert.throws(() => parseConfig({ version: 1, roles: {}, tla: { jar: '/opt/tla2tools.jar' } }), /tla\.jar: unknown field/);
  assert.throws(() => parseConfig({ version: 1, roles: {}, tla: { tla2toolsJar: '' } }), /non-empty path string/);
  assert.throws(() => parseConfig({ version: 1, roles: {}, tla: 'nope' }), /tla: expected an object/);
  assert.throws(() => parseConfig({ version: 1, roles: {}, extra: true }), /unknown field extra/);

  const { bin, jar } = await tlcFixture(t);
  const configured = parseConfig({ version: 1, roles: {}, tla: { tla2toolsJar: jar } });
  const capability = await detectTlc({ config: configured, env: stubEnv(bin) });
  assert.equal(capability.available, true, capability.reason);
  assert.equal(capability.jar.source, 'pstack.json:tla.tla2toolsJar');
  assert.equal(capability.jar.path, await realpath(jar));
  assert.equal(capability.java.major >= 11, true);

  const conflict = await detectTlc({ config: configured, env: stubEnv(bin, { TLA2TOOLS_JAR: '/other/tla2tools.jar' }) });
  assert.equal(conflict.available, false);
  assert.match(conflict.reason, /conflicting tla2tools\.jar paths/);

  const relative = await detectTlc({ config: parseConfig({ version: 1, roles: {}, tla: { tla2toolsJar: 'vendor/tla2tools.jar' } }), env: stubEnv(bin) });
  assert.equal(relative.available, false);
  assert.match(relative.jar.reason, /expected an absolute path/);
});

test('the TLC tool definition is a separate registration contract and reports the fallback at tool level', async t => {
  const definition = createTlcVerificationTool();
  assert.equal(definition.name, 'tlc_verify');
  assert.deepEqual(definition.parameters.required, ['spec', 'config']);
  assert.equal(definition.parameters.additionalProperties, false);
  assert.equal(typeof definition.execute, 'function');
  assert.throws(() => createTlcVerificationTool({ loadConfig: 'nope' }), /loadConfig must be a function/);

  const { dir } = await tlcFixture(t);
  const previous = process.env.TLA2TOOLS_JAR;
  const previousAlias = process.env.TLA2TOOLS;
  delete process.env.TLA2TOOLS_JAR;
  delete process.env.TLA2TOOLS;
  try {
    const outcome = await definition.execute('call-1', { spec: 'spec.tla', config: 'spec.cfg' }, undefined, undefined, { cwd: dir });
    assert.equal(outcome.details.formalVerification, 'not-performed');
    assert.equal(outcome.details.fallback, 'generated-input-tests');
    assert.match(outcome.content[0].text, /未做形式化验证，原因是缺少 TLC/);
  } finally {
    if (previous !== undefined) process.env.TLA2TOOLS_JAR = previous;
    if (previousAlias !== undefined) process.env.TLA2TOOLS = previousAlias;
  }
});

test('the TLC tool consumes an injected pstack.json loader per execution and reports a loader failure as a refusal', async t => {
  const { dir } = await tlcFixture(t);
  const previous = process.env.TLA2TOOLS_JAR;
  const previousAlias = process.env.TLA2TOOLS;
  delete process.env.TLA2TOOLS_JAR;
  delete process.env.TLA2TOOLS;
  try {
    const configuredJar = join(dir, 'missing-tla2tools.jar');
    let calls = 0;
    const withConfig = createTlcVerificationTool({
      loadConfig: async () => {
        calls += 1;
        return parseConfig({ version: 1, roles: {}, tla: { tla2toolsJar: configuredJar } });
      },
    });
    const injected = await withConfig.execute('call-a', { spec: 'spec.tla', config: 'spec.cfg' }, undefined, undefined, { cwd: dir });
    assert.equal(calls, 1);
    assert.equal(injected.details.formalVerification, 'not-performed');
    assert.match(injected.details.reason, /missing-tla2tools\.jar/);
    assert.doesNotMatch(injected.details.reason, /no tla2tools\.jar is configured/);
    await withConfig.execute('call-b', { spec: 'spec.tla', config: 'spec.cfg' }, undefined, undefined, { cwd: dir });
    assert.equal(calls, 2, 'the loader must be read per execution');

    const failing = createTlcVerificationTool({
      loadConfig: async () => { throw new Error('roles.code.model: fuzzy is not available'); },
    });
    const failed = await failing.execute('call-c', { spec: 'spec.tla', config: 'spec.cfg' }, undefined, undefined, { cwd: dir });
    assert.equal(failed.details.ok, false);
    assert.equal(failed.details.status, 'refused');
    assert.equal(failed.details.formalVerification, 'not-performed');
    assert.match(failed.content[0].text, /^REFUSED: pstack\.json could not be loaded/m);
    assert.doesNotMatch(failed.content[0].text, /TLC is missing|未做形式化验证/);
  } finally {
    if (previous !== undefined) process.env.TLA2TOOLS_JAR = previous;
    if (previousAlias !== undefined) process.env.TLA2TOOLS = previousAlias;
  }
});

test('a real TLC run on a minimal spec passes, and an invariant violation returns non-zero', async t => {
  const capability = await detectTlc();
  if (!capability.available) {
    const reason = `real TLC did not run: 未做形式化验证，原因是缺少 TLC (${capability.reason}). Set TLA2TOOLS_JAR to a tla2tools.jar with Java 11+ to run this test; this package never downloads it.`;
    t.diagnostic(reason);
    console.error(`\n[verification-exec] SKIPPED ${reason}\n`);
    if (process.env.PSTACK_TLC_REQUIRE === '1') assert.fail(reason);
    t.skip(reason);
    return;
  }
  t.diagnostic(`real TLC available: java ${capability.java.version}, jar ${capability.jar.path}`);
  // TLC requires the module name to match the file base name, so the files are
  // Pass.tla / Fail.tla. Next always has a successor (an explicit stutter at the
  // bound), so a pass proves the invariant and not the absence of a deadlock.
  const files = {
    'Pass.tla': ['---- MODULE Pass ----', 'EXTENDS Naturals', 'VARIABLE x', 'Init == x = 0', "Next == (x < 5 /\\ x' = x + 1) \\/ (x = 5 /\\ UNCHANGED x)", 'Inv == x >= 0', '====', ''].join('\n'),
    'Pass.cfg': 'INIT Init\nNEXT Next\nINVARIANT Inv\n',
    'Fail.tla': ['---- MODULE Fail ----', 'EXTENDS Naturals', 'VARIABLE x', 'Init == x = 0', "Next == (x < 5 /\\ x' = x + 1) \\/ (x = 5 /\\ UNCHANGED x)", 'Inv == x < 3', '====', ''].join('\n'),
    'Fail.cfg': 'INIT Init\nNEXT Next\nINVARIANT Inv\n',
  };
  const dir = await gitFixture(t, files);
  const passing = await runTlcVerification({ spec: 'Pass.tla', config: 'Pass.cfg', options: ['-cleanup'] }, { cwd: dir, capability });
  assert.equal(passing.ok, true, passing.reason);
  assert.equal(passing.status, 'passed', `${passing.stdout}\n${passing.stderr}`);
  assert.equal(passing.tlc.outcome, 'passed');

  const failing = await runTlcVerification({ spec: 'Fail.tla', config: 'Fail.cfg', options: ['-cleanup'] }, { cwd: dir, capability });
  assert.equal(failing.ok, true, failing.reason);
  assert.notEqual(failing.exitCode, 0);
  assert.equal(failing.status, 'failed');
  assert.equal(failing.tlc.outcome, 'invariant-violated');
  assert.match(renderTlcResult(failing), /^FORMAL OUTCOME: invariant-violated$/m);
});
