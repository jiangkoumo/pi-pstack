#!/usr/bin/env node
// Pi adaptation of pstack's plan gate, by Lauren Tan (Copyright 2026, MIT).
// Pinned source: f713f14203cd6420cec13cd7c55c32d598dbab68.
// Original license: ../LICENSES/pstack.txt. JSON schema and receipts are Pi additions.
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const placeholder = /<[^>\n]+>|\b(?:TODO|TBD|CHANGEME)\b/;
const sha = value => typeof value === 'string' && /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value);
const integer = (value, max) => Number.isInteger(value) && value >= 1 && value <= max;
const reserved = ['commit', 'push', 'open-pr', 'merge', 'rebase', 'retarget', 'force-push', 'delete'];

/** Extract only a top-level fenced contract, never a nested example or HTML comment. */
export function parsePlan(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let fence = null;
  let comment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const close = line.match(/^ {0,3}(`+|~+)\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        if (fence.plan) blocks.push({ raw: fence.lines.join('\n'), line: fence.line });
        fence = null;
      } else if (fence.plan) fence.lines.push(line);
      continue;
    }
    // Contracts inside comments are documentation, not the plan to execute.
    if (comment || line.includes('<!--')) {
      comment = !line.includes('-->');
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
    if (open) fence = { char: open[1][0], length: open[1].length, plan: open[2].trim() === 'pstack-plan', lines: [], line: i + 1 };
  }
  if (fence) throw new Error('Unclosed fenced block');
  if (blocks.length !== 1) throw new Error(`Expected exactly one pstack-plan block, found ${blocks.length}`);
  try { return { plan: JSON.parse(blocks[0].raw), line: blocks[0].line }; }
  catch (error) { throw new Error(`Invalid plan JSON at line ${blocks[0].line}: ${error.message}`); }
}

/** Read-only structural gate. Does not run commands or prove behavior. */
export function validatePlan(plan, { complete = false, planPath = resolve('plan.md') } = {}) {
  const problems = [];
  const fail = (path, message) => problems.push(`${path}: ${message}`);
  const needText = (value, path) => {
    if (!text(value) || placeholder.test(value)) fail(path, 'requires concrete text without placeholders');
  };
  const needList = (value, path, nonempty = true) => {
    if (!Array.isArray(value) || (nonempty && value.length === 0)) {
      fail(path, nonempty ? 'requires a nonempty array' : 'requires an array');
      return [];
    }
    return value;
  };
  const strings = (value, path) => {
    const list = needList(value, path);
    list.forEach((v, i) => needText(v, `${path}[${i}]`));
    if (new Set(list).size !== list.length) fail(path, 'duplicate values');
    return list;
  };
  if (!object(plan)) return ['plan: requires an object'];
  if (plan.schemaVersion !== 1) fail('schemaVersion', 'expected 1');
  needText(plan.goal, 'goal');
  needText(plan.repository, 'repository');
  const execution = object(plan.execution) ? plan.execution : {};
  if (!object(plan.execution)) fail('execution', 'requires an object');
  if (!['skills/poteto-mode/playbooks/orchestrate.md', 'skills/poteto-mode/playbooks/autonomous-run.md'].includes(execution.playbook)) fail('execution.playbook', 'use the bundled orchestrate or autonomous-run playbook');
  if (execution.approval !== 'explicit-go-required') fail('execution.approval', 'expected explicit-go-required');
  if (!integer(execution.maxTurns, 100)) fail('execution.maxTurns', 'expected integer 1..100');
  if (!integer(execution.maxParallel, 10)) fail('execution.maxParallel', 'expected integer 1..10');
  needText(execution.stopCommand, 'execution.stopCommand');
  strings(execution.standingOrders, 'execution.standingOrders');
  const actions = strings(execution.reservedActions, 'execution.reservedActions');
  for (const action of reserved) if (!actions.includes(action)) fail('execution.reservedActions', `missing ${action} authorization gate`);
  for (const name of ['prototypes', 'risks', 'reading']) {
    needList(plan[name], name, false).forEach((entry, i) => needText(entry, `${name}[${i}]`));
  }
  const prs = needList(plan.prs, 'prs');
  const byId = new Map();
  for (const [index, pr] of prs.entries()) {
    if (!object(pr)) { fail(`prs[${index}]`, 'requires an object'); continue; }
    if (!text(pr.id) || !/^[A-Z][A-Z0-9-]*$/.test(pr.id)) fail(`prs[${index}].id`, 'expected uppercase id such as PR1');
    if (byId.has(pr.id)) fail(`prs[${index}].id`, 'duplicate PR id');
    byId.set(pr.id, pr);
  }
  for (const [index, pr] of prs.entries()) {
    const path = `prs[${index}]`;
    if (!object(pr)) continue;
    needText(pr.title, `${path}.title`);
    needText(pr.owner, `${path}.owner`);
    needText(pr.branch, `${path}.branch`);
    needText(pr.base, `${path}.base`);
    strings(pr.files, `${path}.files`);
    const deps = needList(pr.dependsOn, `${path}.dependsOn`, false);
    if (new Set(deps).size !== deps.length) fail(`${path}.dependsOn`, 'duplicate dependencies');
    for (const id of deps) if (id === pr.id || !byId.has(id)) fail(`${path}.dependsOn`, `unknown or self dependency ${String(id)}`);
    if (!['planned', 'active', 'blocked', 'verified'].includes(pr.state)) fail(`${path}.state`, 'expected planned, active, blocked, or verified');
    if (pr.head !== 'pending' && !sha(pr.head)) fail(`${path}.head`, 'expected pending or full commit SHA');
    const evidence = new Set();
    const evidencePath = (value, at) => {
      needText(value, at);
      if (text(value) && (isAbsolute(value) || value.includes('\\') || value.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/i.test(value))) fail(at, 'expected relative artifact path below the plan directory');
      if (evidence.has(value)) fail(at, 'duplicate evidence path');
      evidence.add(value);
    };
    const tasks = (value, at, fields) => {
      const rows = needList(value, at);
      rows.forEach((row, i) => {
        if (!object(row)) { fail(`${at}[${i}]`, 'requires an object'); return; }
        fields.forEach(field => needText(row[field], `${at}[${i}].${field}`));
        evidencePath(row.evidence, `${at}[${i}].evidence`);
      });
      return rows;
    };
    tasks(pr.build, `${path}.build`, ['task']);
    tasks(pr.observable, `${path}.observable`, ['result', 'pass']);
    const verification = object(pr.verification) ? pr.verification : {};
    tasks(verification.unit, `${path}.verification.unit`, ['command', 'pass']);
    const lanes = tasks(verification.live, `${path}.verification.live`, ['scenario', 'drive', 'pass']);
    if (!lanes.some(lane => object(lane) && lane.regression === true)) fail(`${path}.verification.live`, 'requires a regression lane comparing trunk and head, or recording feature absence');
    const perf = verification.perf;
    if (!object(perf)) fail(`${path}.verification.perf`, 'requires a measured gate or reasoned notApplicable');
    else if (Object.hasOwn(perf, 'notApplicable')) {
      needText(perf.notApplicable, `${path}.verification.perf.notApplicable`);
      if (Object.keys(perf).length !== 1) fail(`${path}.verification.perf`, 'notApplicable cannot coexist with a measured gate');
    } else {
      for (const field of ['metric', 'probe', 'baseline', 'rule']) needText(perf[field], `${path}.verification.perf.${field}`);
      evidencePath(perf.evidence, `${path}.verification.perf.evidence`);
    }
    if (!object(pr.review) || typeof pr.review.required !== 'boolean') fail(`${path}.review`, 'requires boolean required');
    else if (pr.review.required) {
      strings(pr.review.screenshots, `${path}.review.screenshots`).forEach((p, i) => evidencePath(p, `${path}.review.screenshots[${i}]`));
      evidencePath(pr.review.video, `${path}.review.video`);
      evidencePath(pr.review.approvalEvidence, `${path}.review.approvalEvidence`);
    } else needText(pr.review.reason, `${path}.review.reason`);
    if (!object(pr.merge) || pr.merge.gate !== 'explicit-authorization') fail(`${path}.merge`, 'requires explicit-authorization gate');
    needText(pr.merge?.owner, `${path}.merge.owner`);
    if (complete) {
      if (pr.state !== 'verified' || !sha(pr.head)) fail(path, 'completion requires verified state and full head SHA');
      const receipts = needList(pr.receipts, `${path}.receipts`);
      const recorded = new Set();
      for (const [i, receipt] of receipts.entries()) {
        const at = `${path}.receipts[${i}]`;
        if (!object(receipt)) { fail(at, 'requires an object'); continue; }
        if (recorded.has(receipt.evidence)) fail(at, 'duplicate receipt');
        recorded.add(receipt.evidence);
        if (!evidence.has(receipt.evidence)) fail(at, 'receipt is not declared evidence');
        if (receipt.head !== pr.head) fail(at, 'stale receipt head');
        if (receipt.exitCode !== 0) fail(at, 'receipt exitCode must be 0');
        needText(receipt.summary, `${at}.summary`);
        // No shell expansion and no execution of plan-provided commands.
        if (text(receipt.evidence) && evidence.has(receipt.evidence)) {
          try {
            if (!statSync(resolve(dirname(planPath), receipt.evidence)).isFile()) fail(at, 'evidence is not a file');
          } catch { fail(at, `missing evidence file ${receipt.evidence}`); }
        }
      }
      for (const artifact of evidence) if (!recorded.has(artifact)) fail(path, `missing receipt for ${artifact}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) { fail('prs.dependsOn', `dependency cycle at ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const deps = byId.get(id)?.dependsOn;
    if (Array.isArray(deps)) for (const dep of deps) if (byId.has(dep)) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return problems;
}

export function main(argv, io = { out: console.log, err: console.error }) {
  const complete = argv.includes('--complete');
  const files = argv.filter(arg => arg !== '--complete');
  if (files.length !== 1 || files[0].startsWith('-') || argv.filter(arg => arg === '--complete').length > 1) {
    io.err('Usage: node scripts/check-plan.mjs [--complete] <plan.md>');
    return 2;
  }
  const file = resolve(files[0]);
  let parsed;
  try { parsed = parsePlan(readFileSync(file, 'utf8')); }
  catch (error) { io.err(`${file}:1: ${error.message}`); return error.code ? 2 : 1; }
  const problems = validatePlan(parsed.plan, { complete, planPath: file });
  for (const problem of problems) io.err(`${file}:${parsed.line}: ${problem}`);
  io.out(`${Array.isArray(parsed.plan?.prs) ? parsed.plan.prs.length : 0} PR sections, ${problems.length} problems (${complete ? 'complete' : 'structure'})`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
