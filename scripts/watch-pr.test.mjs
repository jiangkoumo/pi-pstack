import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { main, normalize } from './watch-pr.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = resolve(root, 'scripts/watch-pr.mjs');
const fixtures = resolve(root, 'scripts/fixtures/watch-pr');

function sandbox(t, label) {
  mkdirSync(fixtures, { recursive: true });
  const dir = mkdtempSync(join(fixtures, `${label}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A PATH-local gh shim. Responses are response-<n>.json with response-last.json as fallback. */
function ghShim(dir, { exit = 0, stderr = '' } = {}) {
  const bin = join(dir, 'bin');
  const state = join(dir, 'state');
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  const path = join(bin, 'gh');
  writeFileSync(path, `#!/bin/sh
state="$GH_STATE"
mkdir -p "$state"
n=$(cat "$state/count" 2>/dev/null || echo 0)
n=$((n+1))
printf '%s' "$n" > "$state/count"
printf '%s\\n' "$*" >> "$state/calls"
if [ -f "$state/stderr" ]; then cat "$state/stderr" >&2; fi
response="$state/response-$n.json"
[ -f "$response" ] || response="$state/response-last.json"
if [ -f "$response" ]; then cat "$response"; fi
if [ -f "$state/exit" ]; then exit "$(cat "$state/exit")"; fi
exit 0
`);
  chmodSync(path, 0o755);
  if (stderr) writeFileSync(join(state, 'stderr'), stderr);
  if (exit !== 0) writeFileSync(join(state, 'exit'), String(exit));
  return { bin, state };
}

function writeResponse(state, name, value) {
  writeFileSync(join(state, name), `${JSON.stringify(value)}\n`);
}

function prView(overrides = {}) {
  return {
    number: 12,
    url: 'https://github.com/example/repo/pull/12',
    title: 'Fixture pull request',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED',
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'StatusContext', context: 'ci/lint', state: 'SUCCESS' },
    ],
    headRefOid: 'a'.repeat(40),
    headRefName: 'feat/fixture',
    baseRefName: 'main',
    ...overrides,
  };
}

function cli(args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function run(t, args, view = prView(), shimOptions) {
  const dir = sandbox(t, 'cli');
  const shim = ghShim(dir, shimOptions);
  writeResponse(shim.state, 'response-last.json', view);
  return {
    dir,
    shim,
    result: cli(args, { PATH: `${shim.bin}:${process.env.PATH}`, GH_STATE: shim.state }),
  };
}

test('normalizes a fully green PR into READY with counted checks', () => {
  const snapshot = normalize(prView(), { now: new Date('2026-01-02T03:04:05Z') });
  assert.equal(snapshot.verdict, 'READY');
  assert.equal(snapshot.green, true);
  assert.equal(snapshot.terminal, true);
  assert.equal(snapshot.checks.total, 2);
  assert.equal(snapshot.checks.passed, 2);
  assert.equal(snapshot.checks.state, 'success');
  assert.equal(snapshot.review.approved, true);
  assert.match(snapshot.summary, /PR #12 READY/);
  assert.equal(snapshot.generatedAt, '2026-01-02T03:04:05.000Z');
});

test('verdict matrix never reports pending, failing, or blocked PRs as green', () => {
  const cases = [
    [{ statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'IN_PROGRESS', conclusion: null }] }, 'WAITING', false, false],
    [{ statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE' }] }, 'CHECKS_FAILED', false, true],
    [{ reviewDecision: 'CHANGES_REQUESTED' }, 'CHANGES_REQUESTED', false, true],
    [{ reviewDecision: 'REVIEW_REQUIRED' }, 'WAITING', false, false],
    [{ isDraft: true }, 'DRAFT', false, true],
    [{ mergeable: 'CONFLICTING' }, 'CONFLICT', false, true],
    [{ mergeStateStatus: 'BLOCKED' }, 'WAITING', false, false],
    [{ state: 'MERGED' }, 'MERGED', true, true],
    [{ state: 'CLOSED' }, 'CLOSED', false, true],
    [{ statusCheckRollup: [] }, 'READY', true, true],
  ];
  for (const [overrides, verdict, green, terminal] of cases) {
    const snapshot = normalize(prView(overrides));
    assert.equal(snapshot.verdict, verdict, JSON.stringify(overrides));
    assert.equal(snapshot.green, green, `${verdict} green`);
    assert.equal(snapshot.terminal, terminal, `${verdict} terminal`);
  }
});

test('status-only prints one JSON snapshot through a PATH gh shim', t => {
  const { result } = run(t, ['--status-only', '--pr', '12', '--repo', '.']);
  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.mode, 'status-only');
  assert.equal(snapshot.polls, 1);
  assert.equal(snapshot.pr.number, 12);
  assert.equal(snapshot.checks.passed, 2);
  assert.equal(snapshot.verdict, 'READY');
});

test('--green is a single-shot predicate for /loop --until', t => {
  const green = run(t, ['--green', '--pr', '12', '--repo', '.']);
  assert.equal(green.result.status, 0, green.result.stderr);
  assert.equal(JSON.parse(green.result.stdout).green, true);

  const red = run(t, ['--green', '--pretty', '--pr', '12', '--repo', '.'], prView({
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE' }],
  }));
  assert.equal(red.result.status, 1);
  const snapshot = JSON.parse(red.result.stdout);
  assert.equal(snapshot.green, false);
  assert.equal(snapshot.verdict, 'CHECKS_FAILED');
  assert.deepEqual(snapshot.blockers, ['check:unit']);
});

test('polls until a terminal verdict and stops calling gh', t => {
  const dir = sandbox(t, 'poll');
  const shim = ghShim(dir);
  writeResponse(shim.state, 'response-1.json', prView({
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'IN_PROGRESS', conclusion: null }],
  }));
  writeResponse(shim.state, 'response-last.json', prView());
  const result = cli(['--pr', '12', '--repo', '.', '--interval', '0.01', '--timeout', '5'], {
    PATH: `${shim.bin}:${process.env.PATH}`,
    GH_STATE: shim.state,
  });
  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.polls, 2);
  assert.equal(snapshot.verdict, 'READY');
  assert.equal(readFileSync(join(shim.state, 'count'), 'utf8'), '2');
});

test('a timeout reports timedOut and exits nonzero', t => {
  const dir = sandbox(t, 'timeout');
  const shim = ghShim(dir);
  writeResponse(shim.state, 'response-last.json', prView({
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'IN_PROGRESS', conclusion: null }],
  }));
  const result = cli(['--pr', '12', '--repo', '.', '--interval', '0.02', '--timeout', '0.06'], {
    PATH: `${shim.bin}:${process.env.PATH}`,
    GH_STATE: shim.state,
  });
  assert.equal(result.status, 1, result.stderr);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.timedOut, true);
  assert.equal(snapshot.verdict, 'WAITING');
  assert.ok(snapshot.polls >= 1);
  assert.match(snapshot.reasons.join(','), /timeout/);
});

test('an interval longer than the timeout sleeps only for the remaining deadline', async t => {
  const dir = sandbox(t, 'deadline');
  const shim = ghShim(dir);
  writeResponse(shim.state, 'response-last.json', prView({
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'IN_PROGRESS', conclusion: null }],
  }));
  const started = Date.parse('2026-01-02T03:04:05Z');
  let elapsed = 0;
  let clockReads = 0;
  const sleeps = [];
  const output = [];
  const result = await main(['--pr', '12', '--repo', root, '--interval', '30', '--timeout', '1'], {
    out: line => output.push(line),
    err: () => {},
  }, {
    env: { ...process.env, PSTACK_GH: join(shim.bin, 'gh'), GH_STATE: shim.state },
    now: () => {
      // The first snapshot consumes 250ms of the one-second budget.
      if (clockReads++ === 1) elapsed = 250;
      return new Date(started + elapsed);
    },
    sleep: async ms => {
      assert.ok(ms <= 1000 - elapsed, `sleep ${ms} exceeds the remaining budget`);
      sleeps.push(ms);
      elapsed += ms;
    },
  });
  assert.equal(result, 1);
  assert.deepEqual(sleeps, [750]);
  assert.equal(elapsed, 1000);
  const snapshot = JSON.parse(output[0]);
  assert.equal(snapshot.timedOut, true);
  assert.equal(snapshot.verdict, 'WAITING');
  assert.equal(snapshot.polls, 2);
  assert.equal(snapshot.generatedAt, new Date(started + 1000).toISOString());
  assert.ok(snapshot.reasons.includes('timeout'));
  assert.equal(readFileSync(join(shim.state, 'count'), 'utf8'), '2');
});

test('missing gh is an explicit error, never a silent green', t => {
  const dir = sandbox(t, 'missing-gh');
  const result = cli(['--green', '--pr', '12', '--repo', '.'], {
    PSTACK_GH: join(dir, 'definitely-not-installed'),
  });
  assert.equal(result.status, 3);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'gh-missing');
  assert.match(result.stderr, /not found/i);
});

test('unauthenticated gh is an explicit error, never a silent green', t => {
  const dir = sandbox(t, 'auth');
  const shim = ghShim(dir, { exit: 1, stderr: 'gh: To get started with GitHub CLI, please run: gh auth login\n' });
  writeResponse(shim.state, 'response-last.json', prView());
  const result = cli(['--green', '--pr', '12', '--repo', '.'], {
    PATH: `${shim.bin}:${process.env.PATH}`,
    GH_STATE: shim.state,
  });
  assert.equal(result.status, 3);
  assert.equal(JSON.parse(result.stdout).error.code, 'gh-auth');
});

test('resolves the PR for the current branch when --pr is omitted', t => {
  const { result, shim } = run(t, ['--status-only', '--repo', '.']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).pr.number, 12);
  assert.match(readFileSync(join(shim.state, 'calls'), 'utf8'), /^pr view --json number$/m);
});

test('rejects unknown or malformed arguments with exit 2', () => {
  const unknown = cli(['--nope']);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).error.code, 'usage');
  const badPr = cli(['--pr', 'abc']);
  assert.equal(badPr.status, 2);
  const both = cli(['--green', '--status-only']);
  assert.equal(both.status, 2);
});
