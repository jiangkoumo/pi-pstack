import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DEFAULT_SKILL_DIRS,
  FORMAL_SKILL_COMMAND,
  SETUP_FORMAL_STATE_KEY,
  buildFormalSkillProposal,
  classifyFormalSkill,
  createProjectStateStore,
  decideFormalOffer,
  describeFormalSkillStatus,
  findFormalVerificationSkills,
  listProjectSkills,
  maybeOfferFormalVerificationSkill,
  readFormalOfferState,
  summarizeTlc,
} from '../extensions/pstack/setup-formal.mjs';
import { TLC_MISSING_WARNING } from '../extensions/pstack/verification-exec.mjs';

const FORMAL_SKILL = {
  'queue-orders': `---
name: queue-orders
description: Prove the order queue keeps FIFO order under retries before changing the worker.
---

# Queue orders

Write a small TLA+ model of the queue and run TLC over it. A violation must come
back as a counterexample in queue terms, never as a weakened invariant.
`,
  'verify-checkout': `---
name: verify-checkout
description: Drive the checkout flow in a real browser and prove the receipt renders.
---

# Verify checkout

Start the app, click through the cart, and take screenshots of each step.
`,
};

const DEFAULT_FIXTURE = { 'verify-checkout': FORMAL_SKILL['verify-checkout'] };

async function fixtureProject(t, skills = DEFAULT_FIXTURE) {
  const dir = await mkdtemp(join(tmpdir(), 'pstack-setup-formal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(skills)) {
    await mkdir(join(dir, '.pi', 'skills', name), { recursive: true });
    await writeFile(join(dir, '.pi', 'skills', name, 'SKILL.md'), body);
  }
  return dir;
}

function tlcStub(overrides = {}) {
  return async () => ({
    available: true,
    formal: 'tlc',
    java: { available: true, version: '21.0.11', major: 21, meetsMinimum: true, reason: null },
    jar: { configured: true, path: '/opt/tla/tla2tools.jar', source: 'env:TLA2TOOLS_JAR', reason: null },
    reason: null,
    warning: null,
    fallback: null,
    ...overrides,
  });
}

function noTlcStub() {
  return async () => ({
    available: false,
    formal: 'none',
    java: { available: true, version: '21.0.11', major: 21, meetsMinimum: true, reason: null },
    jar: { configured: false, path: null, source: null, reason: 'no tla2tools.jar is configured' },
    reason: 'no tla2tools.jar is configured',
    warning: TLC_MISSING_WARNING,
    fallback: { warning: TLC_MISSING_WARNING, steps: ['Test the real code with generated inputs.'] },
  });
}

function recorder(initial = null) {
  const calls = { load: 0, save: 0, asks: 0, saved: [], proposals: [] };
  let state = initial === null ? { version: 1 } : initial;
  return {
    calls,
    store: {
      async load() { calls.load += 1; return state; },
      async save(next) { calls.save += 1; calls.saved.push(next); state = next; return '/tmp/state.json'; },
    },
    ask(answer) {
      return async proposal => { calls.asks += 1; calls.proposals.push(proposal); return typeof answer === 'function' ? answer(proposal) : answer; };
    },
  };
}

const skill = (name, body) => ({ name, description: body.split('\n')[1] ?? '', content: body });

test('formal detection uses content, not a verify- prefix', () => {
  const formal = classifyFormalSkill(skill('queue-orders', FORMAL_SKILL['queue-orders']));
  assert.equal(formal.formal, true);
  assert.deepEqual(formal.tools.sort(), ['tla', 'tlc'].sort());
  assert.ok(formal.intents.includes('invariant') || formal.intents.includes('counterexample'));

  const harness = classifyFormalSkill(skill('verify-checkout', FORMAL_SKILL['verify-checkout']));
  assert.equal(harness.formal, false, 'a browser harness must not count as formal verification');
  assert.deepEqual(harness.tools, []);
  assert.equal(harness.reason, 'no model checker, proof or other formal verifier');

  const namedOnly = classifyFormalSkill({ name: 'proof-tools', content: 'Keep the changelog tidy.' });
  assert.equal(namedOnly.formal, false, 'a name alone is not evidence that a verifier runs');
});

test('discovery finds formal skills by function and lists every project skill', async t => {
  const cwd = await fixtureProject(t, FORMAL_SKILL);
  const found = await findFormalVerificationSkills({ cwd });
  assert.deepEqual(found.skills.map(entry => entry.name).sort(), ['queue-orders', 'verify-checkout']);
  assert.deepEqual(found.formal.map(entry => entry.name), ['queue-orders']);
  assert.ok(found.formal[0].judgement.reason.includes('tla'));
  assert.deepEqual(found.errors, []);
  assert.deepEqual(DEFAULT_SKILL_DIRS, ['.pi/skills', '.agents/skills']);
});

test('discovery without project skill roots is empty and silent', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'pstack-setup-formal-empty-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const found = await findFormalVerificationSkills({ cwd });
  assert.deepEqual(found.formal, []);
  assert.deepEqual(found.skills, []);
  assert.deepEqual(found.errors, []);
});

