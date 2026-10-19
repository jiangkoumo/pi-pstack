#!/usr/bin/env node
// Mechanical review gate for a writer child.
//
// Two input modes:
//   --worktree <path>  A live managed worktree (tree is frozen with git write-tree).
//   --patch <path>     The writer's captured patch (frozen with sha256), for the
//                      normal async lifecycle where the worktree is removed.
//
// The gate is intentionally parent-side: it can refuse an unreviewed change,
// but it cannot stop a parent from running raw Git commands. The workflow in
// skills/poteto-mode/SKILL.md requires this gate before applying a writer patch.
//
// Usage:
//   node scripts/writer-gate.mjs --repo <repo> (--worktree <wt> | --patch <patch>) --review <review.json> [options]
//
// Options:
//   --check "<command>"   Verify inside the worktree, or in a temp worktree for patch mode.
//   --apply               Apply the reviewed patch to the source working tree.
//   --receipt <path>      Write a JSON receipt describing the decision.
//
// Exit codes: 0 pass (and applied when requested), 1 rejected, 2 usage error.

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
const SEVERITIES = new Set(['blocking', 'non-blocking', 'info']);
const SHA = /^[0-9a-f]{40,64}$/;

function usage(message) {
  console.log(JSON.stringify({ status: 'error', code: 'usage', message }, null, 2));
  process.exit(2);
}

function parseArgs(argv) {
  const out = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') { out.apply = true; continue; }
    if (arg === '--help' || arg === '-h') usage('writer-gate --repo <repo> (--worktree <wt> | --patch <patch>) --review <review.json> [--check "<cmd>"] [--apply] [--receipt <path>]');
    const value = () => {
      const next = argv[++index];
      if (next === undefined || next.startsWith('--')) usage(`missing value for ${arg}`);
      return next;
    };
    if (arg === '--check') { out.check = value(); continue; }
    if (arg === '--repo') { out.repo = value(); continue; }
    if (arg === '--worktree') { out.worktree = value(); continue; }
    if (arg === '--patch') { out.patch = value(); continue; }
    if (arg === '--review') { out.review = value(); continue; }
    if (arg === '--receipt') { out.receipt = value(); continue; }
    usage(`unknown argument: ${arg}`);
  }
  for (const key of ['repo', 'review']) {
    if (!out[key]) usage(`missing --${key}`);
    out[key] = isAbsolute(out[key]) ? out[key] : resolve(process.cwd(), out[key]);
  }
  if (!!out.worktree === !!out.patch) usage('give exactly one of --worktree or --patch');
  if (out.worktree && !isAbsolute(out.worktree)) out.worktree = resolve(process.cwd(), out.worktree);
  if (out.patch && !isAbsolute(out.patch)) out.patch = resolve(process.cwd(), out.patch);
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

function finish(result, args, code) {
  if (args.receipt) writeFileSync(args.receipt, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
}

function verifyReview(review, mode, expected) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return fail('review-shape', 'review must be a JSON object');
  if (review.version !== 1) return fail('review-version', 'review.version must be 1');
  if (review.verdict !== 'pass') return fail('review-verdict', `review.verdict is ${JSON.stringify(review.verdict)}, expected "pass"`);
  if (typeof review.baseCommit !== 'string' || !SHA.test(review.baseCommit)) return fail('review-base', 'review.baseCommit must be a full commit id');
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
  if (review.baseCommit !== expected.baseCommit) return fail('stale-base', 'review baseCommit does not match the writer base', { expected: expected.baseCommit, review: review.baseCommit });

  if (mode === 'worktree') {
    if (typeof review.reviewedTree !== 'string' || !SHA.test(review.reviewedTree)) return fail('review-tree', 'worktree mode requires review.reviewedTree');
    if (review.reviewedTree !== expected.tree) return fail('stale-tree', 'reviewedTree does not match the current staged worktree tree; the change moved after review', { expected: expected.tree, review: review.reviewedTree });
  } else {
    if (typeof review.patchSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(review.patchSha256)) return fail('review-patch', 'patch mode requires review.patchSha256');
    if (review.patchSha256 !== expected.patchSha256) return fail('stale-patch', 'patch sha256 does not match the reviewed patch; the change moved after review', { expected: expected.patchSha256, review: review.patchSha256 });
  }
  return { status: 'ok' };
}

