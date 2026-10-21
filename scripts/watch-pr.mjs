#!/usr/bin/env node
// Pi adaptation of pstack's watch-pr watcher, by Lauren Tan (Copyright 2026, MIT).
// Pinned source: f713f14203cd6420cec13cd7c55c32d598dbab68.
// Original license: ../LICENSES/pstack.txt. The JSON snapshot, --green predicate and
// timeout/interval options are Pi adaptations of the upstream poller.
//
// Watches one GitHub pull request through `gh`, then prints a structured snapshot.
// The bare command polls until the forge reaches a terminal verdict. `--status-only`
// takes exactly one snapshot and exits 0. `--green` takes exactly one snapshot and
// exits 0 only when the PR is merge-ready, so `/loop run --until "..."` can use it.
//
// Usage:
//   node scripts/watch-pr.mjs [--pr <number>] [--repo <dir>] [--pretty]
//   node scripts/watch-pr.mjs --status-only [--pr <number>]
//   node scripts/watch-pr.mjs --green [--pr <number>]
//   node scripts/watch-pr.mjs --timeout 900 --interval 30
//
// Exit codes: 0 green (or a status snapshot); 1 not green/timeout; 2 usage;
// 3 gh missing, unauthenticated, or the PR cannot be read.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const PR_FIELDS = [
  'number',
  'url',
  'title',
  'state',
  'isDraft',
  'mergeable',
  'mergeStateStatus',
  'reviewDecision',
  'statusCheckRollup',
  'headRefOid',
  'headRefName',
  'baseRefName',
];

const USAGE = `Usage: node scripts/watch-pr.mjs [options]

  --pr <number>       pull request number (default: the branch's PR)
  --repo <dir>        repository directory for gh (default: cwd)
  --status-only       take one snapshot, report it, exit 0
  --green             take one snapshot, exit 0 only when merge-ready
  --timeout <seconds> stop polling after this long (0 = no deadline, default)
  --interval <seconds> seconds between polls (default: 30)
  --pretty            indent the JSON output
  -h, --help          show this help

Exit codes: 0 green (or status snapshot), 1 not green, 2 usage, 3 gh problem.`;

export class CliError extends Error {
  constructor(code, message, exitCode, problems = []) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.problems = problems;
  }
}

function number(value, flag, { integer = false, min = 0, allowZero = true } = {}) {
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && (integer ? Number.isInteger(parsed) : true) && (allowZero ? parsed >= min : parsed > min);
  if (!valid) throw new CliError('usage', `${flag} expects ${integer ? 'an integer' : 'a number'} ${allowZero ? '>=' : '>'} ${min}, got ${value}`, 2);
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    pr: null,
    repo: resolve(process.cwd()),
    pretty: false,
    statusOnly: false,
    green: false,
    timeout: 0,
    interval: 30,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) throw new CliError('usage', `${arg} requires a value`, 2);
      index += 1;
      return next;
    };
    switch (arg) {
      case '--pr': options.pr = number(value(), '--pr', { integer: true, min: 1, allowZero: false }); break;
      case '--repo': options.repo = resolve(value()); break;
      case '--status-only': options.statusOnly = true; break;
      case '--green': options.green = true; break;
      case '--timeout': options.timeout = number(value(), '--timeout'); break;
      case '--interval': options.interval = number(value(), '--interval', { min: 0, allowZero: false }); break;
      case '--pretty': options.pretty = true; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new CliError('usage', `unknown argument: ${arg}`, 2);
    }
  }
  if (options.green && options.statusOnly) throw new CliError('usage', '--green and --status-only both take one snapshot; pass only one', 2);
  return options;
}

/**
 * Run gh and turn its failures into explicit, non-green errors. A watcher that
 * silently maps an auth failure to "no checks" would report a false READY.
 */
export function gh(args, { cwd, env = process.env } = {}) {
  const bin = env.PSTACK_GH || 'gh';
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', env });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new CliError('gh-missing', `GitHub CLI not found (${bin}). Install gh, authenticate, or put it on PATH.`, 3);
    }
    throw new CliError('gh-failed', `failed to run ${bin}: ${result.error.message}`, 3);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const detail = stderr || `exit ${result.status}`;
    if (/auth|log ?in|token|credential/i.test(stderr)) {
      throw new CliError('gh-auth', `GitHub CLI is not authenticated: ${detail}`, 3);
    }
    if (/no (?:open )?pull requests? found/i.test(stderr)) {
      throw new CliError('pr-missing', `no pull request found: ${detail}`, 3);
    }
    throw new CliError('gh-failed', `${bin} ${args.join(' ')} failed: ${detail}`, 3);
  }
  return result.stdout;
}

export function resolvePrNumber(options, env = process.env) {
  if (options.pr !== null) return options.pr;
  const raw = gh(['pr', 'view', '--json', 'number'], { cwd: options.repo, env });
  try {
    const parsed = JSON.parse(raw);
    if (Number.isInteger(parsed.number)) return parsed.number;
  } catch { /* fall through to the explicit error */ }
  throw new CliError('pr-missing', 'could not resolve a pull request for the current branch; pass --pr <number>', 3);
}