test('discovery skips node_modules and does not follow symlinked skill dirs', async t => {
  const cwd = await fixtureProject(t, FORMAL_SKILL);
  await mkdir(join(cwd, '.pi', 'skills', 'node_modules', 'pkg'), { recursive: true });
  await writeFile(join(cwd, '.pi', 'skills', 'node_modules', 'pkg', 'SKILL.md'), '---\nname: pkg\ndescription: dep\n---\nTLA+ invariant proof\n');
  await symlink(join(cwd, '.pi', 'skills', 'queue-orders'), join(cwd, '.pi', 'skills', 'linked-queue'), 'dir');
  const found = await findFormalVerificationSkills({ cwd });
  assert.deepEqual(found.skills.map(entry => entry.name).sort(), ['queue-orders', 'verify-checkout']);
  assert.deepEqual(found.formal.map(entry => entry.name), ['queue-orders']);
});

test('first run asks once, decline is recorded, and the offer never returns', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const first = await maybeOfferFormalVerificationSkill({
    cwd,
    allowPrompt: true,
    ask: state.ask('decline'),
    stateStore: state.store,
    probeTlc: tlcStub(),
  });
  assert.equal(first.status, 'declined');
  assert.equal(first.prompted, true);
  assert.equal(first.persisted, true);
  assert.equal(state.calls.asks, 1);
  assert.equal(state.calls.save, 1);
  assert.equal(state.calls.saved[0][SETUP_FORMAL_STATE_KEY].status, 'declined');
  assert.match(state.calls.saved[0][SETUP_FORMAL_STATE_KEY].decidedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(first.question, /no formal verification skill/);
  assert.match(first.question, /\/skill:create-formal-verification-skill/);

  const recorded = state.calls.saved[0];
  const second = await maybeOfferFormalVerificationSkill({
    cwd,
    allowPrompt: true,
    ask: async () => { throw new Error('the declined offer must not prompt again'); },
    stateStore: { load: async () => recorded, save: async () => { throw new Error('must not rewrite state'); } },
    probeTlc: tlcStub(),
  });
  assert.equal(second.status, 'declined-earlier');
  assert.equal(second.prompted, false);
  assert.equal(second.question, null);
});

test('repeated calls stay idempotent after a decline', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const options = { cwd, allowPrompt: true, ask: state.ask('decline'), stateStore: state.store, probeTlc: tlcStub() };
  const results = [await maybeOfferFormalVerificationSkill(options), await maybeOfferFormalVerificationSkill(options), await maybeOfferFormalVerificationSkill(options)];
  assert.equal(results[0].status, 'declined');
  assert.equal(results[1].status, 'declined-earlier');
  assert.equal(results[2].status, 'declined-earlier');
  assert.equal(state.calls.asks, 1);
  assert.equal(state.calls.save, 1);
});

test('cancelling records nothing and a later run may ask again', async t => {
  const cwd = await fixtureProject(t);
  for (const answer of [undefined, 'cancel', '', { value: 'dismiss' }]) {
    const state = recorder();
    const cancelled = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask(answer), stateStore: state.store, probeTlc: tlcStub() });
    assert.equal(cancelled.status, 'cancelled', `answer ${JSON.stringify(answer)} must be a cancel, not a decline`);
    assert.equal(cancelled.persisted, false);
    assert.equal(state.calls.save, 0, 'a cancelled prompt must not write a decision');
    assert.equal(readFormalOfferState(cancelled.nextState).status, 'unanswered');
  }

  const state = recorder();
  const ask = async () => { state.calls.asks += 1; return state.calls.asks === 1 ? 'cancel' : 'decline'; };
  const first = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask, stateStore: state.store, probeTlc: tlcStub() });
  const second = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask, stateStore: { load: async () => first.nextState ?? { version: 1 }, save: state.store.save }, probeTlc: tlcStub() });
  assert.equal(first.status, 'cancelled');
  assert.equal(second.status, 'declined');
  assert.equal(state.calls.asks, 2, 'the cancelled offer is allowed to come up again');
});

test('an errored confirmation UI counts as cancel, not decline', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: () => { throw new Error('prompt closed'); }, stateStore: state.store, probeTlc: tlcStub() });
  assert.equal(result.status, 'cancelled');
  assert.equal(state.calls.save, 0);
  assert.match(result.reason, /not a decline/);
});

