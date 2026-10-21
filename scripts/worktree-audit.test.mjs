import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parsePorcelain } from './worktree-audit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = resolve(root, 'scripts/worktree-audit.mjs');
const fixtures = resolve(root, 'scripts/fixtures/worktree-audit');
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};
const real = path => realpathSync(path);
const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });

function sandbox(t, label) {
  mkdirSync(fixtures, { recursive: true });
  const dir = mkdtempSync(join(fixtures, `${label}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function commit(cwd, message) {
  const added = git(cwd, ['add', '-A']);
  assert.equal(added.status, 0, added.stderr);
  const result = git(cwd, ['commit', '-m', message]);
  assert.equal(result.status, 0, result.stderr);
}

/** A main repo with one merged worktree, one unmerged dirty worktree, and one detached worktree. */
function fixture(t) {
  const dir = sandbox(t, 'repo');
  const repo = join(dir, 'main');
  mkdirSync(repo);
  assert.equal(git(repo, ['init', '-b', 'main']).status, 0);
  writeFileSync(join(repo, 'work.txt'), 'base\n');
  commit(repo, 'main base');
  const merged = join(dir, 'merged');
  assert.equal(git(repo, ['worktree', 'add', '-b', 'feature/merged', merged, 'main']).status, 0);
  const mixed = join(dir, 'mixed');
  assert.equal(git(repo, ['worktree', 'add', '-b', 'feature/mixed', mixed]).status, 0);
  writeFileSync(join(mixed, 'feature.txt'), 'feature\n');
  commit(mixed, 'feature work');
  writeFileSync(join(mixed, 'work.txt'), 'uncommitted edit\n');
  const detached = join(dir, 'detached');
  assert.equal(git(repo, ['worktree', 'add', '--detach', detached, 'main']).status, 0);
  return { dir, repo, merged, mixed, detached };
}

function cli(args, cwd = root) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: gitEnv });
}

function audit(t, args, cwd) {
  const result = cli(args, cwd);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('parses porcelain records including locked, prunable and detached worktrees', () => {
  const text = [
    'worktree /tmp/repo',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /tmp/wt',
    'HEAD def456',
    'detached',
    'locked on a USB volume',
    'prunable gitdir file points to non-existent location',
    '',
  ].join('\n');
  const records = parsePorcelain(text);
  assert.equal(records.length, 2);
  assert.equal(records[0].branch, 'main');
  assert.equal(records[0].detached, false);
  assert.equal(records[1].detached, true);
  assert.equal(records[1].locked, true);
  assert.equal(records[1].prunable, true);
  assert.equal(records[1].head, 'def456');
});

test('audits merged, unmerged dirty, detached and main worktrees without writing', t => {
  const fixturePaths = fixture(t);
  const { repo, merged, mixed, detached } = fixturePaths;
  const before = {
    status: git(repo, ['status', '--porcelain']).stdout,
    listed: git(repo, ['worktree', 'list', '--porcelain']).stdout,
    branches: git(repo, ['branch', '--list', '--format=%(refname:short)']).stdout,
    mixedContent: readFileSync(join(mixed, 'work.txt'), 'utf8'),
  };

  const report = audit(t, ['--pretty', '-b', 'main', repo]);
  assert.equal(report.ok, true);
  assert.equal(report.base.ref, 'main');
  assert.equal(report.base.commit.length, 40);
  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.dirty, 1);
  assert.equal(report.summary.detached, 1);
  assert.equal(report.summary.merged, 1);
  assert.equal(report.summary.unmerged, 1);

  const byPath = new Map(report.worktrees.map(item => [real(item.path), item]));
  const main = byPath.get(real(repo));
  assert.equal(main.main, true);
  assert.equal(main.classification, 'main');
  assert.equal(main.bucket, 'keep');
  assert.equal(main.mergedIntoBase, true);
  assert.equal(main.changes.total, 0);
  assert.ok(main.lastCommitAt);
  assert.equal(main.lastCommitSubject, 'main base');

  const mergedRow = byPath.get(real(merged));
  assert.equal(mergedRow.branch, 'feature/merged');
  assert.equal(mergedRow.mergedIntoBase, true);
  assert.equal(mergedRow.classification, 'merged');
  assert.equal(mergedRow.bucket, 'safe-to-remove');
  assert.equal(mergedRow.behind, 0);

  const mixedRow = byPath.get(real(mixed));
  assert.equal(mixedRow.branch, 'feature/mixed');
  assert.equal(mixedRow.mergedIntoBase, false);
  assert.equal(mixedRow.changes.total, 1);
  assert.equal(mixedRow.classification, 'dirty');
  assert.equal(mixedRow.bucket, 'hold-wip');
  assert.equal(mixedRow.ahead, 1);
  assert.equal(mixedRow.lastCommitSubject, 'feature work');

  const detachedRow = byPath.get(real(detached));
  assert.equal(detachedRow.detached, true);
  assert.equal(detachedRow.branch, null);
  assert.equal(detachedRow.classification, 'detached');
  assert.equal(detachedRow.bucket, 'review-detached');

  const after = {
    status: git(repo, ['status', '--porcelain']).stdout,
    listed: git(repo, ['worktree', 'list', '--porcelain']).stdout,
    branches: git(repo, ['branch', '--list', '--format=%(refname:short)']).stdout,
    mixedContent: readFileSync(join(mixed, 'work.txt'), 'utf8'),
  };
  assert.deepEqual(after, before, 'audit must not write, checkout, prune, or remove anything');
});

test('--size adds a non-negative kilobyte measurement without other changes', t => {
  const { repo } = fixture(t);
  const report = audit(t, ['-b', 'main', '--size', repo]);
  const main = report.worktrees.find(item => real(item.path) === real(repo));
  assert.equal(typeof main.sizeKB, 'number');
  assert.ok(main.sizeKB >= 0);
});

test('defaults to origin/HEAD when a clone has one and accepts origin/main', t => {
  const dir = sandbox(t, 'clone');
  const bare = join(dir, 'origin.git');
  assert.equal(git(dir, ['init', '--bare', bare]).status, 0);
  assert.equal(git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']).status, 0);
  const source = join(dir, 'source');
  mkdirSync(source);
  assert.equal(git(source, ['init', '-b', 'main']).status, 0);
  writeFileSync(join(source, 'work.txt'), 'base\n');
  commit(source, 'main base');
  assert.equal(git(source, ['remote', 'add', 'origin', bare]).status, 0);
  assert.equal(git(source, ['push', '-u', 'origin', 'main']).status, 0);
  const clone = join(dir, 'clone');
  assert.equal(git(dir, ['clone', bare, clone]).status, 0);
  const byDefault = audit(t, [clone], dir);
  assert.equal(byDefault.base.ref, 'origin/HEAD');
  const explicit = audit(t, ['-b', 'origin/main', clone], dir);
  assert.equal(explicit.base.ref, 'origin/main');
  assert.equal(explicit.base.commit, byDefault.base.commit);
});

test('unknown base refs and non-repositories fail with exit 2', t => {
  const { repo } = fixture(t);
  const missing = cli(['-b', 'origin/does-not-exist', repo]);
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stdout).error.code, 'base-missing');

  const dir = mkdtempSync(join(tmpdir(), 'pstack-not-a-repo-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const plain = join(dir, 'plain');
  mkdirSync(plain);
  const result = cli([plain]);
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'not-a-repository');
  assert.equal(existsSync(join(plain, '.git')), false);
});

test('rejects unknown arguments and extra paths with exit 2', () => {
  const unknown = cli(['--nope']);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).error.code, 'usage');
  const extra = cli(['a', 'b']);
  assert.equal(extra.status, 2);
});
