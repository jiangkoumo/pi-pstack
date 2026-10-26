#!/usr/bin/env node
/**
 * Cross-platform, per-check bounded runner for the pi-pstack checks.
 *
 * Every command gets its own timeout. On timeout the whole child process tree is
 * killed (POSIX process group / Windows taskkill) and the check is reported as a
 * failure, so a leaked watcher/keep-alive handle can never hang `npm test`.
 *
 * The runner never turns a failed child into a passing result: the real exit code
 * is preserved in the summary and the CLI exits non-zero on failure or timeout.
 *
 * Usage:
 *   node scripts/run-checks.mjs --plan check
 *   node scripts/run-checks.mjs --plan test [--timeout 90000]
 *   node scripts/run-checks.mjs --timeout 5000 -- node scripts/some-check.mjs
 *
 * package.json wiring (owned by the lead): point `check` at `--plan check` and
 * `test` at `--plan test`. The `test` plan includes upstream-fidelity.test.mjs,
 * which the old `npm test` appended after the check chain.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const DEFAULT_TIMEOUT_MS = 90_000;
const KILL_GRACE_MS = 5_000;
const scriptsRoot = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

const script = name => [process.execPath, [resolve(scriptsRoot, name)]];
const testFile = name => [process.execPath, ['--test', resolve(scriptsRoot, name)]];
// Skills ship their own upstream tests, so those resolve from the repository root.
const skillTest = path => [process.execPath, ['--test', resolve(root, path)]];
const withFlags = (command, ...flags) => [command[0], [...command[1], ...flags]];

const preSdkTests = [
  'run-checks.test.mjs',
  'p2-runtime.test.mjs',
  'loop.test.mjs',
  'generation.test.mjs',
  'writer-gate.test.mjs',
  'coverage.test.mjs',
  'check-plan.test.mjs',
  'runtime-next.test.mjs',
  'role-agents.test.mjs',
  'mode-state.test.mjs',
  'mode-compaction-injection.test.mjs',
  'review-dispatch.test.mjs',
  'playbook-role-routing.test.mjs',
  'delegation-default.test.mjs',
  'comment-sicko.test.mjs',
  'watch-pr.test.mjs',
  'worktree-audit.test.mjs',
  'orch.test.mjs',
  'mode-persistence.test.mjs',
  'session-skills.test.mjs',
  'statechart-adapter.test.mjs',
  'statechart-sync.test.mjs',
];

// Mirrors the historical `npm run check` order exactly: node --test files are
// interleaved with the SDK/SSE checks, not appended after them.
export const CHECK_PLAN = [
  { name: 'check-package', command: script('check-package.mjs') },
  ...preSdkTests.map(name => ({ name, command: testFile(name) })),
  { name: 'check-p3-agents', command: withFlags(script('check-p3-agents.mjs'), '--allow-skip') },
  // Upstream statechart tests, verbatim. They take about 3s when no TLC is
  // configured and about 3min when TLA2TOOLS/JAVA point at a real jar, so this
  // check owns a longer budget. Without a jar the TLC cases skip with reasons.
  { name: 'statechart.test.mjs', command: skillTest('skills/statechart/scripts/test/statechart.test.mjs'), timeoutMs: 300_000, env: { XDG_CACHE_HOME: resolve(root, 'scripts/fixtures/statechart-no-renderer') } },
  { name: 'check-p3-readonly-gate', command: withFlags(script('check-p3-readonly-gate.mjs'), '--allow-skip') },
  { name: 'check-abort-state', command: script('check-abort-state.mjs') },
  { name: 'check-parallel-roles', command: withFlags(script('check-parallel-roles.mjs'), '--allow-skip') },
  { name: 'test-session-lifecycle.test.mjs', command: testFile('test-session-lifecycle.test.mjs') },
  ...['publication-gate.test.mjs', 'publication-host.test.mjs', 'verification-exec.test.mjs',
    'verifier-child.test.mjs', 'routing.test.mjs', 'playbook-script-invocation.test.mjs', 'auto-continue.test.mjs',
    'formal-verification-gate.test.mjs']
    .map(name => ({ name, command: testFile(name) })),
];

// The original `npm test` appended the fidelity check after the whole check chain.
export const TEST_PLAN = [
  ...CHECK_PLAN,
  { name: 'upstream-fidelity', command: testFile('upstream-fidelity.test.mjs') },
];

export const PLANS = Object.freeze({ check: CHECK_PLAN, test: TEST_PLAN });

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    // Checks are spawned detached, so the child is a process-group leader. Kill
    // the group to take down grandchildren too (a fd-inheriting grandchild can
    // otherwise keep the parent pipe open forever).
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try { child.kill('SIGKILL'); } catch { /* Already gone. */ }
  }
}

/**
 * Run one check with a hard timeout. Resolves (never rejects) with a result that
 * records the real exit code, signal and whether the timeout path was taken.
 */
