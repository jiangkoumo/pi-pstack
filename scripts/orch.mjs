#!/usr/bin/env node
// Pi adaptation of pstack's orch bookkeeping CLI, by Lauren Tan (Copyright 2026, MIT).
// Pinned source: f713f14203cd6420cec13cd7c55c32d598dbab68.
// Original license: ../LICENSES/pstack.txt. The plan.md contract, JSON output and
// dry-run/execute publish gate are Pi adaptations of the upstream orch.ts store.
//
// Reads a `pstack-plan` document accepted by scripts/check-plan.mjs and computes
// the next batch of independent units from its dependency graph. It never starts
// an agent: `next` emits the argument shape a lead passes to `subagent`.
//
// State lives in a store directory outside the repository (default: a hashed
// directory under the OS temp dir). Pass --store to place it elsewhere.
//
// Usage:
//   node scripts/orch.mjs init   [--plan plan.md] [--store dir] [--pretty]
//   node scripts/orch.mjs next   [--plan plan.md] [--store dir] [--pretty]
//   node scripts/orch.mjs status [--plan plan.md] [--store dir] [--pretty]
//   node scripts/orch.mjs record <UNIT> [--state planned|active|blocked|verified|failed]
//        [--head <sha|pending>] [--evidence <relative path>]... [--exit-code <n>]
//        [--summary <text>] [--command <text>] [--pr <number>]
//   node scripts/orch.mjs publish <UNIT> (--push | --open-pr | --comment <text>)
//        [--pr <number>] [--repo <dir>] [--execute] [--dry-run]
//
// publish is dry-run by default. Only --execute runs git push / gh pr create /
// gh pr comment, and the output then says mode: "execute".
//
// Exit codes: 0 success or dry-run; 1 rejected plan, failed publish, or bad state;
// 2 usage or unknown unit; 3 git/gh could not be started.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlan, validatePlan } from './check-plan.mjs';

export const SCHEMA_VERSION = 1;
export const UNIT_STATES = ['planned', 'active', 'blocked', 'verified', 'failed'];
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const USAGE = `Usage: node scripts/orch.mjs <command> [options]

Commands:
  init      create the state store from the plan's PR units
  next      print the next batch that can run in parallel, with subagent args
  status    print counts, ready units, drift and receipt totals
  record    write one unit's state and/or a verification receipt
  publish   dry-run (default) or execute push / open-pr / comment for one unit

Options:
  --plan <path>    plan.md accepted by check-plan (default: ./plan.md)
  --store <dir>    state directory outside the repo (default: OS temp dir)
  --pretty         indent JSON output
  -h, --help       show this help

record options:
  --state <state>     planned, active, blocked, verified, failed
  --head <sha>        full 40/64-char SHA, or pending
  --evidence <path>   relative artifact path; repeat for multiple receipts
  --exit-code <n>     receipt exit code (default 0)
  --summary <text>    receipt summary (required with --evidence)
  --command <text>    command that produced the evidence
  --pr <number>       pull request number

publish actions:
  --push            git push -u origin <branch>
  --open-pr         gh pr create --base <base> --head <branch>
  --comment <text>  gh pr comment <pr> --body <text> (needs --pr or a recorded PR)
  --execute         actually run the commands; default is a dry run
  --dry-run         print the commands without running them (the default)`;

export class CliError extends Error {
  constructor(code, message, exitCode, extra = {}) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    Object.assign(this, extra);
  }
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseOptions(argv, spec) {
  const options = { plan: null, store: null, pretty: false, help: false };
  const values = new Map([['--plan', 'plan'], ['--store', 'store'], ...spec.values.map(name => [name, camel(name.slice(2))])]);
  const flags = new Set(['--pretty', ...spec.flags]);
  const multi = new Map((spec.multi || []).map(name => [name, camel(name.slice(2))]));
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') { options.help = true; continue; }
    const key = arg.startsWith('--') ? arg : null;
    if (key && (values.has(key) || multi.has(key))) {
      const next = argv[index + 1];
      if (next === undefined) throw new CliError('usage', `${arg} requires a value`, 2);
      index += 1;
      const name = camel(key.slice(2));
      if (multi.has(key)) {
        options[name] = options[name] || [];
        options[name].push(next);
      } else {
        options[name] = next;
      }
      continue;
    }
    if (key && flags.has(key)) {
      options[camel(key.slice(2))] = true;
      continue;
    }
    if (key) throw new CliError('usage', `unknown argument: ${arg}`, 2);
    positionals.push(arg);
  }
  return { options, positionals };
}

