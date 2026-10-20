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

// Host acceptance is intentionally separate from static resource checks. The lead
// runs these requests after role integration, with the actual tool transcript.
export const hostAcceptance = [
  {
    request: '/skill:poteto-mode Design a durable job queue for two workers that can crash after claiming a job. Show caller usage and two distinct state models before implementing. Stop after the design. Do not delegate.',
    expected: ['read investigation playbook', 'read how and its explainer prompt', 'read architect', 'read arena and architect references', 'compare two candidates sequentially', 'return usage, signatures, ownership, invariants and rejected alternatives', 'no subagent or production edits'],
  },
  {
    request: '/skill:poteto-mode Design the same queue with two independent candidate writers and a read-only cross-judge. Delegation is authorized; use only available configured models. Stop before implementation.',
    expected: ['read architect before candidate launch', 'isolated candidate paths and same brief', 'read-only cross-judge after both candidates finish', 'parent scores every criterion and records graft provenance', 'actual configured role/model evidence, verified by the lead after runtime integration'],
  },
];
