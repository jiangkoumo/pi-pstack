import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFile(resolve(root, path), 'utf8');
const links = text => [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
const localLinks = text => links(text).filter(p => !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('#'));
const headings = text => [...text.replace(/```[^\n]*\n[\s\S]*?```/g, '').matchAll(/^#{1,6} (.+)$/gm)].map(m => m[1]);
const load = name => read(`skills/${name}/SKILL.md`);
const groups = {
  architect: ['design-red-flags.md', 'rationale-template.md', 'runner-prompt.md'],
  interrogate: ['code-quality-review.md', 'lead-judgment.md', 'reviewer-prompt.md', 'rubric.md'],
  reflect: ['divergent-reviewer.md', 'judgment-reviewer.md', 'synthesizer.md', 'tooling-reviewer.md'],
  why: ['epistemics.md', 'investigator-prompt.md', 'source-playbook.md', 'synthesizer-prompt.md',
    ...['code-archaeology', 'databricks', 'datadog', 'incident-postmortem', 'linear', 'notion', 'sentry', 'slack'].map(n => `sources/${n}.md`)],
};

async function reachable(start) {
  const seen = new Set();
  const queue = [resolve(root, start)];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const body = await readFile(path, 'utf8');
    assert.doesNotMatch(body, /Adaptation scaffold|pending implementation|not bundled/, path);
    for (const href of localLinks(body)) {
      const target = resolve(dirname(path), decodeURIComponent(href.split('#')[0]));
      assert(target.startsWith(root), href);
      const info = await stat(target);
      assert(info.isFile(), `Link must point to an actual readable file: ${href}`);
      if (target.startsWith(dirname(resolve(root, start)) + '/')) queue.push(target);
    }
  }
  return seen;
}

test('task 4: methodology references are reachable from their skill and retain source review dimensions', async () => {
  for (const [name, refs] of Object.entries(groups)) {
    const seen = await reachable(`skills/${name}/SKILL.md`);
    for (const ref of refs) {
      const path = `skills/${name}/references/${ref}`;
      assert(seen.has(resolve(root, path)), `Unused method reference: ${path}`);
      const [body, original] = await Promise.all([read(path), read('upstream/pstack/' + path)]);
      for (const heading of headings(original)) assert(headings(body).includes(heading), `${path}: missing ${heading}`);
      const slots = [...original.matchAll(/\{([A-Z_]+)\}/g)].map(m => m[1]);
      for (const slot of slots) assert(body.includes(`{${slot}}`), `${path}: lost prompt input ${slot}`);
    }
  }
});

test('task 4: architect grounds before sketching and retains agree, implement and scrap phases', async () => {
  const body = await load('architect');
  const phases = headings(body).filter(h => h.startsWith('Phase '));
  assert.deepEqual(phases, ['Phase A: Ground the problem', 'Phase B: Sketch', 'Phase C: Agree (opt-in)', 'Phase D: Implement against the sketch', 'Phase E: Scrap when the architecture is wrong']);
  assert(localLinks(body).includes('../how/SKILL.md'));
  assert(localLinks(body).includes('../arena/SKILL.md'));
  assert.match(body, /at least two structurally distinct candidates/);
  assert.match(body, /two or more independent/i);
});

test('task 4: arena keeps a private selection rubric and distinct cross-judge/pick/graft/verify stages', async () => {
  const body = await load('arena');
  for (const h of headings(await read('upstream/pstack/skills/arena/SKILL.md'))) assert(headings(body).includes(h), h);
  assert.match(body, /Candidates only see the task/);
  assert.match(body, /Don't spawn it while candidates are still writing/);
  assert.match(body, /criterion by criterion/);
  assert.match(body, /reframe and re-run/i);
});

test('task 4: review verdict is a lead judgment and does not authorize fixes', async () => {
  const body = await load('interrogate');
  for (const h of ['Intent', 'Reviewers', 'Act On', 'Consider', 'Noted', 'Dismissed', 'Agreement Map']) assert(headings(body).includes(h), h);
  assert.match(body, /same template for every reviewer/);
  assert.match(body, /Do NOT auto-apply changes/);
  assert.doesNotMatch(body, /one distinct lens|cannot be reproduced is not a blocker/);
});

test('task 4: swarm rejects incomparable evidence and gaps cannot count as passes', async () => {
  const body = await load('swarm');
  for (const h of headings(await read('upstream/pstack/skills/swarm/SKILL.md'))) assert(headings(body).includes(h), h);
  assert.match(body, /exact SHAs/);
  assert.match(body, /sample count/);
  assert.match(body, /respawn that worker once/);
  assert.match(body, /gap does not count as a pass/i);
});

test('task 4: why has seven source categories and preserves uncertainty through synthesis', async () => {
  const index = await read('skills/why/references/source-playbook.md');
  const sources = localLinks(index).filter(p => !p.includes('incident-postmortem'));
  assert.equal(sources.length, 7);
  const body = await load('why');
  assert(localLinks(body).includes('references/source-playbook.md'));
  assert(localLinks(body).includes('references/sources/incident-postmortem.md'));
  const epistemics = await read('skills/why/references/epistemics.md');
  for (const tier of ['Direct', 'Supported', 'Inferred', 'Speculative', 'Unknown']) assert(headings(epistemics).some(h => h.endsWith(tier)), tier);
  assert.match(body, /Preserve \/ Change \/ Avoid \/ Risk/);
});

test('task 4: reference access remains bounded by Pi authority', async () => {
  for (const name of ['architect', 'arena', 'interrogate', 'swarm', 'reflect', 'why']) {
    const body = await load(name);
    assert.match(body, /delegation.*authoriz|authoriz.*delegation/i, name);
    assert.doesNotMatch(body, /claude-opus|grok-4|readonly: false|cloud_base_branch|\.cursor\/rules/);
  }
  for (const ref of groups.why.filter(p => p.startsWith('sources/'))) {
    const body = await read(`skills/why/references/${ref}`);
    assert.match(body, /read-only/);
    assert.match(body, /permission|authoriz/);
  }
});

test('task 2: restored entry methods expose their source phases and readable references', async () => {
  for (const name of ['how', 'figure-it-out', 'blast-radius', 'benchmark-checklist', 'teach', 'show-me-your-work', 'create-verification-skill', 'maintain-verification-skill']) {
    const body = await load(name);
    assert.doesNotMatch(body, /Adaptation scaffold|pending implementation/);
    for (const heading of headings(await read(`upstream/pstack/skills/${name}/SKILL.md`))) assert(headings(body).includes(heading), `${name}: ${heading}`);
    await reachable(`skills/${name}/SKILL.md`);
  }
  const seen = await reachable('skills/how/SKILL.md');
  for (const n of ['explorer', 'explainer']) assert(seen.has(resolve(root, `skills/how/references/${n}-prompt.md`)));
});

test('task 2: benchmark contract checks work, errors, alternating trials, physical bounds and verdict', async () => {
  const body = await load('benchmark-checklist');
  const questions = [...body.matchAll(/^([1-7])\. \*\*(.+?)\*\*/gm)].map(m => m[2]);
  assert.deepEqual(questions, ['Why not double?', 'Was it tuned?', 'Did it break limits?', 'Did it error?', 'Does it reproduce?', 'Does it matter?', 'Did it even happen?']);
  assert.match(body, /each side at least 5 times, alternating/);
  assert.match(body, /10%.*11%/);
  assert.match(body, /median and range/);
  assert.match(body, /inconclusive when.*cannot name the limiter/);
  assert(localLinks(await load('principle-explain-the-number')).includes('../benchmark-checklist/SKILL.md'));
});

test('task 2: verification map examples teach observable actions and retained proof', async () => {
  const body = await load('create-verification-skill');
  const seen = await reachable('skills/create-verification-skill/SKILL.md');
  for (const name of ['create-note', 'search']) {
    const path = `skills/create-verification-skill/references/feature-map-example/${name}.md`;
    assert(seen.has(resolve(root, path)));
    assert.deepEqual(headings(await read(path)).filter(h => !h.startsWith('Create a') && h !== 'Search notes'), ['Sub-features', 'How to get to it (user POV)', 'Driving it with control-notes', 'Gotchas']);
  }
  assert.match(body, /evidence still exists/);
  assert.match(body, /\.pi\/skills\/verify-/);
  assert.doesNotMatch(body, /\.cursor\/skills/);
  const maintenance = await load('maintain-verification-skill');
  assert.match(maintenance, /Never edit product code/);
  assert.match(maintenance, /retry once/);
});

test('task 2: diagnostic and visual playbooks preserve evidence and do not imply new authority', async () => {
  for (const n of ['runtime-forensics', 'trace-forensics', 'visual-parity']) {
    const body = await read(`skills/poteto-mode/playbooks/${n}.md`);
    assert.doesNotMatch(body, /scaffold|pending implementation|Task tool/);
    assert.match(body, /authoriz/);
    assert.match(body, /artifact|baseline/);
  }
  const trace = await read('skills/poteto-mode/playbooks/trace-forensics.md');
  assert.match(trace, /fixed dataset/);
  assert.match(trace, /paired capture/);
  const visual = await read('skills/poteto-mode/playbooks/visual-parity.md');
  assert.match(visual, /nonzero diff is a fail/);
  assert.match(visual, /no baseline tampering/);
  const trail = await load('show-me-your-work');
  assert(localLinks(trail).includes('references/decision-log-template.tsv'));
  assert.doesNotMatch(trail, /scripts\/log\.sh|agent-transcripts\/|printf/);
  assert.equal((await read('skills/show-me-your-work/references/decision-log-template.tsv')).trim(), 'ts\tphase\tdecision\twhy\tevidence\tresult');
});

test('task 1: mode directly reaches all 24 fixed principle leaves and required skill triggers', async () => {
  const body = await load('poteto-mode');
  const inventory = JSON.parse(await read('docs/upstream-inventory.json'));
  const principles = inventory.skills.filter(p => p.includes('/principle-')).map(p => p.replace('pstack/skills/', '../'));
  assert.equal(principles.length, 24);
  for (const path of principles) {
    assert(localLinks(body).includes(path), `Missing direct principle link: ${path}`);
    await stat(resolve(root, 'skills/poteto-mode', path));
  }
  for (const name of ['how', 'architect', 'swarm', 'arena', 'interrogate', 'unslop', 'technical-writing', 'no-comments', 'benchmark-checklist']) {
    assert(localLinks(body).includes(`../${name}/SKILL.md`), `Missing trigger: ${name}`);
  }
  for (const n of ['runtime-forensics', 'trace-forensics', 'visual-parity']) assert(localLinks(body).includes(`playbooks/${n}.md`));
});

test('task 1: autonomy preserves pause gates while continuing authorized work and writing rules', async () => {
  const body = await load('poteto-mode');
  for (const h of ['Non-negotiables', 'Autonomy', 'Writing the reply', 'Comments', 'Substitute routes']) assert(headings(body).includes(h), h);
  assert.match(body, /going to bed/);
  assert.match(body, /force-push/);
  assert.match(body, /customer messages/);
  assert.match(body, /data deletion/);
  assert.match(body, /Do not.*fabricate.*link|Never fabricate a link/i);
  assert.match(body, /consumer.*maintainer/i);
  const routes = body.split('## Substitute routes')[1].split('\n## ')[0];
  for (const id of ['reproduce-and-fix-issues', 'setup-benny', 'triage-issue-reports', 'automate-me', 'make-bot-ui', 'recall', 'setup-pstack', 'authoring-a-skill', 'eval']) assert(routes.includes(id), id);
  for (const href of localLinks(routes)) assert((await stat(resolve(root, 'skills/poteto-mode', href))).isFile());
});

// Host acceptance is intentionally separate from static resource checks. The lead
// runs these requests after role integration, with the actual tool transcript.
export const hostAcceptance = [
  {
    request: '/skill:poteto-mode Design a durable job queue for two workers that can crash after claiming a job. Show caller usage and two distinct state models before implementing. Stop after the design. Do not delegate.',
    expected: ['read investigation playbook', 'read how and its explainer prompt', 'read architect', 'read arena and architect references', 'compare two candidates sequentially', 'return usage, signatures, ownership, invariants and rejected alternatives', 'no subagent or production edits'],
  },
  {
    request: '/skill:poteto-mode Design the same queue with two independent candidate writers and a read-only cross-judge. Delegation is authorized; use only available configured models. Stop before implementation.',
    expected: ['read architect before candidate launch', 'isolated candidate paths and same brief', 'read-only cross-judge after both candidates finish', 'parent scores every criterion and records graft provenance', 'workflow: parallel with args.tasks items { agent, task }; role models bind through registered pstack agents; no task-item or outer model override; retain actual child model evidence'],
  },
];
