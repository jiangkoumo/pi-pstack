import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { computeProgress, readStore } from './orch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = resolve(root, 'scripts/orch.mjs');
const fixtures = resolve(root, 'scripts/fixtures/orch');
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};

function sandbox(t, label) {
  mkdirSync(fixtures, { recursive: true });
  const dir = mkdtempSync(join(fixtures, `${label}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });

function commit(cwd, message) {
  const added = git(cwd, ['add', '-A']);
  assert.equal(added.status, 0, added.stderr);
  const result = git(cwd, ['commit', '-m', message]);
  assert.equal(result.status, 0, result.stderr);
}

function unit(id, extra = {}) {
  return {
    id,
    title: `Unit ${id}`,
    owner: 'fixture-owner',
    branch: `feat/${id.toLowerCase()}`,
    base: 'main',
    dependsOn: [],
    files: [`docs/${id.toLowerCase()}.md`],
    state: 'planned',
    head: 'pending',
    build: [{ task: `Build ${id}`, evidence: `evidence/${id}/build.md` }],
    observable: [{ result: `Result ${id}`, pass: `Pass ${id}`, evidence: `evidence/${id}/result.md` }],
    verification: {
      unit: [{ command: `node --test scripts/${id}.test.mjs`, pass: 'tests pass', evidence: `evidence/${id}/unit.log` }],
      live: [{ scenario: `Drive ${id}`, drive: 'Run it', regression: true, pass: 'works', evidence: `evidence/${id}/live.log` }],
      perf: { notApplicable: 'Fixture only' },
    },
    review: { required: false, reason: 'No interaction change' },
    merge: { owner: 'operator', gate: 'explicit-authorization' },
    receipts: [],
    ...extra,
  };
}

function planFixture({ maxParallel = 2, repository = '.', branches = {} } = {}) {
  return {
    schemaVersion: 1,
    goal: 'Fixture orchestration',
    repository,
    execution: {
      playbook: 'skills/poteto-mode/playbooks/orchestrate.md',
      approval: 'explicit-go-required',
      maxTurns: 6,
      maxParallel,
      stopCommand: 'node scripts/check-plan.mjs plan.md',
      standingOrders: ['One writer per worktree'],
      reservedActions: ['commit', 'push', 'open-pr', 'merge', 'rebase', 'retarget', 'force-push', 'delete'],
    },
    prs: [
      unit('PR1', { branch: branches.PR1 || 'feat/pr1' }),
      unit('PR2'),
      unit('PR3', { dependsOn: ['PR1'] }),
      unit('PR4', { dependsOn: ['PR3'] }),
    ],
    prototypes: [],
    risks: [],
    reading: [],
  };
}

function contract(plan) {
  return `# Fixture plan\n\n\`\`\`pstack-plan\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n`;
}

function writePlan(dir, plan) {
  const path = join(dir, 'plan.md');
  writeFileSync(path, contract(plan));
  return path;
}

function cli(args, { cwd = root, env = {} } = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...gitEnv, ...env },
  });
}