function integer(value, flag, min = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new CliError('usage', `${flag} expects an integer >= ${min}`, 2);
  return parsed;
}

export function loadPlan(planPath) {
  const absolute = resolve(planPath);
  let markdown;
  try {
    markdown = readFileSync(absolute, 'utf8');
  } catch (error) {
    throw new CliError('plan-unreadable', `cannot read plan ${absolute}: ${error.message}`, 2);
  }
  let parsed;
  try {
    parsed = parsePlan(markdown);
  } catch (error) {
    throw new CliError('plan-invalid', `${absolute}:1: ${error.message}`, 1, { problems: [error.message] });
  }
  const problems = validatePlan(parsed.plan, { planPath: absolute });
  if (problems.length) {
    throw new CliError('plan-invalid', `plan rejected by check-plan: ${problems.length} problem(s)`, 1, { problems });
  }
  return { plan: parsed.plan, line: parsed.line, planPath: absolute };
}

export function defaultStore(planPath) {
  const absolute = resolve(planPath);
  const digest = createHash('sha256').update(absolute).digest('hex').slice(0, 12);
  const name = basename(dirname(absolute)) || 'plan';
  return join(tmpdir(), 'pi-pstack-orch', `${name}-${digest}`);
}

export function storePath(store) {
  return join(store, 'units.json');
}

export function readStore(store) {
  const statePath = storePath(store);
  if (!existsSync(statePath)) return { initialized: false, units: {}, statePath };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (error) {
    throw new CliError('store-invalid', `state file is not valid JSON: ${statePath}: ${error.message}`, 1);
  }
  if (!parsed || typeof parsed.units !== 'object' || parsed.units === null) {
    throw new CliError('store-invalid', `state file has no units object: ${statePath}`, 1);
  }
  return { initialized: true, units: parsed.units, statePath, updatedAt: parsed.updatedAt || null };
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function appendJsonLine(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* keep later receipts readable */ }
  }
  return rows;
}

export function effectiveUnits(plan, state) {
  const units = new Map();
  for (const pr of plan.prs) {
    const stored = state.units[pr.id] || {};
    units.set(pr.id, {
      id: pr.id,
      title: pr.title,
      owner: pr.owner,
      branch: pr.branch,
      base: pr.base,
      dependsOn: [...pr.dependsOn],
      files: [...pr.files],
      build: pr.build,
      observable: pr.observable,
      verification: pr.verification,
      review: pr.review,
      planState: pr.state,
      planHead: pr.head,
      state: stored.state ?? pr.state,
      head: stored.head ?? pr.head,
      attempts: stored.attempts ?? 0,
      prNumber: stored.pr ?? null,
      updatedAt: stored.updatedAt ?? null,
    });
  }
  const orphaned = Object.keys(state.units).filter(id => !units.has(id));
  return { units, orphaned };
}

export function computeProgress(plan, state) {
  const { units, orphaned } = effectiveUnits(plan, state);
  const list = [...units.values()];
  const verified = new Set(list.filter(unit => unit.state === 'verified').map(unit => unit.id));
  const active = list.filter(unit => unit.state === 'active');
  const ready = list.filter(unit => unit.state === 'planned' && unit.dependsOn.every(id => verified.has(id)));
  const waiting = list.filter(unit => unit.state === 'planned' && !unit.dependsOn.every(id => verified.has(id)))
    .map(unit => ({ id: unit.id, waitingOn: unit.dependsOn.filter(id => !verified.has(id)) }));
  const maxParallel = plan.execution.maxParallel;
  const slots = Math.max(0, maxParallel - active.length);
  const batch = ready.slice(0, slots);
  const counts = {
    total: list.length,
    planned: list.filter(unit => unit.state === 'planned').length,
    active: active.length,
    blocked: list.filter(unit => unit.state === 'blocked').length,
    verified: verified.size,
    failed: list.filter(unit => unit.state === 'failed').length,
    orphaned: orphaned.length,
  };
  return {
    units: list,
    orphaned,
    counts,
    ready: ready.map(unit => unit.id),
    batch,
    waiting,
    active: active.map(unit => unit.id),
    done: [...verified],
    maxParallel,
    slots,
  };
}