export function runCheck(check, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd ?? process.cwd();
  const stdio = options.stdio ?? 'inherit';
  const started = Date.now();
  const [file, args = []] = check.command;
  return new Promise(resolvePromise => {
    let child;
    let timedOut = false;
    let settled = false;
    let timeout;
    let forceFinish;
    let interrupted = null;
    const interrupt = signal => {
      interrupted = signal;
      killTree(child);
      forceFinish = setTimeout(() => finish({ status: 'interrupted', exitCode: signal === 'SIGINT' ? 130 : 143, signal }), KILL_GRACE_MS);
    };
    const onSigint = () => interrupt('SIGINT');
    const onSigterm = () => interrupt('SIGTERM');
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceFinish);
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      resolvePromise({ name: check.name, durationMs: Date.now() - started, timedOut, ...result });
    };
    try {
      child = spawn(file, args, {
        cwd,
        stdio,
        detached: process.platform !== 'win32',
        windowsHide: true,
        env: { ...process.env, ...(check.env ?? {}) },
      });
    } catch (error) {
      finish({ status: 'error', exitCode: null, signal: null, error: String(error) });
      return;
    }
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    timeout = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // If a descendant somehow survives SIGKILL, do not hang the runner forever.
      forceFinish = setTimeout(() => {
        finish({ status: 'timeout', exitCode: null, signal: 'SIGKILL', error: `check exceeded ${timeoutMs}ms and cleanup did not settle` });
      }, KILL_GRACE_MS);
    }, timeoutMs);
    child.once('error', error => {
      finish({ status: 'error', exitCode: null, signal: null, error: String(error) });
    });
    child.once('close', (code, signal) => {
      if (interrupted) {
        finish({ status: 'interrupted', exitCode: interrupted === 'SIGINT' ? 130 : 143, signal: interrupted });
      } else if (timedOut) {
        finish({ status: 'timeout', exitCode: null, signal: signal ?? 'SIGKILL' });
      } else if (code === 0) {
        finish({ status: 'passed', exitCode: 0, signal: null });
      } else {
        finish({ status: 'failed', exitCode: code, signal: signal ?? null });
      }
    });
  });
}

/**
 * Run checks sequentially, stopping at the first failure like `cmd && cmd`.
 * `failed` counts checks that failed or timed out; skipped checks are not run.
 */
export async function runChecks(checks, options = {}) {
  const started = Date.now();
  const results = [];
  for (const check of checks) {
    // A check may need more time than the run-wide default (a real TLC suite does).
    const result = await runCheck(check, { ...options, timeoutMs: check.timeoutMs ?? options.timeoutMs });
    results.push(result);
    if (result.status !== 'passed') break;
  }
  const failed = results.filter(result => result.status !== 'passed').length;
  const timedOut = results.filter(result => result.status === 'timeout').length;
  return {
    ok: failed === 0 && results.length === checks.length,
    passed: results.filter(result => result.status === 'passed').length,
    failed,
    timedOut,
    total: checks.length,
    executed: results.length,
    durationMs: Date.now() - started,
    results,
  };
}

function usage() {
  return 'usage: node scripts/run-checks.mjs [--plan check|test] [--timeout <ms>] [--list] [-- <command> [args...]]';
}

export async function main(argv = process.argv.slice(2)) {
  let plan = 'test';
  let timeoutMs = Number(process.env.PSTACK_CHECK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const separator = argv.indexOf('--');
  const optionArgs = separator === -1 ? argv : argv.slice(0, separator);
  const adHoc = separator === -1 ? [] : argv.slice(separator + 1);
  for (let index = 0; index < optionArgs.length; index++) {
    const arg = optionArgs[index];
    if (arg === '--plan') plan = optionArgs[++index];
    else if (arg === '--timeout') timeoutMs = Number(optionArgs[++index]);
    else if (arg === '--list') {
      for (const [name, checks] of Object.entries(PLANS)) {
        console.log(`${name}:`);
        for (const check of checks) console.log(`  ${check.name}`);
      }
      return 0;
    } else {
      console.error(`run-checks: unknown option ${arg}\n${usage()}`);
      return 2;
    }
  }
  if (!isPositiveInteger(timeoutMs)) {
    console.error(`run-checks: --timeout must be a positive integer, got ${timeoutMs}`);
    return 2;
  }
  let checks;
  if (adHoc.length) checks = [{ name: 'command', command: [adHoc[0], adHoc.slice(1)] }];
  else {
    checks = PLANS[plan];
    if (!checks) {
      console.error(`run-checks: unknown plan ${plan}; expected check or test`);
      return 2;
    }
  }
  const summary = await runChecks(checks, { timeoutMs, cwd: root });
  for (const result of summary.results) {
    if (result.status === 'passed') {
      console.error(`run-checks: PASS ${result.name} (${result.durationMs}ms)`);
    } else if (result.status === 'timeout') {
      console.error(`run-checks: FAIL ${result.name}: timeout after ${timeoutMs}ms; killed process tree`);
    } else {
      console.error(`run-checks: FAIL ${result.name}: ${result.status}${result.exitCode === null ? '' : ` exit ${result.exitCode}`}${result.error ? ` (${result.error})` : ''}`);
    }
  }
  console.log(JSON.stringify(summary));
  const interruption = summary.results.find(result => result.status === 'interrupted');
  return interruption?.exitCode ?? (summary.ok ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main();
}
