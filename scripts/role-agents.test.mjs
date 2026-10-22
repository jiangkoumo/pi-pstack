import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ROLE_AGENTS, createRoleAgentController, parseRoleAgent, guardPstackTopLevelModel } from '../extensions/pstack/role-agents.mjs';

const catalog = [...Object.keys(ROLE_AGENTS), 'parent'].map(id => ({ provider: 'fixture', id }));
const levels = () => ['off', 'low', 'high'];
const content = name => `---\nname: ${name.slice(7)}\npackage: pstack\ndescription: Fixture ${name}\ntools: read, grep, find, ls\nexcludeTools: contact_supervisor\nsystemPromptMode: append\ninheritProjectContext: true\ninheritGlobalContext: false\ninheritSkills: false\nasync: true\nacceptanceRole: read-only\nlicense: MIT\n---\n\nPrompt ${name}.\n`;
async function fixture(t) {
  const dir = await mkdtemp(resolve(tmpdir(), 'pstack-role-unit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await Promise.all(Object.values(ROLE_AGENTS).map(name => writeFile(resolve(dir, name.slice(7) + '.md'), content(name))));
  const actions = [];
  const active = new Map();
  const pi = { events: { emit(event, request) {
    assert.equal(event, 'pi-subagents:runtime-agent-register:v1');
    assert.equal(request.version, 1);
    assert(!active.has(request.name), 'old registration must be disposed before replacement');
    actions.push(['register', request.name, request.definition]);
    active.set(request.name, request.definition);
    let disposed = false;
    request.result = { ok: true, registration: { dispose() {
      assert(!disposed, 'dispose each handle exactly once');
      disposed = true;
      actions.push(['dispose', request.name]);
      active.delete(request.name);
    } } };
  } } };
  return { dir, pi, actions, active };
}

test('all role bindings preserve source permissions and use separate model/thinking fields', async t => {
  const f = await fixture(t);
  const controller = createRoleAgentController(f.pi, f.dir);
  const roles = Object.fromEntries(Object.keys(ROLE_AGENTS).map(role => [role, { model: `fixture/${role}`, thinking: 'high' }]));
  const status = await controller.refresh(roles, catalog, catalog.at(-1), levels);
  assert.equal(status.state, 'registered');
  assert.match(status.precedence, /agentOverrides/);
  for (const [role, name] of Object.entries(ROLE_AGENTS)) {
    const d = f.active.get(name);
    assert.equal(d.model, `fixture/${role}`);
    assert.equal(d.thinking, 'high');
    assert.deepEqual(d.tools, ['read', 'grep', 'find', 'ls']);
    assert.deepEqual(d.excludeTools, ['contact_supervisor']);
    // An omitted extensions field keeps ambient provider extensions loadable.
    // An explicit empty list would disable them and trigger a pi-subagents warning.
    assert.equal(Object.hasOwn(d, 'extensions'), false);
    assert.equal(d.systemPromptMode, 'append');
    assert.equal(d.inheritProjectContext, true);
    assert.equal(d.inheritGlobalContext, false);
    assert.equal(d.inheritSkills, false);
    assert.equal(d.defaultAsync, true);
    assert.equal(d.acceptanceRole, 'read-only');
    assert.equal(d.systemPrompt, `Prompt ${name}.`);
  }
  await controller.refresh({ review: { model: 'inherit', thinking: 'low' } }, catalog, catalog.at(-1), levels);
  assert.equal(f.active.get(ROLE_AGENTS.review).model, 'inherit');
  assert.equal(f.active.get(ROLE_AGENTS.review).thinking, 'low');
  for (const role of ['code', 'prose', 'verification']) {
    assert(!Object.hasOwn(f.active.get(ROLE_AGENTS[role]), 'model'));
    assert(!Object.hasOwn(f.active.get(ROLE_AGENTS[role]), 'thinking'));
  }
  assert.deepEqual(f.actions.slice(catalog.length - 1, 2 * (catalog.length - 1)).map(a => a[0]), Array(catalog.length - 1).fill('dispose'));
  controller.dispose();
  controller.dispose();
  assert.equal(f.active.size, 0);
  assert.equal(controller.status().state, 'unregistered');
});

test('definition parser preserves supported frontmatter and rejects unsupported constraints', () => {
  const source = content(ROLE_AGENTS.review).replace('tools: read, grep, find, ls', 'tools:\n  - read\n  - grep').replace('license: MIT', 'extensions: ./readonly.ts\nsubagentOnlyExtensions: ./sub-only.ts\nlicense: MIT').replace('async: true', 'async: false\ntimeoutMs: 500\ntoolTimeoutMs: 400\nmaxSubagentDepth: 0\ndefaultContext: fresh\nacceptance: {"level":"none","reason":"fixture"}');
  const d = parseRoleAgent(source, ROLE_AGENTS.review, '/tmp/definitions');
  assert.deepEqual(d.tools, ['read', 'grep']);
  assert.deepEqual(d.extensions, ['/tmp/definitions/readonly.ts']);
  assert.deepEqual(d.subagentOnlyExtensions, ['/tmp/definitions/sub-only.ts']);
  assert.equal(d.defaultAsync, false);
  assert.equal(d.defaultTimeoutMs, 500);
  assert.equal(d.defaultToolTimeoutMs, 400);
  assert.equal(d.maxSubagentDepth, 0);
  assert.deepEqual(d.defaultAcceptance, { level: 'none', reason: 'fixture' });
  for (const line of ['allowedAgents: worker', 'tools: 123', 'async: yes', 'model: fixture/code', 'thinking: high']) {
    assert.throws(() => parseRoleAgent(content(ROLE_AGENTS.review).replace('license: MIT', line), ROLE_AGENTS.review, '/tmp/definitions'));
  }
  assert.throws(() => parseRoleAgent(source.replace('package: pstack', 'package: other'), ROLE_AGENTS.review, '/tmp'));
});

test('unavailable owner and owner error stay visible; partial registration is cleaned', async t => {
  const f = await fixture(t);
  const unavailable = createRoleAgentController({ events: { emit() {} } }, f.dir);
  await assert.rejects(unavailable.refresh({}, catalog, catalog.at(-1), levels), /unavailable/);
  assert.equal(unavailable.status().state, 'unavailable');
  const error = new Error('owner refused definition');
  let calls = 0;
  const failing = createRoleAgentController({ events: { emit(event, request) {
    if (++calls === 3) request.result = { ok: false, error };
    else f.pi.events.emit(event, request);
  } } }, f.dir);
  await assert.rejects(failing.refresh({}, catalog, catalog.at(-1), levels), e => e === error);
  assert.equal(f.active.size, 0);
  assert.match(failing.status().error, /owner refused definition/);
});

test('failed refresh removes old roles, rejects missing definitions and exact unavailable choices', async t => {
  const f = await fixture(t);
  const c = createRoleAgentController(f.pi, f.dir);
  await c.refresh({}, catalog, catalog.at(-1), levels);
  await assert.rejects(c.refresh({ code: { model: 'fixture/missing' } }, catalog, catalog.at(-1), levels), /not available/);
  assert.equal(f.active.size, 0);
  await assert.rejects(c.refresh({ code: { model: 'inherit' } }, catalog, null, levels), /not available/);
  await assert.rejects(c.refresh({ review: { model: 'fixture/review', thinking: 'max' } }, catalog, catalog.at(-1), levels), /unsupported/);
  await rm(resolve(f.dir, 'verifier.md'));
  await assert.rejects(c.refresh({}, catalog, catalog.at(-1), levels), /ENOENT/);
  assert.equal(f.active.size, 0);
});

test('shutdown cancels pending refresh and serialized replacements do not leak handles', async t => {
  const f = await fixture(t);
  const c = createRoleAgentController(f.pi, f.dir);
  const cancelled = c.refresh({}, catalog, catalog.at(-1), levels);
  c.dispose();
  await cancelled;
  assert.equal(f.active.size, 0);
  await Promise.all([c.refresh({}, catalog, catalog.at(-1), levels), c.refresh({ code: { model: 'inherit' } }, catalog, catalog.at(-1), levels)]);
  assert.equal(f.active.size, Object.keys(ROLE_AGENTS).length);
  assert.equal(f.active.get(ROLE_AGENTS.code).model, 'inherit');
  c.dispose();
});

test('shared model guard blocks pstack children and literal raw scripts without mutation', () => {
  const cases = [
    { agent: 'pstack.poteto-agent' },
    { workflow: 'parallel', args: { tasks: [{ agent: 'other', task: 'one' }, { agent: 'pstack.verifier', task: 'two' }] } },
    { tasks: [{ agent: 'pstack.prose-writer', task: 'write' }] },
    { chain: [{ agent: 'other' }, { parallel: [{ agent: 'pstack.comment-sicko', task: 'review' }] }] },
    { workflow: true }, { workflow: './script.js' },
  ];
  for (const input of cases) {
    assert.equal(guardPstackTopLevelModel(input), undefined);
    input.model = 'fixture/code';
    const before = structuredClone(input);
    const result = guardPstackTopLevelModel(input, { scriptText: 'return runs.run("k", { agent: "pstack.poteto-agent" });' });
    assert.equal(result.block, true);
    assert.match(result.reason, /Remove top-level model.*\/setup-pstack/);
    assert.deepEqual(input, before);
  }
  // Scripts without visible literal pstack child are not blocked.
  assert.equal(guardPstackTopLevelModel({ workflow: true, model: 'fixture/code' }, { scriptText: 'return runs.run("k", { agent: "other" });' }), undefined);
  assert.equal(guardPstackTopLevelModel({ agent: 'other', model: 'fixture/code' }), undefined);
  assert.equal(guardPstackTopLevelModel({ action: 'status', model: 'fixture/code' }), undefined);
});