test('accepting records the decision and tells the lead to run the skill', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const accepted = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask({ value: 'accept' }), stateStore: state.store, probeTlc: tlcStub() });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.persisted, true);
  assert.equal(state.calls.saved[0][SETUP_FORMAL_STATE_KEY].status, 'accepted');
  assert.equal(accepted.instruction, `Invoke ${FORMAL_SKILL_COMMAND} to generate the project-local formal verification skill.`);
  const after = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: async () => { throw new Error('must not re-offer'); }, stateStore: { load: async () => state.calls.saved[0], save: async () => {} }, probeTlc: tlcStub() });
  assert.equal(after.status, 'accepted-earlier');
  assert.equal(after.prompted, false);
});

test('an existing formal skill suppresses the offer without prompting', async t => {
  const cwd = await fixtureProject(t, { 'state-machine-proofs': FORMAL_SKILL['queue-orders'] });
  const state = recorder();
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: async () => { throw new Error('must not prompt when a formal skill exists'); }, stateStore: state.store, probeTlc: tlcStub() });
  assert.equal(result.status, 'existing-skill');
  assert.deepEqual(result.formalSkills.map(entry => entry.name), ['queue-orders']);
  assert.equal(result.prompted, false);
  assert.equal(state.calls.asks, 0);
  assert.equal(state.calls.save, 0);
});

test('a missing TLC carries the fallback and never claims a formal pass', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask('decline'), stateStore: state.store, probeTlc: noTlcStub() });
  assert.equal(result.tlc.available, false);
  assert.equal(result.tlc.fallbackRequired, true);
  assert.match(result.question, /未做形式化验证，原因是缺少 TLC/);
  assert.match(result.question, /generated-input tests/);
  assert.match(result.question, /not a formal pass/);
  assert.doesNotMatch(result.question, /TLC is available/);
  assert.equal(state.calls.proposals[0].tlc.warning, TLC_MISSING_WARNING);
  assert.ok(state.calls.proposals[0].tlc.fallback.steps.length > 0);
});

test('an available TLC names the probe result and the verification_exec path', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask('decline'), stateStore: state.store, probeTlc: tlcStub() });
  assert.equal(result.tlc.available, true);
  assert.equal(result.tlc.jarPath, '/opt/tla/tla2tools.jar');
  assert.match(result.question, /TLC is available/);
  assert.match(result.question, /Java 21\.0\.11/);
  assert.match(result.question, /verification_exec/);
  assert.match(result.question, /\.tla\/\.cfg/);
  assert.doesNotMatch(result.question, /未做形式化验证/);
});

test('a failing TLC probe degrades to the explicit fallback instead of throwing', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask('decline'), stateStore: state.store, probeTlc: async () => { throw new Error('java missing from PATH'); } });
  assert.equal(result.tlc.available, false);
  assert.match(result.tlc.reason, /TLC probe failed: java missing from PATH/);
  assert.match(result.question, /未做形式化验证，原因是缺少 TLC/);
  assert.equal(result.tlc.fallbackRequired, true);
});

test('status calls never prompt, and a missing UI is reported instead of asked', async t => {
  const cwd = await fixtureProject(t);
  let asked = 0;
  const result = await maybeOfferFormalVerificationSkill({ cwd, ask: async () => { asked += 1; return 'accept'; }, probeTlc: tlcStub(), stateStore: recorder().store });
  assert.equal(result.status, 'no-prompt');
  assert.equal(asked, 0);
  assert.equal(result.prompted, false);
  assert.ok(result.options.some(option => option.value === 'accept'));
  assert.equal(result.persisted, false);

  const noUi = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, probeTlc: tlcStub(), stateStore: recorder().store });
  assert.equal(noUi.status, 'no-ui');
  assert.equal(noUi.prompted, false);
  assert.match(noUi.reason, /nothing is recorded/);
});