function brief(planEntry, unit, ai) {
  const build = unit.build.map(row => `- ${row.task} (evidence: ${row.evidence})`).join('\n');
  const observable = unit.observable.map(row => `- ${row.result} | pass: ${row.pass} (evidence: ${row.evidence})`).join('\n');
  const unitGates = unit.verification.unit.map(row => `- ${row.command} | pass: ${row.pass} (evidence: ${row.evidence})`).join('\n');
  const live = unit.verification.live.map(row => `- ${row.scenario} | drive: ${row.drive} | pass: ${row.pass} (evidence: ${row.evidence})`).join('\n');
  const review = unit.review.required
    ? `Required: capture ${unit.review.screenshots.join(', ')}, video ${unit.review.video}, approval ${unit.review.approvalEvidence}.`
    : `Not required: ${unit.review.reason}.`;
  return [
    `GOAL: ${planEntry.goal}`,
    `UNIT: ${unit.id} — ${unit.title}`,
    `BRANCH: ${unit.branch} (base ${unit.base}); work in that branch/worktree only.`,
    `SCOPE (exclusive): ${unit.files.join(', ')}`,
    '',
    'BUILD:',
    build,
    '',
    'ACCEPTANCE:',
    observable,
    '',
    'VERIFY:',
    unitGates,
    live,
    '',
    `REVIEW GATE: ${review}`,
    `FORBIDDEN: rebase, force-push, retarget, merge, edits outside scope. Reserved actions stay gated: ${planEntry.execution.reservedActions.join(', ')}.`,
    `PLAN: ${ai.planPath}`,
    `PLAN RECEIPTS: ${ai.planPath} must keep passing node scripts/check-plan.mjs.`,
    '',
    'RECORD WHEN DONE (state store outside the repo):',
    `node ${SCRIPT_PATH} record ${unit.id} --plan ${ai.planPath} --store ${ai.store} --state verified --head <full-sha> --evidence <relative artifact> --exit-code 0 --summary "<what you actually ran and saw>"`,
    '',
    'REPORT: status, branch, head SHA, what you actually ran, deviations, follow-ups.',
  ].join('\n');
}

function suggestedCalls(planEntry, batch, ai) {
  return batch.map(unit => ({
    unit: unit.id,
    tool: 'subagent',
    description: `${unit.id}: ${unit.title}`.slice(0, 60),
    prompt: brief(planEntry, unit, ai),
  }));
}

function initStore({ plan, planPath, store, now }) {
  const existing = readStore(store);
  const units = { ...existing.units };
  let added = 0;
  for (const pr of plan.prs) {
    if (!units[pr.id]) {
      units[pr.id] = { state: pr.state, head: pr.head, attempts: 0, updatedAt: now };
      added += 1;
    }
  }
  mkdirSync(store, { recursive: true });
  const previousMeta = existsSync(join(store, 'meta.json'))
    ? (() => { try { return JSON.parse(readFileSync(join(store, 'meta.json'), 'utf8')); } catch { return null; } })()
    : null;
  const meta = {
    schemaVersion: SCHEMA_VERSION,
    planPath,
    repository: plan.repository,
    stateDir: store,
    createdAt: previousMeta?.createdAt || now,
    updatedAt: now,
  };
  writeJsonAtomic(join(store, 'meta.json'), meta);
  writeJsonAtomic(storePath(store), { schemaVersion: SCHEMA_VERSION, planPath, updatedAt: now, units });
  return { initialized: true, created: !existing.initialized, added, total: Object.keys(units).length, store };
}

function assertEvidencePath(evidence) {
  if (isAbsolute(evidence) || evidence.includes('\\') || evidence.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/i.test(evidence)) {
    throw new CliError('invalid-evidence', `evidence must be a relative path below the plan directory: ${evidence}`, 2);
  }
}

