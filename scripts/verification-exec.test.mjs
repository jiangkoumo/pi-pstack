import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOOL_NAME,
  buildSandboxProfile,
  createVerificationTool,
  detectSandbox,
  parseVerificationCommand,
  renderVerificationResult,
  runVerification,
} from '../extensions/pstack/verification-exec.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requireSandbox = process.env.PSTACK_VERIFY_REQUIRE_SANDBOX === '1';
const sandbox = await detectSandbox();

function fixture(t, files) {
  return (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pstack-verify-fixture-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    return dir;
  })();
}

function sandboxTest(name, fn) {
  test(name, async t => {
    if (!sandbox.available) {
      if (requireSandbox) assert.fail(`OS sandbox required but unavailable: ${sandbox.reason}`);
      t.skip(`OS sandbox unavailable: ${sandbox.reason}`);
      return;
    }
    await fn(t);
  });
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

test('an unavailable or unknown sandbox is a refusal, never an argv-only fallback', async () => {
  const unavailable = await runVerification('npm test', { cwd: root, sandbox: { available: false, kind: 'none', reason: 'test has no sandbox' } });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.status, 'unavailable');
  assert.match(unavailable.reason, /refusing to execute repository code/);
  assert.match(renderVerificationResult(unavailable), /^UNAVAILABLE:/);
  const unknown = await runVerification('npm test', { cwd: root, sandbox: { available: true, kind: 'fake-sandbox' } });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, 'unavailable');
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

sandboxTest('executes read-only git under the OS sandbox and reports a real exit code', async () => {
  const result = await runVerification('git status --porcelain', { cwd: root });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.sandbox, sandbox.kind);
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
  assert.match(result.enforcement, /network denied|network namespace/);
});

sandboxTest('executes npm test in a fixture and reports exit code 0', async t => {
  const dir = await fixture(t, {
    'package.json': JSON.stringify({ name: 'verify-pass', version: '1.0.0', private: true, scripts: { test: 'node pass.mjs' } }),
    'pass.mjs': 'console.log("FIXTURE_PASS");\n',
  });
  const result = await runVerification('npm test', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'passed');
  assert.match(result.stdout, /FIXTURE_PASS/);
});

sandboxTest('reports a failing npm test exit code without treating it as launch failure', async t => {
  const dir = await fixture(t, {
    'package.json': JSON.stringify({ name: 'verify-fail', version: '1.0.0', private: true, scripts: { test: 'node fail.mjs' } }),
    'fail.mjs': 'process.exit(7);\n',
  });
  const result = await runVerification('npm test', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 7);
  assert.equal(result.status, 'failed');
  assert.match(renderVerificationResult(result), /^EXIT CODE: 7$/m);
});

sandboxTest('a malicious npm script cannot write outside scratch or reach the network', async t => {
  const token = `escape-${process.pid}-${Date.now()}`;
  let connections = 0;
  const server = createServer(socket => { connections += 1; socket.destroy(); });
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  try {
    const dir = await fixture(t, {
      'package.json': JSON.stringify({ name: 'verify-escape', version: '1.0.0', private: true, scripts: { test: 'node escape.mjs' } }),
      'escape.mjs': ESCAPE_SCRIPT,
    });
    const result = await runVerification('npm test', {
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

sandboxTest('a malicious direct node script cannot write outside scratch or reach the network', async t => {
  const token = `node-escape-${process.pid}-${Date.now()}`;
  let connections = 0;
  const server = createServer(socket => { connections += 1; socket.destroy(); });
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  try {
    const dir = await fixture(t, { 'escape.mjs': ESCAPE_SCRIPT });
    const result = await runVerification('node escape.mjs', {
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

sandboxTest('allows builds to write inside the private scratch directory', async t => {
  const dir = await fixture(t, {
    'probe.mjs': `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(process.env.TMPDIR, 'scratch-proof.txt'), 'ok');
console.log('SCRATCH_WRITE:ok');
`,
  });
  const result = await runVerification('node probe.mjs', { cwd: dir });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /SCRATCH_WRITE:ok/);
});

sandboxTest('caps captured output by bytes for multi-byte text', async t => {
  const dir = await fixture(t, {
    'unicode.mjs': 'process.stdout.write("汉".repeat(4000));\n',
  });
  const result = await runVerification('node unicode.mjs', { cwd: dir, maxOutputBytes: 1024 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.outputTruncated, true);
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 1024, `captured ${Buffer.byteLength(result.stdout, 'utf8')} bytes`);
});

sandboxTest('timeout kills the whole process tree, not only the direct child', async t => {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'pstack-verify-tree-')));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const heartbeat = join(scratch, 'heartbeat.log');
  const dir = await fixture(t, {
    'tree.mjs': DESCENDANT_SCRIPT,
  });
  const result = await runVerification('node tree.mjs', {
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

sandboxTest('times out a long-running command and reports it as not passed', async t => {
  const dir = await fixture(t, {
    'sleep.mjs': 'setTimeout(() => process.exit(0), 10000);\n',
  });
  const result = await runVerification('node sleep.mjs', { cwd: dir, timeoutMs: 500 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 'timed-out');
  assert.equal(result.exitCode, null);
  assert.match(renderVerificationResult(result), /killed after the timeout/);
});