test('a read-only status view reports TLC, existing skills and the recorded decision', async t => {
  const cwd = await fixtureProject(t);
  const state = { version: 1, [SETUP_FORMAL_STATE_KEY]: { status: 'declined', decidedAt: '2026-10-20T00:00:00.000Z', reason: 'user declined' } };
  const found = await findFormalVerificationSkills({ cwd });
  const status = describeFormalSkillStatus({ tlc: await (noTlcStub())(), formalSkills: found.formal, state });
  assert.equal(status.tlc.available, false);
  assert.equal(status.tlc.fallbackRequired, true);
  assert.deepEqual(status.formalVerificationSkills, []);
  assert.equal(status.offer.status, 'declined-earlier');
  assert.equal(status.offer.decidedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(status.offer.offer, false);
  assert.equal(status.offer.question, undefined);
  assert.equal(status.question, undefined);
});

test('offer decisions treat an unknown or malformed record as unanswered', () => {
  for (const state of [undefined, {}, { [SETUP_FORMAL_STATE_KEY]: null }, { [SETUP_FORMAL_STATE_KEY]: { status: 'maybe' } }]) {
    assert.equal(readFormalOfferState(state).status, 'unanswered');
    assert.equal(decideFormalOffer({ formalSkills: [], state }).offer, true);
  }
  assert.equal(decideFormalOffer({ formalSkills: [{ name: 'x' }], state: { [SETUP_FORMAL_STATE_KEY]: { status: 'declined' } } }).status, 'existing-skill');
});

test('state saves merge into the injected project state instead of replacing it', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder({ version: 1, roles: { code: { model: 'p/one' } } });
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask('decline'), stateStore: state.store, probeTlc: tlcStub() });
  assert.equal(result.status, 'declined');
  assert.deepEqual(state.calls.saved[0].roles, { code: { model: 'p/one' } });
  assert.equal(state.calls.saved[0].version, 1);
  assert.equal(state.calls.saved[0][SETUP_FORMAL_STATE_KEY].status, 'declined');
});

test('the project state store writes inside the project only', async t => {
  const cwd = await fixtureProject(t, {});
  const store = createProjectStateStore({ cwd });
  assert.equal(store.path, resolve(cwd, '.pi', 'pstack-setup.json'));
  assert.deepEqual(await store.load(), { version: 1 });
  await store.save({ roles: {}, [SETUP_FORMAL_STATE_KEY]: { status: 'declined', decidedAt: '2026-10-20T00:00:00.000Z', reason: 'no' } });
  const info = await stat(store.path);
  assert.equal(info.isFile(), true);
  assert.equal((info.mode & 0o777).toString(8), '600');
  const loaded = await store.load();
  assert.equal(loaded.version, 1);
  assert.equal(loaded[SETUP_FORMAL_STATE_KEY].status, 'declined');
  assert.deepEqual(JSON.parse(await readFile(store.path, 'utf8')), loaded);
  assert.throws(() => createProjectStateStore({ cwd, dirName: '..' }), /outside the project/);
  assert.throws(() => createProjectStateStore({ cwd, fileName: '../../escape.json' }), /outside the project/);
});

test('proposal text is bounded and carries the once-only contract', () => {
  const proposal = buildFormalSkillProposal({ tlc: null });
  assert.equal(proposal.askedOnce, true);
  assert.equal(proposal.formalSkillCommand, FORMAL_SKILL_COMMAND);
  assert.deepEqual(proposal.options.map(option => option.value), ['accept', 'decline', 'cancel']);
  assert.ok(proposal.question.length < 2000);
  assert.match(proposal.question, /not a formal pass/);
  assert.equal(proposal.tlc.probed, false);
  assert.equal(proposal.tlc.fallbackRequired, true);
  assert.equal(summarizeTlc(null).formal, 'none');
});

test('the helper never writes a skill itself', async t => {
  const cwd = await fixtureProject(t);
  const before = (await readdir(join(cwd, '.pi', 'skills'))).sort();
  const state = recorder();
  await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask('accept'), stateStore: state.store, probeTlc: tlcStub() });
  const after = (await readdir(join(cwd, '.pi', 'skills'))).sort();
  assert.deepEqual(after, before, 'generating the skill stays with the lead and /skill:create-formal-verification-skill');
});

test('the real TLC probe drives the proposal on this host', async t => {
  const cwd = await fixtureProject(t);
  const state = recorder();
  const declaredJar = Boolean(process.env.TLA2TOOLS_JAR || process.env.TLA2TOOLS);
  const result = await maybeOfferFormalVerificationSkill({ cwd, allowPrompt: true, ask: state.ask('cancel'), stateStore: state.store });
  if (declaredJar) {
    assert.equal(result.tlc.available, true, `declared tla2tools.jar must probe as available: ${result.tlc.reason}`);
    assert.match(result.question, /TLC is available/);
    assert.match(result.question, /verification_exec/);
  } else {
    assert.equal(result.tlc.available, false);
    assert.match(result.question, /未做形式化验证，原因是缺少 TLC/);
    assert.match(result.question, /not a formal pass/);
  }
  assert.equal(result.status, 'cancelled', 'the real probe must still land on the once-only decision');
  assert.equal(state.calls.save, 0);
});

test('skill discovery never reads outside the project roots', async t => {
  const cwd = await fixtureProject(t, {});
  const listing = await listProjectSkills({ cwd, skillDirs: ['../outside'] });
  assert.deepEqual(listing.roots, []);
  assert.deepEqual(listing.skills, []);
});