function recordUnit({ plan, planPath, store, unitId, options, now }) {
  if (!plan.prs.some(pr => pr.id === unitId)) {
    throw new CliError('unknown-unit', `unknown unit: ${unitId}`, 2);
  }
  if (!options.state && !options.head && !(options.evidence || []).length && options.pr === undefined) {
    throw new CliError('usage', 'record needs --state, --head, --evidence, or --pr', 2);
  }
  if (options.state && !UNIT_STATES.includes(options.state)) {
    throw new CliError('invalid-state', `state must be one of ${UNIT_STATES.join(', ')}`, 2);
  }
  if (options.head && options.head !== 'pending' && !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(options.head)) {
    throw new CliError('invalid-head', 'head must be pending or a full 40/64-character SHA', 2);
  }
  const evidence = options.evidence || [];
  for (const path of evidence) assertEvidencePath(path);
  const exitCode = options.exitCode === undefined ? 0 : integer(options.exitCode, '--exit-code');
  if (evidence.length && !options.summary) {
    throw new CliError('usage', '--evidence requires --summary describing what was actually observed', 2);
  }

  if (!readStore(store).initialized) initStore({ plan, planPath, store, now });
  const state = readStore(store);
  const pr = plan.prs.find(entry => entry.id === unitId);
  const current = state.units[unitId] || { state: pr.state, head: pr.head, attempts: 0 };
  const next = { ...current };
  if (options.state) next.state = options.state;
  if (options.head) next.head = options.head;
  if (options.pr !== undefined) next.pr = integer(options.pr, '--pr', 1);
  if (options.state === 'active' && next.state === 'active') next.attempts = (current.attempts || 0) + 1;
  if (next.state === 'verified') {
    if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(next.head || '')) {
      throw new CliError('invalid-head', 'a verified unit needs --head with the full commit SHA', 2);
    }
    if (!evidence.length) {
      throw new CliError('missing-receipt', 'a verified unit needs at least one --evidence receipt', 2);
    }
    if (exitCode !== 0) {
      throw new CliError('failed-receipt', 'a verified unit cannot carry a nonzero receipt exit code', 2);
    }
  }
  next.updatedAt = now;
  const units = { ...state.units, [unitId]: next };
  writeJsonAtomic(storePath(store), {
    schemaVersion: SCHEMA_VERSION,
    planPath,
    updatedAt: now,
    units,
  });
  const receipt = evidence.length
    ? {
      at: now,
      unit: unitId,
      state: next.state,
      head: next.head,
      exitCode,
      evidence: evidence.length === 1 ? evidence[0] : evidence,
      command: options.command || null,
      summary: options.summary,
      mode: 'record',
    }
    : null;
  if (receipt) appendJsonLine(join(store, 'receipts.jsonl'), receipt);
  appendJsonLine(join(store, 'events.jsonl'), {
    at: now,
    unit: unitId,
    from: current.state || null,
    to: next.state,
    head: next.head,
    note: options.summary || null,
  });
  return { unit: { id: unitId, state: next.state, head: next.head, attempts: next.attempts || 0, pr: next.pr ?? null }, receipt };
}

function receiptSummary(store) {
  const rows = readJsonLines(join(store, 'receipts.jsonl'));
  const byUnit = {};
  for (const row of rows) byUnit[row.unit] = (byUnit[row.unit] || 0) + 1;
  return { total: rows.length, byUnit, lastAt: rows.at(-1)?.at || null };
}

function drift(plan, state) {
  const rows = [];
  for (const pr of plan.prs) {
    const stored = state.units[pr.id];
    if (!stored) continue;
    const changed = [];
    if (stored.state !== pr.state) changed.push(`state ${pr.state} -> ${stored.state}`);
    if (stored.head !== pr.head) changed.push(`head ${pr.head} -> ${stored.head}`);
    if (changed.length) rows.push({ id: pr.id, planState: pr.state, recordedState: stored.state, planHead: pr.head, recordedHead: stored.head, changes: changed });
  }
  return rows;
}

function resolveRepo(planPath, plan, override) {
  const target = override ? resolve(override) : isAbsolute(plan.repository) ? plan.repository : resolve(dirname(planPath), plan.repository);
  if (!existsSync(target)) throw new CliError('repo-missing', `repository directory does not exist: ${target}`, 2);
  if (!statSync(target).isDirectory()) throw new CliError('repo-missing', `repository path is not a directory: ${target}`, 2);
  return target;
}

function prBody(plan, unit) {
  return [
    `## ${unit.title}`,
    '',
    plan.goal,
    '',
    `Files: ${unit.files.join(', ')}`,
    `Depends on: ${unit.dependsOn.length ? unit.dependsOn.join(', ') : 'none'}`,
    '',
    'Created by the pstack orchestrator after the unit recorded receipts. Landing stays behind explicit authorization.',
  ].join('\n');
}

