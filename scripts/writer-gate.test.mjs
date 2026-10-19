import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gatePath = fileURLToPath(new URL('./writer-gate.mjs', import.meta.url));

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'pstack-writer-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repo = join(directory, 'repo');
  const worktree = join(directory, 'worktree');
  await mkdir(repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'gate@example.invalid']);
  git(repo, ['config', 'user.name', 'Gate Test']);
  await writeFile(join(repo, 'app.txt'), 'ORIGINAL\n');
  git(repo, ['add', 'app.txt']);
  git(repo, ['commit', '-q', '-m', 'baseline']);
  git(repo, ['worktree', 'add', '-q', '-b', 'writer-lane', worktree, 'HEAD']);
  return { directory, repo, worktree };
}

function treeOf(worktree) {
  git(worktree, ['add', '-A']);
  return git(worktree, ['write-tree']);
}

async function writeReview(directory, review) {
  const path = join(directory, 'review.json');
  await writeFile(path, JSON.stringify(review, null, 2) + '\n');
  return path;
}

function reviewFor({ baseCommit, reviewedTree, findings = [{ severity: 'non-blocking', issue: 'naming only' }], tools = ['read', 'grep', 'find', 'ls'], verdict = 'pass' }) {
  return {
    version: 1,
    verdict,
    baseCommit,
    reviewedTree,
    reviewer: { runId: 'review-run-1', model: 'fixture/reviewer', tools },
    findings,
    reviewedAt: '2026-10-19T00:00:00.000Z',
  };
}

function runGate(args) {
  const result = spawnSync(process.execPath, [gatePath, ...args], { encoding: 'utf8' });
  let output;
  try { output = JSON.parse(result.stdout); } catch { output = { rawStdout: result.stdout, rawStderr: result.stderr }; }
  return { ...result, output };
}

test('passes a reviewed worktree without touching the source', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.status, 'passed');
  assert.equal(result.output.applied, false);
  assert.equal(result.output.baseCommit, baseCommit);
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'ORIGINAL\n');
});

test('applies the reviewed patch to the source working tree when asked', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  await writeFile(join(worktree, 'new.txt'), 'NEW FILE\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--apply']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.applied, true);
  assert.equal(result.output.committed, false);
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'REVIEWED\n');
  assert.equal(await readFile(join(repo, 'new.txt'), 'utf8'), 'NEW FILE\n');
});

test('rejects blocking findings and leaves the source unchanged', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree, findings: [{ severity: 'blocking', issue: 'changes behavior without a test' }] }));
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--apply']);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'review-blockers');
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'ORIGINAL\n');
});

test('rejects a tree that moved after review', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  await writeFile(join(worktree, 'app.txt'), 'CHANGED AFTER REVIEW\n');
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--apply']);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'stale-tree');
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'ORIGINAL\n');
});

test('rejects a reviewer that declared a writable tool', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree, tools: ['read', 'write'] }));
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review]);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'review-tools');
});

test('rejects a dirty source repository', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  await writeFile(join(repo, 'user-change.txt'), 'do not clobber\n');
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--apply']);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'source-dirty');
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'ORIGINAL\n');
});

test('rejects when the source moved beyond the reviewed base', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  await writeFile(join(repo, 'other.txt'), 'OTHER\n');
  git(repo, ['add', 'other.txt']);
  git(repo, ['commit', '-q', '-m', 'source moved']);
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--apply']);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'source-moved');
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'ORIGINAL\n');
});

test('rejects when the verification command fails and does not apply', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--check', `${process.execPath} -e "process.exit(3)"`, '--apply']);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'check-failed');
  assert.equal(result.output.check.exitCode, 3);
  assert.equal(await readFile(join(repo, 'app.txt'), 'utf8'), 'ORIGINAL\n');
});

test('rejects an empty patch', async t => {
  const { directory, repo, worktree } = await setup(t);
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review]);
  assert.equal(result.status, 1);
  assert.equal(result.output.code, 'empty-patch');
});

test('writes a receipt for a passing decision', async t => {
  const { directory, repo, worktree } = await setup(t);
  await writeFile(join(worktree, 'app.txt'), 'REVIEWED\n');
  const baseCommit = git(worktree, ['rev-parse', 'HEAD']);
  const reviewedTree = treeOf(worktree);
  const review = await writeReview(directory, reviewFor({ baseCommit, reviewedTree }));
  const receipt = resolve(directory, 'receipt.json');
  const result = runGate(['--repo', repo, '--worktree', worktree, '--review', review, '--receipt', receipt]);
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(await readFile(receipt, 'utf8'));
  assert.equal(saved.status, 'passed');
  assert.equal(saved.reviewedTree, reviewedTree);
  assert.equal(saved.patchSha256.length, 64);
});
