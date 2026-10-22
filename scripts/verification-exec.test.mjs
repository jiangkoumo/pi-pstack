import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEGRADED_LIMITATIONS,
  TOOL_NAME,
  buildSandboxProfile,
  capabilityFromSandbox,
  createVerificationTool,
  detectSandbox,
  getVerificationCapability,
  parseVerificationCommand,
  renderVerificationResult,
  runVerification,
} from '../extensions/pstack/verification-exec.mjs';

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
