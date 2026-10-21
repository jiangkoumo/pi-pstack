import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ROLES, parseConfig } from '../extensions/pstack/runtime.mjs';
import { ROLE_AGENTS, createRoleAgentController } from '../extensions/pstack/role-agents.mjs';

const routes = {
  code: 'pstack.poteto-agent',
  'bug-fix': 'pstack.bug-fix-agent',
  perf: 'pstack.perf-agent',
  hillclimb: 'pstack.hillclimb-agent',
  judgment: 'pstack.judgment-agent',
  strongest: 'pstack.strongest-agent',
  review: 'pstack.comment-sicko',
  prose: 'pstack.prose-writer',
  verification: 'pstack.verifier',
};

test('playbook and judgment roles retain independent models in public registrations', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-playbook-roles-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const roles = Object.fromEntries(Object.keys(routes).map(role => [role, { model: `fixture/${role}`, thinking: 'high' }]));
  assert.deepEqual(new Set(ROLES), new Set(Object.keys(routes)));
  assert.deepEqual(ROLE_AGENTS, routes);
  assert.deepEqual(parseConfig({ version: 1, roles }).roles, roles);
  await Promise.all(Object.values(routes).map(name => writeFile(resolve(directory, name.slice(7) + '.md'), `---\nname: ${name.slice(7)}\npackage: pstack\ndescription: Role fixture\ntools: read\nsystemPromptMode: append\ninheritProjectContext: true\ninheritGlobalContext: false\ninheritSkills: false\nasync: true\nacceptanceRole: read-only\n---\nRole fixture.\n`)));
  const registered = new Map();
  const controller = createRoleAgentController({ events: { emit(event, request) {
    assert.equal(event, 'pi-subagents:runtime-agent-register:v1');
    registered.set(request.name, request.definition);
    request.result = { ok: true, registration: { dispose() { registered.delete(request.name); } } };
  } } }, directory);
  t.after(() => controller.dispose());
  await controller.refresh(roles, Object.keys(routes).map(id => ({ provider: 'fixture', id })), null, () => ['high']);
  for (const [role, agent] of Object.entries(routes)) {
    assert.equal(registered.get(agent).model, `fixture/${role}`);
    assert.equal(registered.get(agent).thinking, 'high');
  }
  assert.notEqual(registered.get(routes.judgment).model, registered.get(routes.strongest).model);
  assert.notEqual(registered.get(routes.prose).model, registered.get(routes.judgment).model);
});
