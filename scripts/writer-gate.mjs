#!/usr/bin/env node
// Mechanical review gate for a writer child working in a managed Git worktree.
//
// The gate is intentionally parent-side: it can refuse an unreviewed change,
// but it cannot stop a parent from running raw Git commands. The workflow in
// skills/poteto-mode/SKILL.md requires this gate before applying a writer patch.
//
// Usage:
//   node scripts/writer-gate.mjs --repo <repo> --worktree <wt> --review <review.json> [options]
//
// Options:
//   --check "<command>"   Run a verification command inside the writer worktree.
//   --apply               Apply the reviewed patch to the source working tree.
//   --receipt <path>      Write a JSON receipt describing the decision.
//   --json                Print the JSON result (default).
//
// Exit codes: 0 pass (and applied when requested), 1 rejected, 2 usage error.

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
const SEVERITIES = new Set(['blocking', 'non-blocking', 'info']);

function usage(message) {
  const error = { status: 'error', code: 'usage', message };
  console.log(JSON.stringify(error, null, 2));
  process.exit(2);
}

function parseArgs(argv) {
  const out = { apply: false, json: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') { out.apply = true; continue; }
    if (arg === '--json') { out.json = true; continue; }
    if (arg === '--check') { out.check = argv[++index]; continue; }
    if (arg === '--repo') { out.repo = argv[++index]; continue; }
    if (arg === '--worktree') { out.worktree = argv[++index]; continue; }
    if (arg === '--review') { out.review = argv[++index]; continue; }
    if (arg === '--receipt') { out.receipt = argv[++index]; continue; }
    if (arg === '--help' || arg === '-h') usage('writer-gate --repo <repo> --worktree <wt> --review <review.json> [--check "<cmd>"] [--apply] [--receipt <path>]');
    usage(`unknown argument: ${arg}`);
  }
  for (const key of ['repo', 'worktree', 'review']) {
    if (!out[key]) usage(`missing --${key}`);
    if (!isAbsolute(out[key])) out[key] = resolve(process.cwd(), out[key]);
  }
  if (out.check !== undefined && !out.check.trim()) usage('--check must be a non-empty command');
  return out;
}

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code, message, details = {}) {
  return { status: 'rejected', code, message, ...details };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function verifyReview(review, expected) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return fail('review-shape', 'review must be a JSON object');
  if (review.version !== 1) return fail('review-version', 'review.version must be 1');
  if (review.verdict !== 'pass') return fail('review-verdict', `review.verdict is ${JSON.stringify(review.verdict)}, expected "pass"`);
  if (typeof review.baseCommit !== 'string' || !/^[0-9a-f]{40,64}$/.test(review.baseCommit)) return fail('review-base', 'review.baseCommit must be a full commit id');
  if (typeof review.reviewedTree !== 'string' || !/^[0-9a-f]{40,64}$/.test(review.reviewedTree)) return fail('review-tree', 'review.reviewedTree must be a full tree id');
  if (!review.reviewer || typeof review.reviewer !== 'object' || Array.isArray(review.reviewer)) return fail('review-reviewer', 'review.reviewer is required');
  if (typeof review.reviewer.runId !== 'string' || !review.reviewer.runId.trim()) return fail('review-reviewer', 'review.reviewer.runId is required');
  if (typeof review.reviewer.model !== 'string' || !review.reviewer.model.trim()) return fail('review-reviewer', 'review.reviewer.model is required');
  if (!Array.isArray(review.reviewer.tools) || review.reviewer.tools.length === 0) return fail('review-tools', 'review.reviewer.tools must list the declared tools');
  const leaked = review.reviewer.tools.filter(tool => !READ_ONLY_TOOLS.has(String(tool)));
  if (leaked.length > 0) return fail('review-tools', `reviewer declared non-read-only tools: ${leaked.join(', ')}`, { declaredTools: review.reviewer.tools });
  if (!Array.isArray(review.findings)) return fail('review-findings', 'review.findings must be an array');
  for (const [index, finding] of review.findings.entries()) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) return fail('review-findings', `findings[${index}] must be an object`);
    if (!SEVERITIES.has(finding.severity)) return fail('review-findings', `findings[${index}].severity must be blocking, non-blocking, or info`);
    if (typeof finding.issue !== 'string' || !finding.issue.trim()) return fail('review-findings', `findings[${index}].issue must be non-empty`);
  }
  const blocking = review.findings.filter(finding => finding.severity === 'blocking');
  if (blocking.length > 0) return fail('review-blockers', `${blocking.length} blocking finding(s) remain`, { blocking });
  if (review.baseCommit !== expected.baseCommit) return fail('stale-base', 'review baseCommit does not match the worktree HEAD', { expected: expected.baseCommit, review: review.baseCommit });
  if (review.reviewedTree !== expected.tree) return fail('stale-tree', 'reviewedTree does not match the current staged worktree tree; the change moved after review', { expected: expected.tree, review: review.reviewedTree });
  return { status: 'ok' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let review;
  let reviewText;
  try {
    reviewText = readFileSync(args.review, 'utf8');
    review = JSON.parse(reviewText);
  } catch (error) {
    const result = fail('review-read', `cannot read review: ${error.message}`);
    if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  let context;
  try {
    const repo = realpathSync(args.repo);
    const worktree = realpathSync(args.worktree);
    const repoHead = git(repo, ['rev-parse', 'HEAD']);
    const worktreeHead = git(worktree, ['rev-parse', 'HEAD']);
    const worktrees = git(repo, ['worktree', 'list', '--porcelain']).split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length));
    if (!worktrees.some(path => { try { return realpathSync(path) === worktree; } catch { return false; } })) {
      const result = fail('not-a-worktree', 'worktree is not registered to this repository', { repo, worktree, registered: worktrees });
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    const sourceStatus = git(repo, ['status', '--porcelain', '--untracked-files=normal']);
    if (sourceStatus !== '') {
      const result = fail('source-dirty', 'source repository has uncommitted changes; refusing to apply or validate a patch on top of them', { status: sourceStatus.split('\n').slice(0, 20) });
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    git(worktree, ['add', '-A']);
    const tree = git(worktree, ['write-tree']);
    const patch = execFileSync('git', ['diff', '--cached', '--binary', 'HEAD'], { cwd: worktree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    context = { repo, worktree, repoHead, worktreeHead, tree, patch };
  } catch (error) {
    const result = fail('git-context', `cannot inspect repository/worktree: ${error.message}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const verified = verifyReview(review, { baseCommit: context.worktreeHead, tree: context.tree });
  if (verified.status !== 'ok') {
    const result = { ...verified, repo: context.repo, worktree: context.worktree, baseCommit: context.worktreeHead, tree: context.tree, applied: false };
    if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (context.repoHead !== context.worktreeHead) {
    const result = fail('source-moved', 'source HEAD no longer matches the reviewed base; re-run the writer from the current HEAD', { sourceHead: context.repoHead, baseCommit: context.worktreeHead });
    if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (context.patch.trim() === '') {
    const result = fail('empty-patch', 'worktree has no staged change against HEAD');
    if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  let checkResult;
  if (args.check) {
    try {
      const output = execSync(args.check, { cwd: context.worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60 * 1000 });
      checkResult = { command: args.check, status: 'passed', exitCode: 0, output: output.slice(-4000) };
    } catch (error) {
      checkResult = {
        command: args.check,
        status: 'failed',
        exitCode: typeof error.status === 'number' ? error.status : null,
        output: String(error.stdout ?? '').slice(-2000),
        error: String(error.stderr ?? error.message).slice(-2000),
      };
      const result = fail('check-failed', 'verification command failed in the writer worktree', { check: checkResult, applied: false });
      if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  }

  try {
    execFileSync('git', ['apply', '--check', '--binary', '-'], { cwd: context.repo, input: context.patch, stdio: ['pipe', 'pipe', 'pipe'] });
    if (args.apply) execFileSync('git', ['apply', '--binary', '-'], { cwd: context.repo, input: context.patch, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    const result = fail('apply-check', 'patch does not apply cleanly to the source working tree', { applied: false, error: String(error.stderr ?? error.message).slice(-2000) });
    if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const result = {
    status: 'passed',
    repo: context.repo,
    worktree: context.worktree,
    baseCommit: context.worktreeHead,
    reviewedTree: context.tree,
    patchSha256: sha256(context.patch),
    reviewSha256: sha256(reviewText),
    reviewer: review.reviewer,
    findings: review.findings,
    check: checkResult,
    applied: args.apply,
    committed: false,
    appliedAt: new Date().toISOString(),
  };
  if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

main();