function runCheckInTempWorktree(repo, base, patch, command) {
  const temp = mkdtempSync(join(tmpdir(), 'pstack-gate-check-'));
  try {
    git(repo, ['worktree', 'add', '--detach', temp, base]);
    execFileSync('git', ['apply', '--binary', '-'], { cwd: temp, input: patch, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = execSync(command, { cwd: temp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60 * 1000 });
    return { command, status: 'passed', exitCode: 0, output: output.slice(-4000) };
  } catch (error) {
    return {
      command,
      status: 'failed',
      exitCode: typeof error.status === 'number' ? error.status : null,
      output: String(error.stdout ?? '').slice(-2000),
      error: String(error.stderr ?? error.message).slice(-2000),
    };
  } finally {
    try { git(repo, ['worktree', 'remove', '--force', temp]); } catch { /* best effort */ }
    rmSync(temp, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let review;
  let reviewText;
  try {
    reviewText = readFileSync(args.review, 'utf8');
    review = JSON.parse(reviewText);
  } catch (error) {
    finish(fail('review-read', `cannot read review: ${error.message}`), args, 1);
  }

  let context;
  try {
    const repo = realpathSync(args.repo);
    const repoHead = git(repo, ['rev-parse', 'HEAD']);
    const sourceStatus = git(repo, ['status', '--porcelain', '--untracked-files=normal']);
    if (sourceStatus !== '') finish(fail('source-dirty', 'source repository has uncommitted changes; refusing to apply or validate a patch on top of them', { status: sourceStatus.split('\n').slice(0, 20) }), args, 1);

    if (args.worktree) {
      const worktree = realpathSync(args.worktree);
      const worktreeHead = git(worktree, ['rev-parse', 'HEAD']);
      const worktrees = git(repo, ['worktree', 'list', '--porcelain']).split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length));
      if (!worktrees.some(path => { try { return realpathSync(path) === worktree; } catch { return false; } })) {
        finish(fail('not-a-worktree', 'worktree is not registered to this repository', { repo, worktree, registered: worktrees }), args, 1);
      }
      git(worktree, ['add', '-A']);
      const tree = git(worktree, ['write-tree']);
      const patchText = execFileSync('git', ['diff', '--cached', '--binary', 'HEAD'], { cwd: worktree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      context = { mode: 'worktree', repo, worktree, repoHead, baseCommit: worktreeHead, tree, patchText };
    } else {
      const patchPath = realpathSync(args.patch);
      const patchText = readFileSync(patchPath, 'utf8');
      context = { mode: 'patch', repo, patchPath, repoHead, baseCommit: repoHead, patchSha256: sha256(patchText), patchText };
    }
  } catch (error) {
    finish(fail('git-context', `cannot inspect repository/worktree: ${error.message}`), args, 1);
  }

  const expected = context.mode === 'worktree'
    ? { baseCommit: context.baseCommit, tree: context.tree }
    : { baseCommit: context.baseCommit, patchSha256: context.patchSha256 };
  const verified = verifyReview(review, context.mode, expected);
  if (verified.status !== 'ok') finish({ ...verified, mode: context.mode, repo: context.repo, worktree: context.worktree, patch: context.patchPath, applied: false }, args, 1);

  if (context.mode === 'worktree' && context.repoHead !== context.baseCommit) {
    finish(fail('source-moved', 'source HEAD no longer matches the reviewed base; re-run the writer from the current HEAD', { sourceHead: context.repoHead, baseCommit: context.baseCommit }), args, 1);
  }
  if (context.patchText.trim() === '') finish(fail('empty-patch', 'writer patch is empty'), args, 1);

  let checkResult;
  if (args.check) {
    if (context.mode === 'worktree') {
      try {
        const output = execSync(args.check, { cwd: context.worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60 * 1000 });
        checkResult = { command: args.check, status: 'passed', exitCode: 0, output: output.slice(-4000) };
      } catch (error) {
        checkResult = { command: args.check, status: 'failed', exitCode: typeof error.status === 'number' ? error.status : null, output: String(error.stdout ?? '').slice(-2000), error: String(error.stderr ?? error.message).slice(-2000) };
      }
    } else {
      checkResult = runCheckInTempWorktree(context.repo, context.baseCommit, context.patchText, args.check);
    }
    if (checkResult.status !== 'passed') finish(fail('check-failed', 'verification command failed before applying the patch', { check: checkResult, applied: false }), args, 1);
  }

  try {
    execFileSync('git', ['apply', '--check', '--binary', '-'], { cwd: context.repo, input: context.patchText, stdio: ['pipe', 'pipe', 'pipe'] });
    if (args.apply) execFileSync('git', ['apply', '--binary', '-'], { cwd: context.repo, input: context.patchText, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    finish(fail('apply-check', 'patch does not apply cleanly to the source working tree', { applied: false, error: String(error.stderr ?? error.message).slice(-2000) }), args, 1);
  }

  finish({
    status: 'passed',
    mode: context.mode,
    repo: context.repo,
    worktree: context.worktree,
    patch: context.patchPath,
    baseCommit: context.baseCommit,
    reviewedTree: context.tree,
    patchSha256: context.mode === 'patch' ? context.patchSha256 : sha256(context.patchText),
    reviewSha256: sha256(reviewText),
    reviewer: review.reviewer,
    findings: review.findings,
    check: checkResult,
    applied: args.apply,
    committed: false,
    appliedAt: new Date().toISOString(),
  }, args, 0);
}

main();