function json(result, expectedStatus = 0) {
  assert.equal(result.status, expectedStatus, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function repoFixture(t, { branch = 'feat/pr1' } = {}) {
  const dir = sandbox(t, 'repo');
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  assert.equal(git(repo, ['init', '-b', 'main']).status, 0);
  writeFileSync(join(repo, 'work.txt'), 'base\n');
  commit(repo, 'main base');
  const bare = join(dir, 'origin.git');
  assert.equal(git(dir, ['init', '--bare', bare]).status, 0);
  assert.equal(git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']).status, 0);
  assert.equal(git(repo, ['remote', 'add', 'origin', bare]).status, 0);
  assert.equal(git(repo, ['push', '-u', 'origin', 'main']).status, 0);
  assert.equal(git(repo, ['checkout', '-b', branch]).status, 0);
  writeFileSync(join(repo, `${branch.replace('/', '-')}.txt`), 'unit\n');
  commit(repo, 'unit work');
  return { dir, repo, bare };
}

function ghShim(dir, { exit = 0 } = {}) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const path = join(bin, 'gh');
  writeFileSync(path, `#!/bin/sh
mkdir -p "$GH_STATE"
printf '%s\\n' "$*" >> "$GH_STATE/calls"
exit ${exit}
`);
  chmodSync(path, 0o755);
  return { bin, state: join(dir, 'gh-state') };
}

const head = 'a'.repeat(40);

test('init creates an out-of-repo store; next returns only the dependency-ready batch', t => {
  const dir = sandbox(t, 'init');
  const planPath = writePlan(dir, planFixture());
  const store = join(dir, 'store');
  const init = json(cli(['init', '--plan', planPath, '--store', store]));
  assert.equal(init.created, true);
  assert.equal(init.total, 4);
  assert.equal(existsSync(join(store, 'units.json')), true);
  assert.equal(existsSync(join(store, 'meta.json')), true);

  const next = json(cli(['next', '--plan', planPath, '--store', store]));
  assert.equal(next.mode, 'read');
  assert.deepEqual(next.batch.map(row => row.id), ['PR1', 'PR2']);
  assert.deepEqual(next.ready, ['PR1', 'PR2']);
  assert.deepEqual(next.waiting, [{ id: 'PR3', waitingOn: ['PR1'] }, { id: 'PR4', waitingOn: ['PR3'] }]);
  assert.equal(next.slots, 2);
  assert.equal(next.suggestedCalls.length, 2);
  assert.equal(next.suggestedCalls[0].tool, 'subagent');
  assert.equal(next.suggestedCalls[0].description, 'PR1: Unit PR1');
  assert.match(next.suggestedCalls[0].prompt, /GOAL: Fixture orchestration/);
  assert.match(next.suggestedCalls[0].prompt, /RECORD WHEN DONE/);
  assert.match(next.suggestedCalls[0].prompt, /orch\.mjs record PR1/);
  assert.equal(next.batch[0].suggestedSubagent.prompt, next.suggestedCalls[0].prompt);
});

test('next is read-only before init and never writes into the repository', t => {
  const fixture = repoFixture(t);
  const planPath = writePlan(fixture.repo, planFixture({ repository: fixture.repo }));
  assert.equal(git(fixture.repo, ['add', '-A']).status, 0);
  commit(fixture.repo, 'add plan');
  const fresh = json(cli(['next', '--plan', planPath], { cwd: fixture.repo }));
  assert.equal(fresh.initialized, false);
  assert.equal(fresh.batch.length, 2);
  assert.match(fresh.warnings.join('\n'), /not initialized/);
  const status = git(fixture.repo, ['status', '--porcelain']).stdout;
  assert.equal(status, '', 'next must not create files in the repository');

  const init = json(cli(['init', '--plan', planPath], { cwd: fixture.repo }));
  assert.ok(init.store);
  assert.equal(init.store.startsWith(fixture.repo), false);
  t.after(() => rmSync(init.store, { recursive: true, force: true }));
  assert.equal(git(fixture.repo, ['status', '--porcelain']).stdout, '', 'init must keep state out of the repository');
});

test('record writes state and receipts, unlocking dependents; verified needs a head and evidence', t => {
  const dir = sandbox(t, 'record');
  const planPath = writePlan(dir, planFixture());
  const store = join(dir, 'store');
  json(cli(['init', '--plan', planPath, '--store', store]));

  const badHead = cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'verified']);
  assert.equal(badHead.status, 2);
  assert.equal(JSON.parse(badHead.stdout).error.code, 'invalid-head');
  const noEvidence = cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'verified', '--head', head]);
  assert.equal(noEvidence.status, 2);
  assert.equal(JSON.parse(noEvidence.stdout).error.code, 'missing-receipt');
  const badExit = cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'verified', '--head', head, '--evidence', 'evidence/PR1/unit.log', '--exit-code', '1', '--summary', 'failed']);
  assert.equal(badExit.status, 2);
  assert.equal(JSON.parse(badExit.stdout).error.code, 'failed-receipt');
  const absolute = cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'verified', '--head', head, '--evidence', '/tmp/unit.log', '--summary', 'x']);
  assert.equal(absolute.status, 2);
  assert.equal(JSON.parse(absolute.stdout).error.code, 'invalid-evidence');

  const recorded = json(cli([
    'record', 'PR1', '--plan', planPath, '--store', store, '--state', 'verified', '--head', head,
    '--evidence', 'evidence/PR1/unit.log', '--exit-code', '0', '--summary', 'unit suite passed at head',
    '--command', 'node --test scripts/pr1.test.mjs',
  ]));
  assert.equal(recorded.mode, 'write');
  assert.equal(recorded.unit.state, 'verified');
  assert.equal(recorded.unit.head, head);
  assert.equal(recorded.receipt.evidence, 'evidence/PR1/unit.log');
  assert.equal(recorded.receipt.exitCode, 0);
  assert.match(recorded.note, /no push, PR, or comment/);
  const receipts = readFileSync(join(store, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].summary, 'unit suite passed at head');

  const next = json(cli(['next', '--plan', planPath, '--store', store]));
  assert.deepEqual(next.batch.map(row => row.id), ['PR2', 'PR3']);
  assert.equal(next.done.includes('PR1'), true);
});