function publishCommands({ plan, unit, repo, actions, options }) {
  const commands = [];
  if (actions.push) {
    commands.push({ action: 'push', program: 'git', args: ['push', '-u', 'origin', unit.branch], cwd: repo });
  }
  if (actions.openPr) {
    commands.push({
      action: 'open-pr',
      program: process.env.PSTACK_GH || 'gh',
      args: ['pr', 'create', '--base', unit.base, '--head', unit.branch, '--title', unit.title, '--body', prBody(plan, unit)],
      cwd: repo,
    });
  }
  if (actions.comment) {
    const number = options.pr ?? unit.prNumber;
    if (!number) throw new CliError('missing-pr', '--comment needs --pr <number> or a PR number recorded on the unit', 2);
    commands.push({
      action: 'comment',
      program: process.env.PSTACK_GH || 'gh',
      args: ['pr', 'comment', String(number), '--body', options.comment],
      cwd: repo,
    });
  }
  return commands;
}

function runCommand(command, env) {
  const result = spawnSync(command.program, command.args, { cwd: command.cwd, encoding: 'utf8', env });
  const exitCode = result.error ? (result.error.code === 'ENOENT' ? 127 : 1) : result.status ?? 1;
  return {
    action: command.action,
    program: command.program,
    args: command.args,
    cwd: command.cwd,
    exitCode,
    executed: true,
    stdout: (result.stdout || '').trim().slice(-4000),
    stderr: (result.stderr || result.error?.message || '').trim().slice(-4000),
  };
}

function publishUnit({ plan, planPath, unitId, store, options, now, env }) {
  const unit = effectiveUnits(plan, readStore(store)).units.get(unitId);
  if (!unit) throw new CliError('unknown-unit', `unknown unit: ${unitId}`, 2);
  const actions = {
    push: options.push === true,
    openPr: options.openPr === true,
    comment: options.comment || null,
  };
  if (!actions.push && !actions.openPr && !actions.comment) {
    throw new CliError('usage', 'publish needs at least one of --push, --open-pr, --comment <text>', 2);
  }
  if (options.execute && options.dryRun) throw new CliError('usage', '--execute and --dry-run are mutually exclusive', 2);
  const repo = resolveRepo(planPath, plan, options.repo);
  const commands = publishCommands({ plan, unit: { ...unit, prNumber: options.pr ?? unit.prNumber }, repo, actions, options });
  const mode = options.execute ? 'execute' : 'dry-run';
  const base = {
    schemaVersion: SCHEMA_VERSION,
    command: 'publish',
    mode,
    execute: options.execute === true,
    dryRun: options.execute !== true,
    planPath,
    store,
    unit: unit.id,
    branch: unit.branch,
    base: unit.base,
    repo,
    generatedAt: now,
  };
  if (!options.execute) {
    return {
      ...base,
      ok: true,
      warning: 'dry-run: nothing was pushed, opened, or commented; pass --execute to run',
      commands: commands.map(command => ({ action: command.action, program: command.program, args: command.args, cwd: command.cwd, executed: false })),
    };
  }
  const results = [];
  let failed = false;
  for (const command of commands) {
    if (failed) {
      results.push({ action: command.action, program: command.program, args: command.args, cwd: command.cwd, exitCode: null, executed: false, skipped: true });
      continue;
    }
    const result = runCommand(command, env);
    results.push(result);
    if (result.exitCode !== 0) failed = true;
  }
  return {
    ...base,
    ok: !failed,
    notice: 'execute mode: these commands ran for real',
    commands: results,
  };
}

