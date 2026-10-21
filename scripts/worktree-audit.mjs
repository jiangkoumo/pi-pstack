#!/usr/bin/env node
// Pi adaptation of pstack's worktree-audit.sh, by Lauren Tan (Copyright 2026, MIT).
// Pinned source: f713f14203cd6420cec13cd7c55c32d598dbab68.
// Original license: ../LICENSES/pstack.txt. JSON output, base-ref handling and the
// no-write guarantee are Pi adaptations of the upstream audit lever.
//
// Read-only audit of every worktree attached to a repository. Paths come from
// `git worktree list --porcelain`, never from hand-typed directory names. No
// command in this script writes: no prune, no remove, no checkout, no fetch.
//
// Usage:
//   node scripts/worktree-audit.mjs [--pretty] [-b <base-ref>] [--size] [repo-path]
//
// Base ref defaults to origin/HEAD, then main, then master, then HEAD. Pass
// -b origin/<branch> when PRs target another branch.
//
// Exit codes: 0 audit produced; 2 usage, not a repository, or unknown base ref.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;

const USAGE = `Usage: node scripts/worktree-audit.mjs [options] [repo-path]

  -b, --base <ref>   base ref for merge checks (default: origin/HEAD, main, master, HEAD)
  --size             include each worktree's size in KB (runs du)
  --pretty           indent the JSON output
  -h, --help         show this help

Read-only: lists worktrees from git and never writes, prunes, or removes anything.
Exit codes: 0 audit produced, 2 usage or repository/base error.`;

export class CliError extends Error {
  constructor(code, message, exitCode) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseArgs(argv) {
  const options = { base: null, pretty: false, size: false, repo: null, help: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '-b': case '--base': {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith('-')) throw new CliError('usage', `${arg} requires a base ref`, 2);
        index += 1;
        options.base = next;
        break;
      }
      case '--size': options.size = true; break;
      case '--pretty': options.pretty = true; break;
      case '-h': case '--help': options.help = true; break;
      default:
        if (arg.startsWith('-')) throw new CliError('usage', `unknown argument: ${arg}`, 2);
        positional.push(arg);
    }
  }
  if (positional.length > 1) throw new CliError('usage', 'accepts at most one repository path', 2);
  options.repo = resolve(positional[0] || process.cwd());
  return options;
}

function git(cwd, args, env = process.env) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (result.error) {
    if (result.error.code === 'ENOENT') throw new CliError('git-missing', 'git not found on PATH', 2);
    throw new CliError('git-failed', `failed to run git: ${result.error.message}`, 2);
  }
  return { status: result.status, stdout: result.stdout || '', stderr: (result.stderr || '').trim() };
}

function revParse(root, ref, env) {
  const result = git(root, ['rev-parse', '--verify', '--quiet', ref], env);
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Parse `git worktree list --porcelain` records. Pure and exported for tests. */
export function parsePorcelain(text) {
  const records = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      if (current) { records.push(current); current = null; }
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      if (current) records.push(current);
      current = { path: value, head: null, branch: null, bare: false, detached: false, locked: false, prunable: false };
      continue;
    }
    if (!current) continue;
    if (key === 'HEAD') current.head = value;
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    else if (key === 'bare') current.bare = true;
    else if (key === 'detached') current.detached = true;
    else if (key === 'locked') current.locked = true;
    else if (key === 'prunable') current.prunable = true;
  }
  if (current) records.push(current);
  for (const record of records) if (!record.branch && record.head) record.detached = true;
  return records;
}

export function resolveBase(root, requested, env = process.env) {
  if (requested) {
    const commit = revParse(root, `${requested}^{commit}`, env);
    if (!commit) throw new CliError('base-missing', `base ref not found: ${requested}`, 2);
    return { ref: requested, commit, requested: true };
  }
  for (const candidate of ['origin/HEAD', 'main', 'master', 'HEAD']) {
    const commit = revParse(root, `${candidate}^{commit}`, env);
    if (commit) return { ref: candidate, commit, requested: false };
  }
  throw new CliError('base-missing', 'cannot resolve a base ref; pass -b <base-ref>', 2);
}

function isAncestor(root, head, baseCommit, env) {
  const result = git(root, ['merge-base', '--is-ancestor', head, baseCommit], env);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return null;
}