test('active units consume parallel slots; blocked units leave the ready set', t => {
  const dir = sandbox(t, 'slots');
  const planPath = writePlan(dir, planFixture());
  const store = join(dir, 'store');
  json(cli(['init', '--plan', planPath, '--store', store]));
  json(cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'active']));
  json(cli(['record', 'PR2', '--plan', planPath, '--store', store, '--state', 'active']));
  const full = json(cli(['next', '--plan', planPath, '--store', store]));
  assert.equal(full.slots, 0);
  assert.deepEqual(full.batch, []);
  assert.match(full.warnings.join('\n'), /no free parallel slots/);

  json(cli(['record', 'PR2', '--plan', planPath, '--store', store, '--state', 'planned']));
  const reopened = json(cli(['next', '--plan', planPath, '--store', store]));
  assert.equal(reopened.slots, 1);
  assert.deepEqual(reopened.batch.map(row => row.id), ['PR2']);
});

test('status reports counts, receipts, and drift against the plan', t => {
  const dir = sandbox(t, 'status');
  const planPath = writePlan(dir, planFixture());
  const store = join(dir, 'store');
  json(cli(['init', '--plan', planPath, '--store', store]));
  json(cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'verified', '--head', head, '--evidence', 'evidence/PR1/unit.log', '--summary', 'ok']));
  const status = json(cli(['status', '--plan', planPath, '--store', store]));
  assert.equal(status.counts.total, 4);
  assert.equal(status.counts.verified, 1);
  assert.equal(status.counts.planned, 3);
  assert.deepEqual(status.nextBatch, ['PR2', 'PR3']);
  assert.equal(status.receipts.total, 1);
  assert.equal(status.receipts.byUnit.PR1, 1);
  assert.equal(status.drift.length, 1);
  assert.equal(status.drift[0].planState, 'planned');
  assert.equal(status.drift[0].recordedState, 'verified');
  assert.match(status.drift[0].changes.join(','), /state planned -> verified/);
});

test('init is idempotent and keeps recorded state', t => {
  const dir = sandbox(t, 'idempotent');
  const planPath = writePlan(dir, planFixture());
  const store = join(dir, 'store');
  json(cli(['init', '--plan', planPath, '--store', store]));
  json(cli(['record', 'PR1', '--plan', planPath, '--store', store, '--state', 'active']));
  const again = json(cli(['init', '--plan', planPath, '--store', store]));
  assert.equal(again.created, false);
  assert.equal(again.added, 0);
  assert.equal(readStore(store).units.PR1.state, 'active');
});

test('a plan rejected by check-plan never creates state', t => {
  const dir = sandbox(t, 'bad-plan');
  const invalid = planFixture({ maxParallel: 99 });
  const planPath = writePlan(dir, invalid);
  const store = join(dir, 'store');
  const result = cli(['init', '--plan', planPath, '--store', store]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, 'plan-invalid');
  assert.ok(payload.problems.length > 0);
  assert.match(payload.problems.join('\n'), /maxParallel/);
  assert.equal(existsSync(join(store, 'units.json')), false);
});

test('computeProgress honours the dependency graph in-process', () => {
  const plan = planFixture({ maxParallel: 2 });
  const empty = { units: {} };
  const progress = computeProgress(plan, empty);
  assert.deepEqual(progress.batch.map(row => row.id), ['PR1', 'PR2']);
  const verified = { units: { PR1: { state: 'verified', head } } };
  assert.deepEqual(computeProgress(plan, verified).ready, ['PR2', 'PR3']);
});

