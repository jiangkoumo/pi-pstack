import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks, CHECK_PLAN, TEST_PLAN } from './run-checks.mjs';

const runner = fileURLToPath(new URL('./run-checks.mjs', import.meta.url));

// Spawn a child that also owns a grandchild, so a plain child.kill() would leave
// a descendant holding the terminal/pipe. The runner must kill the whole tree.
const hangingTree = `
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
writeFileSync(process.env.PID_FILE, process.pid + '\\n' + grandchild.pid + '\\n');
setInterval(() => {}, 1000);
`;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForDead(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise(accept => setTimeout(accept, 50));
  }
  return false;
}

async function fixture(t) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-run-checks-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, pidFile: resolve(directory, 'pids.txt') };
}

test('a timeout is a red result and kills the child process tree', { timeout: 20000 }, async t => {
  const { pidFile } = await fixture(t);
  const summary = await runChecks([{ name: 'hang', command: [process.execPath, ['-e', hangingTree]], env: { PID_FILE: pidFile } }], { timeoutMs: 1000 });
  assert.equal(summary.ok, false);
  assert.equal(summary.failed, 1);
  assert.equal(summary.timedOut, 1);
  const result = summary.results[0];
  assert.equal(result.status, 'timeout');
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
  const pids = (await readFile(pidFile, 'utf8')).trim().split('\n').map(Number);
  assert.equal(pids.length, 2, 'fixture must record the child and grandchild');
  for (const pid of pids) assert.equal(await waitForDead(pid), true, `pid ${pid} must be killed after the timeout`);
});

test('passing checks return exit code 0 and failing checks keep their real code', async () => {
  const passed = await runChecks([{ name: 'ok', command: [process.execPath, ['-e', 'process.exit(0)']] }], { timeoutMs: 5000 });
  assert.equal(passed.ok, true);
  assert.equal(passed.passed, 1);
  assert.equal(passed.failed, 0);
  assert.equal(passed.results[0].status, 'passed');
  assert.equal(passed.results[0].exitCode, 0);

  const failed = await runChecks([{ name: 'bad', command: [process.execPath, ['-e', 'process.exit(7)']] }], { timeoutMs: 5000 });
  assert.equal(failed.ok, false);
  assert.equal(failed.failed, 1);
  assert.equal(failed.results[0].status, 'failed');
  assert.equal(failed.results[0].exitCode, 7);
});

test('the test plan keeps every check plus the upstream fidelity test', () => {
  const checkNames = CHECK_PLAN.map(check => check.name);
  const testNames = TEST_PLAN.map(check => check.name);
  assert.equal(new Set(testNames).size, testNames.length, 'check names must be unique');
  assert.deepEqual(testNames, [...checkNames, 'upstream-fidelity']);
  for (const name of ['run-checks.test.mjs', 'check-abort-state', 'check-parallel-roles', 'test-session-lifecycle.test.mjs']) {
    assert(testNames.includes(name), `test plan must include ${name}`);
  }
  assert.equal(TEST_PLAN.at(-1).name, 'upstream-fidelity', 'fidelity must stay in the npm test chain');
});

test('plan flags stay in the argv array and actually reach the child', async () => {
  for (const name of ['check-p3-agents', 'check-p3-readonly-gate', 'check-parallel-roles']) {
    const [file, args] = CHECK_PLAN.find(check => check.name === name).command;
    assert.equal(file, process.execPath);
    assert.equal(args.at(-1), '--allow-skip', `${name} flag must be an argv entry`);
    assert.equal(args.filter(arg => arg === '--allow-skip').length, 1);
  }
  const summary = await runChecks([{
    name: 'flag',
    command: [process.execPath, ['-e', 'process.exit(process.argv.includes("--allow-skip") ? 0 : 3)', '--', '--allow-skip']],
  }], { timeoutMs: 5000 });
  assert.equal(summary.ok, true, 'the child must receive the flag; otherwise it exits 3');
});

test('interrupting the CLI stops its detached child tree', { timeout: 20000, skip: process.platform === 'win32' }, async t => {
  const { pidFile } = await fixture(t);
  const child = spawn(process.execPath, [runner, '--timeout', '10000', '--', process.execPath, '-e', hangingTree], {
    stdio: 'ignore', env: { ...process.env, PID_FILE: pidFile },
  });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  let pids = [];
  t.after(() => {
    child.kill('SIGKILL');
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  });
  for (let i = 0; i < 100; i++) {
    try { pids = (await readFile(pidFile, 'utf8')).trim().split('\n').map(Number); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(pids.length, 2, 'fixture must start before interruption');
  child.kill('SIGINT');
  const result = await closed;
  assert.equal(result.code, 130);
  for (const pid of pids) assert.equal(await waitForDead(pid), true, `interruption left pid ${pid} alive`);
});

test('the CLI exits non-zero on timeout and leaves no hanging fixture alive', { timeout: 20000 }, async t => {
  const { pidFile } = await fixture(t);
  const run = spawnSync(process.execPath, [runner, '--timeout', '1000', '--', process.execPath, '-e', hangingTree], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, PID_FILE: pidFile },
  });
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /timeout/i);
  const pids = (await readFile(pidFile, 'utf8')).trim().split('\n').map(Number);
  for (const pid of pids) assert.equal(await waitForDead(pid), true, `pid ${pid} must be killed by the CLI`);
});