function describe(root, record, base, { size = false, env = process.env, mainPath = root } = {}) {
  const path = resolve(record.path);
  const main = path === resolve(mainPath);
  const exists = existsSync(path);
  const changes = { tracked: 0, untracked: 0, total: 0 };
  if (exists) {
    // --no-optional-locks keeps status from refreshing the index, so the audit is write-free.
    const status = git(path, ['--no-optional-locks', 'status', '--porcelain'], env);
    if (status.status === 0) {
      for (const line of status.stdout.split('\n')) {
        if (!line) continue;
        if (line.startsWith('??')) changes.untracked += 1;
        else changes.tracked += 1;
      }
      changes.total = changes.tracked + changes.untracked;
    }
  }
  let commit = null;
  let ahead = null;
  let behind = null;
  if (record.head) {
    const log = git(root, ['log', '-1', '--format=%cI%x00%h%x00%s', record.head], env);
    if (log.status === 0 && log.stdout.trim()) {
      const [at, short, subject] = log.stdout.trim().split('\0');
      commit = { at: at || null, short: short || null, subject: subject || null };
    }
    const range = git(root, ['rev-list', '--left-right', '--count', `${base.commit}...${record.head}`], env);
    if (range.status === 0) {
      const [left, right] = range.stdout.trim().split(/\s+/).map(Number);
      behind = Number.isFinite(left) ? left : null;
      ahead = Number.isFinite(right) ? right : null;
    }
  }
  let sizeKB = null;
  if (size && exists) {
    const du = spawnSync('du', ['-sk', path], { encoding: 'utf8', env });
    if (!du.error && du.status === 0) {
      const value = Number.parseInt(du.stdout.trim().split(/\s+/)[0], 10);
      if (Number.isFinite(value)) sizeKB = value;
    }
  }
  const merged = record.head ? isAncestor(root, record.head, base.commit, env) : null;
  let classification;
  if (main) classification = 'main';
  else if (!exists) classification = 'missing';
  else if (changes.total > 0) classification = 'dirty';
  else if (record.detached) classification = 'detached';
  else if (merged === false) classification = 'unmerged';
  else if (merged === true) classification = 'merged';
  else classification = 'unknown';
  const bucket = classification === 'main'
    ? 'keep'
    : classification === 'missing'
      ? 'prune-metadata'
      : classification === 'dirty'
        ? 'hold-wip'
        : classification === 'detached'
          ? 'review-detached'
          : classification === 'unmerged'
            ? 'keep'
            : classification === 'merged'
              ? 'safe-to-remove'
              : 'review';
  return {
    path,
    main,
    branch: record.branch,
    detached: record.detached,
    bare: record.bare,
    locked: record.locked,
    prunable: record.prunable,
    exists,
    dirty: changes.total > 0,
    head: record.head,
    shortHead: commit?.short || (record.head ? record.head.slice(0, 7) : null),
    mergedIntoBase: merged,
    ahead,
    behind,
    changes,
    lastCommitAt: commit?.at || null,
    lastCommitSubject: commit?.subject || null,
    sizeKB,
    classification,
    bucket,
  };
}

/** Pure read-only audit. Every git invocation is a query. */
export function auditWorktrees({ repo, base: baseRef = null, size = false, env = process.env } = {}) {
  const directory = resolve(repo || process.cwd());
  if (!existsSync(directory)) throw new CliError('repo-missing', `repository directory does not exist: ${directory}`, 2);
  const toplevel = git(directory, ['rev-parse', '--show-toplevel'], env);
  if (toplevel.status !== 0) {
    throw new CliError('not-a-repository', `not a git worktree: ${directory}${toplevel.stderr ? ` (${toplevel.stderr})` : ''}`, 2);
  }
  const root = resolve(toplevel.stdout.trim());
  const base = resolveBase(root, baseRef, env);
  const listed = git(root, ['worktree', 'list', '--porcelain'], env);
  if (listed.status !== 0) throw new CliError('git-failed', `git worktree list failed: ${listed.stderr}`, 2);
  const records = parsePorcelain(listed.stdout);
  // git lists the main worktree first; the directory we ran from may be a linked one.
  const mainPath = records.length ? resolve(records[0].path) : root;
  const worktrees = records.map(record => describe(root, record, base, { size, env, mainPath }));
  const count = key => worktrees.filter(item => item[key]).length;
  const summary = {
    total: worktrees.length,
    dirty: count('dirty'),
    detached: count('detached'),
    merged: worktrees.filter(item => item.classification === 'merged').length,
    unmerged: worktrees.filter(item => item.mergedIntoBase === false).length,
    missing: worktrees.filter(item => !item.exists).length,
    locked: count('locked'),
    prunable: count('prunable'),
  };
  return { schemaVersion: SCHEMA_VERSION, ok: true, repository: root, base, worktrees, summary };
}

function output(value, pretty, out) {
  out(pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

export function main(argv, io = {}, deps = {}) {
  const out = io.out || (line => process.stdout.write(`${line}\n`));
  const err = io.err || (line => process.stderr.write(`${line}\n`));
  const env = deps.env || process.env;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    output({ schemaVersion: SCHEMA_VERSION, ok: false, error: { code: error.code || 'usage', message: error.message } }, false, out);
    err(`worktree-audit: ${error.message}`);
    return error.exitCode || 2;
  }
  if (options.help) {
    out(USAGE);
    return 0;
  }
  try {
    const report = auditWorktrees({ repo: options.repo, base: options.base, size: options.size, env });
    output(report, options.pretty, out);
    return 0;
  } catch (error) {
    output({
      schemaVersion: SCHEMA_VERSION,
      ok: false,
      repository: options.repo,
      error: { code: error.code || 'audit-failed', message: error.message },
    }, options.pretty, out);
    err(`worktree-audit: ${error.message}`);
    return error.exitCode || 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