test('publish is a dry run by default: nothing is pushed, opened, or commented', t => {
  const fixture = repoFixture(t);
  const planPath = writePlan(fixture.dir, planFixture({ repository: fixture.repo }));
  const before = git(fixture.bare, ['for-each-ref', '--format=%(refname)']).stdout;
  const result = json(cli(['publish', 'PR1', '--plan', planPath, '--store', join(fixture.dir, 'store'), '--push', '--open-pr']));
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.execute, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.commands.length, 2);
  assert.deepEqual(result.commands.map(command => command.action), ['push', 'open-pr']);
  assert.deepEqual(result.commands[0].args, ['push', '-u', 'origin', 'feat/pr1']);
  assert.ok(result.commands.every(command => command.executed === false));
  assert.match(result.warning, /nothing was pushed/);
  assert.equal(git(fixture.bare, ['for-each-ref', '--format=%(refname)']).stdout, before, 'dry run must not push');
});

test('publish --execute really pushes to the fixture remote and marks execute mode', t => {
  const fixture = repoFixture(t);
  const planPath = writePlan(fixture.dir, planFixture({ repository: fixture.repo }));
  const result = json(cli(['publish', 'PR1', '--plan', planPath, '--store', join(fixture.dir, 'store'), '--push', '--execute']));
  assert.equal(result.mode, 'execute');
  assert.equal(result.execute, true);
  assert.equal(result.dryRun, false);
  assert.match(result.notice, /execute mode/);
  assert.equal(result.commands[0].exitCode, 0);
  assert.equal(git(fixture.bare, ['rev-parse', '--verify', 'refs/heads/feat/pr1']).status, 0);
});

test('publish --execute runs the gh shim for open-pr and reports failures', t => {
  const fixture = repoFixture(t);
  const planPath = writePlan(fixture.dir, planFixture({ repository: fixture.repo }));
  const shim = ghShim(fixture.dir);
  const executed = json(cli(['publish', 'PR1', '--plan', planPath, '--store', join(fixture.dir, 'store'), '--open-pr', '--execute'], {
    env: { PATH: `${shim.bin}:${process.env.PATH}`, GH_STATE: shim.state },
  }));
  assert.equal(executed.mode, 'execute');
  assert.equal(executed.commands[0].action, 'open-pr');
  assert.equal(executed.commands[0].exitCode, 0);
  const calls = readFileSync(join(shim.state, 'calls'), 'utf8');
  assert.match(calls, /^pr create --base main --head feat\/pr1 --title Unit PR1 --body /);

  const failing = ghShim(join(fixture.dir, 'failing'), { exit: 1 });
  const failed = cli(['publish', 'PR1', '--plan', planPath, '--store', join(fixture.dir, 'store'), '--open-pr', '--execute'], {
    env: { PATH: `${failing.bin}:${process.env.PATH}`, GH_STATE: failing.state },
  });
  assert.equal(failed.status, 1);
  const payload = JSON.parse(failed.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.commands[0].exitCode, 1);
});

test('publish rejects missing actions, missing PR numbers, and execute+dry-run', t => {
  const fixture = repoFixture(t);
  const planPath = writePlan(fixture.dir, planFixture({ repository: fixture.repo }));
  const store = join(fixture.dir, 'store');
  const none = cli(['publish', 'PR1', '--plan', planPath, '--store', store]);
  assert.equal(none.status, 2);
  assert.equal(JSON.parse(none.stdout).error.code, 'usage');
  const comment = cli(['publish', 'PR1', '--plan', planPath, '--store', store, '--comment', 'hello']);
  assert.equal(comment.status, 2);
  assert.equal(JSON.parse(comment.stdout).error.code, 'missing-pr');
  const both = cli(['publish', 'PR1', '--plan', planPath, '--store', store, '--push', '--execute', '--dry-run']);
  assert.equal(both.status, 2);
  const badPr = cli(['publish', 'PR1', '--plan', planPath, '--store', store, '--comment', 'hello', '--pr', 'abc']);
  assert.equal(badPr.status, 2);
  assert.equal(JSON.parse(badPr.stdout).error.code, 'usage');
  const unknown = cli(['publish', 'NOPE', '--plan', planPath, '--store', store, '--push']);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).error.code, 'unknown-unit');
  const unknownCommand = cli(['ship', '--plan', planPath]);
  assert.equal(unknownCommand.status, 2);
});