function output(value, pretty, out) {
  out(pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

const SPECS = {
  init: { values: [], flags: [], multi: [] },
  next: { values: [], flags: [], multi: [] },
  status: { values: [], flags: [], multi: [] },
  record: {
    values: ['--state', '--head', '--exit-code', '--summary', '--command', '--pr'],
    flags: [],
    multi: ['--evidence'],
  },
  publish: {
    values: ['--comment', '--pr', '--repo'],
    flags: ['--push', '--open-pr', '--execute', '--dry-run'],
    multi: [],
  },
};

export function main(argv, io = {}, deps = {}) {
  const out = io.out || (line => process.stdout.write(`${line}\n`));
  const err = io.err || (line => process.stderr.write(`${line}\n`));
  const env = deps.env || process.env;
  const nowDate = deps.now || (() => new Date());
  const command = argv[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    out(USAGE);
    return command ? 0 : 2;
  }
  let parsed;
  try {
    if (!SPECS[command]) throw new CliError('usage', `unknown command: ${command}`, 2);
    parsed = parseOptions(argv.slice(1), SPECS[command]);
  } catch (error) {
    output({ schemaVersion: SCHEMA_VERSION, ok: false, command, error: { code: error.code || 'usage', message: error.message } }, false, out);
    err(`orch: ${error.message}`);
    return error.exitCode || 2;
  }
  const { options, positionals } = parsed;
  if (options.help) {
    out(USAGE);
    return 0;
  }
  const pretty = options.pretty === true;
  const now = nowDate().toISOString();
  try {
    const planPath = resolve(options.plan || 'plan.md');
    const store = resolve(options.store || defaultStore(planPath));
    if ((command === 'record' || command === 'publish') && positionals.length !== 1) {
      throw new CliError('usage', `${command} needs exactly one unit id`, 2);
    }
    if ((command === 'init' || command === 'next' || command === 'status') && positionals.length !== 0) {
      throw new CliError('usage', `${command} takes no positional arguments`, 2);
    }
    if ((command === 'record' || command === 'publish') && options.pr !== undefined) {
      options.pr = integer(options.pr, '--pr', 1);
    }
    const loaded = loadPlan(planPath);
    const { plan } = loaded;

    if (command === 'init') {
      const result = initStore({ plan, planPath, store, now });
      output({
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command,
        mode: 'write',
        planPath,
        store,
        ...result,
        units: plan.prs.map(pr => ({ id: pr.id, state: readStore(store).units[pr.id]?.state ?? pr.state })),
        note: 'state lives outside the repository; pass --store to relocate it',
      }, pretty, out);
      return 0;
    }

    if (command === 'next') {
      const state = readStore(store);
      const progress = computeProgress(plan, state);
      const ai = { planPath, store };
      const calls = suggestedCalls(plan, progress.batch, ai);
      output({
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command,
        mode: 'read',
        planPath,
        store,
        initialized: state.initialized,
        goal: plan.goal,
        maxParallel: progress.maxParallel,
        slots: progress.slots,
        active: progress.active,
        ready: progress.ready,
        batch: progress.batch.map((unit, index) => ({
          id: unit.id,
          title: unit.title,
          owner: unit.owner,
          branch: unit.branch,
          base: unit.base,
          dependsOn: unit.dependsOn,
          files: unit.files,
          state: unit.state,
          head: unit.head,
          suggestedSubagent: calls[index],
        })),
        suggestedCalls: calls,
        waiting: progress.waiting,
        done: progress.done,
        counts: progress.counts,
        warnings: [
          ...(state.initialized ? [] : ['store is not initialized; run init to persist state']),
          ...(progress.active.length >= progress.maxParallel ? ['no free parallel slots; record finished units first'] : []),
        ],
      }, pretty, out);
      return 0;
    }

    if (command === 'status') {
      const state = readStore(store);
      const progress = computeProgress(plan, state);
      const receipts = receiptSummary(store);
      output({
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command,
        mode: 'read',
        planPath,
        store,
        initialized: state.initialized,
        counts: progress.counts,
        ready: progress.ready,
        nextBatch: progress.batch.map(unit => unit.id),
        active: progress.active,
        waiting: progress.waiting,
        done: progress.done,
        units: progress.units.map(unit => ({
          id: unit.id,
          state: unit.state,
          head: unit.head,
          attempts: unit.attempts,
          pr: unit.prNumber,
          planState: unit.planState,
          updatedAt: unit.updatedAt,
        })),
        orphaned: progress.orphaned,
        receipts,
        drift: drift(plan, state),
      }, pretty, out);
      return 0;
    }

    if (command === 'record') {
      const result = recordUnit({ plan, planPath, store, unitId: positionals[0], options, now });
      output({
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command,
        mode: 'write',
        planPath,
        store,
        initialized: true,
        note: 'local bookkeeping only; no push, PR, or comment happened',
        ...result,
      }, pretty, out);
      return 0;
    }

    const result = publishUnit({ plan, planPath, unitId: positionals[0], store, options, now, env });
    output({ ...result, store }, pretty, out);
    return result.ok ? 0 : 1;
  } catch (error) {
    output({
      schemaVersion: SCHEMA_VERSION,
      ok: false,
      command,
      mode: command === 'publish' ? (options.execute ? 'execute' : 'dry-run') : 'read',
      planPath: resolve(options.plan || 'plan.md'),
      store: options.store ? resolve(options.store) : undefined,
      error: { code: error.code || 'orch-failed', message: error.message },
      problems: error.problems?.length ? error.problems : undefined,
    }, pretty, out);
    err(`orch: ${error.message}`);
    if (error.problems) for (const problem of error.problems) err(`  ${problem}`);
    return error.exitCode || 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