function checkItem(entry) {
  if (!entry || typeof entry !== 'object') return { name: 'unknown', type: 'unknown', status: 'unknown', detail: null, url: null };
  if (entry.__typename === 'StatusContext' || entry.context !== undefined) {
    const state = String(entry.state || '').toUpperCase();
    const status = state === 'SUCCESS'
      ? 'passed'
      : ['FAILURE', 'ERROR'].includes(state)
        ? 'failed'
        : ['PENDING', 'EXPECTED'].includes(state)
          ? 'pending'
          : 'unknown';
    return { name: entry.context || 'status', type: 'status', status, detail: state || null, url: entry.targetUrl || null };
  }
  const runStatus = String(entry.status || '').toUpperCase();
  const conclusion = entry.conclusion ? String(entry.conclusion).toUpperCase() : null;
  let status = 'pending';
  if (runStatus === 'COMPLETED' && conclusion) {
    if (['SUCCESS', 'NEUTRAL'].includes(conclusion)) status = 'passed';
    else if (conclusion === 'SKIPPED') status = 'skipped';
    else status = 'failed';
  } else if (['SUCCESS', 'NEUTRAL'].includes(conclusion || '')) {
    status = 'passed';
  } else if (conclusion === 'SKIPPED') {
    status = 'skipped';
  } else if (['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(conclusion || '')) {
    status = 'failed';
  }
  return { name: entry.name || entry.context || 'check', type: 'check', status, detail: conclusion || runStatus || null, url: entry.detailsUrl || entry.targetUrl || null };
}

/**
 * Normalize `gh pr view --json ...` into the snapshot shape. Pure and exported so
 * unit tests can pin verdict semantics without a forge.
 */
export function normalize(view, { repo = process.cwd(), now = new Date() } = {}) {
  const checks = (Array.isArray(view.statusCheckRollup) ? view.statusCheckRollup : []).map(checkItem);
  const counts = {
    total: checks.length,
    passed: checks.filter(check => check.status === 'passed').length,
    failed: checks.filter(check => check.status === 'failed').length,
    pending: checks.filter(check => check.status === 'pending').length,
    skipped: checks.filter(check => check.status === 'skipped').length,
    unknown: checks.filter(check => check.status === 'unknown').length,
  };
  const checksState = counts.failed > 0
    ? 'failure'
    : counts.pending > 0 || counts.unknown > 0
      ? 'pending'
      : counts.total === 0
        ? 'none'
        : 'success';
  const decision = view.reviewDecision ? String(view.reviewDecision).toUpperCase() : null;
  const review = {
    decision,
    approved: decision === 'APPROVED',
    changesRequested: decision === 'CHANGES_REQUESTED',
    pending: decision === 'REVIEW_REQUIRED',
  };
  const state = String(view.state || 'OPEN').toUpperCase();
  const mergeable = view.mergeable ? String(view.mergeable).toUpperCase() : 'UNKNOWN';
  const mergeStateStatus = view.mergeStateStatus ? String(view.mergeStateStatus).toUpperCase() : 'UNKNOWN';
  const isDraft = view.isDraft === true;
  const reasons = [];
  const blockers = [];
  if (checksState === 'failure') {
    reasons.push('checks-failed');
    for (const check of checks.filter(item => item.status === 'failed')) blockers.push(`check:${check.name}`);
  }
  if (checksState === 'pending') reasons.push('checks-pending');
  if (review.changesRequested) {
    reasons.push('review-changes-requested');
    blockers.push('review:changes-requested');
  }
  if (review.pending) reasons.push('review-required');
  if (review.approved) reasons.push('review-approved');
  if (checksState === 'success') reasons.push('checks-passed');

  let verdict;
  let terminal;
  let green;
  if (state === 'MERGED') {
    verdict = 'MERGED'; terminal = true; green = true; reasons.push('merged');
  } else if (state === 'CLOSED') {
    verdict = 'CLOSED'; terminal = true; green = false; reasons.push('closed');
  } else if (isDraft) {
    verdict = 'DRAFT'; terminal = true; green = false; reasons.push('draft');
  } else if (mergeable === 'CONFLICTING' || mergeStateStatus === 'DIRTY') {
    verdict = 'CONFLICT'; terminal = true; green = false; reasons.push('merge-conflict'); blockers.push('merge:conflict');
  } else if (review.changesRequested) {
    verdict = 'CHANGES_REQUESTED'; terminal = true; green = false;
  } else if (checksState === 'failure') {
    verdict = 'CHECKS_FAILED'; terminal = true; green = false;
  } else if (checksState === 'pending') {
    verdict = 'WAITING'; terminal = false; green = false;
  } else if (review.pending) {
    verdict = 'WAITING'; terminal = false; green = false;
  } else if (mergeable === 'UNKNOWN') {
    verdict = 'WAITING'; terminal = false; green = false; reasons.push('mergeability-unknown');
  } else if (mergeable === 'MERGEABLE' && ['BLOCKED', 'UNKNOWN'].includes(mergeStateStatus)) {
    // Branch protection, a missing required review, or a merge queue. Without a
    // forge-side "why", this is a wait, never a green.
    verdict = 'WAITING'; terminal = false; green = false; reasons.push('merge-blocked');
  } else if (mergeable === 'MERGEABLE') {
    verdict = 'READY'; terminal = true; green = true;
  } else {
    verdict = 'WAITING'; terminal = false; green = false; reasons.push('mergeability-unknown');
  }

  const registered = {
    number: Number.isInteger(view.number) ? view.number : null,
    url: view.url || null,
    title: view.title || null,
    state,
    isDraft,
    headSha: view.headRefOid || null,
    headRefName: view.headRefName || null,
    baseRefName: view.baseRefName || null,
    mergeable,
    mergeStateStatus,
  };
  const checkLabel = counts.total === 0 ? 'no checks' : `${counts.passed}/${counts.total} checks passed`;
  const reviewLabel = decision ? `review ${decision}` : 'no review decision';
  return {
    schemaVersion: SCHEMA_VERSION,
    ok: true,
    generatedAt: now.toISOString(),
    repo,
    pr: registered,
    checks: { state: checksState, ...counts, items: checks },
    review,
    verdict,
    green,
    terminal,
    reasons,
    blockers,
    summary: `PR #${registered.number ?? '?'} ${verdict} (${checkLabel}, ${reviewLabel}, mergeable ${mergeable})`,
  };
}

export function fetchSnapshot(options, env = process.env) {
  const number = resolvePrNumber(options, env);
  const raw = gh(['pr', 'view', String(number), '--json', PR_FIELDS.join(',')], { cwd: options.repo, env });
  let view;
  try {
    view = JSON.parse(raw);
  } catch (error) {
    throw new CliError('gh-invalid-json', `gh returned invalid JSON: ${error.message}`, 3);
  }
  if (!Number.isInteger(view.number)) view.number = number;
  return normalize(view, { repo: options.repo });
}

function output(value, pretty, out) {
  out(pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

/** Exported for tests: run the CLI without touching process globals. */
export async function main(argv, io = {}, deps = {}) {
  const out = io.out || (line => process.stdout.write(`${line}\n`));
  const err = io.err || (line => process.stderr.write(`${line}\n`));
  const env = deps.env || process.env;
  const sleep = deps.sleep || (ms => new Promise(done => setTimeout(done, ms)));
  const now = deps.now || (() => new Date());
  let options = null;
  try {
    options = parseArgs(argv);
  } catch (error) {
    output({ schemaVersion: SCHEMA_VERSION, ok: false, error: { code: error.code || 'usage', message: error.message } }, false, out);
    err(`watch-pr: ${error.message}`);
    return error.exitCode || 2;
  }
  if (options.help) {
    out(USAGE);
    return 0;
  }
  try {
    if (!existsSync(options.repo) || !statSync(options.repo).isDirectory()) {
      throw new CliError('repo-missing', `repository directory does not exist: ${options.repo}`, 3);
    }
    const mode = options.green ? 'green' : options.statusOnly ? 'status-only' : 'watch';
    const started = now().getTime();
    let polls = 0;
    let snapshot;
    for (;;) {
      polls += 1;
      snapshot = fetchSnapshot(options, env);
      snapshot.generatedAt = now().toISOString();
      snapshot.mode = mode;
      snapshot.polls = polls;
      if (options.statusOnly || options.green || snapshot.terminal) break;
      const elapsed = now().getTime() - started;
      const remaining = options.timeout > 0 ? options.timeout * 1000 - elapsed : Number.POSITIVE_INFINITY;
      if (remaining <= 0) {
        snapshot.timedOut = true;
        snapshot.mode = mode;
        snapshot.polls = polls;
        snapshot.reasons.push('timeout');
        snapshot.summary = `${snapshot.summary}; timed out after ${options.timeout}s`;
        break;
      }
      err(`[watch-pr] ${snapshot.summary}`);
      await sleep(Math.min(options.interval * 1000, remaining));
    }
    output(snapshot, options.pretty, out);
    if (options.statusOnly) return 0;
    return snapshot.green ? 0 : 1;
  } catch (error) {
    output({
      schemaVersion: SCHEMA_VERSION,
      ok: false,
      mode: options.green ? 'green' : options.statusOnly ? 'status-only' : 'watch',
      repo: options.repo,
      error: { code: error.code || 'watch-pr-failed', message: error.message },
      problems: error.problems?.length ? error.problems : undefined,
    }, options.pretty, out);
    err(`watch-pr: ${error.message}`);
    return error.exitCode || 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
