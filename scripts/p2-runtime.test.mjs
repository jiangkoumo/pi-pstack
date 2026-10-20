import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { spawnSync } from 'node:child_process';

test('B2 run directory and module probes respect an isolated PI_CODING_AGENT_DIR', () => extensionFixture(async ({ directory, commands, handlers, ctx }) => {
  await commands.get('poteto-mode')('on', ctx);
  const event = { messageType: 'user', prompt: 'plan the work', systemPromptOptions: { sections: {} } };
  await handlers.get('before_agent_start')(event, ctx);
  assert.match(Object.values(event.systemPromptOptions.sections).join('\n'), new RegExp(JSON.stringify(resolve(directory, 'agent/pstack-runs')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}));

test('B2 module probes do not fall back to the real agent directory', () => extensionFixture(async ({ directory }) => {
  for (const script of ['check-p3-agents.mjs', 'check-p3-readonly-gate.mjs']) {
    const result = spawnSync(process.execPath, [resolve('scripts', script), '--allow-skip'], {
      encoding: 'utf8', env: { ...process.env, PI_SUBAGENTS_ROOT: '', PI_CODING_AGENT_DIR: resolve(directory, 'isolated-agent') },
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'skipped');
    assert(report.candidates.includes(resolve(directory, 'isolated-agent/npm/node_modules/pi-subagents')));
  }
}));

const { default: pstack } = await createJiti(import.meta.url).import('../extensions/pstack/index.ts');
async function extensionFixture(run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-role-regression-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = resolve(directory, 'agent');
  const handlers = new Map();
  const commands = new Map();
  const messages = [];
  const manager = SessionManager.create(directory, resolve(directory, 'sessions'));
  const model = { provider: 'fixture', id: 'model', reasoning: false };
  const ctx = {
    cwd: directory, mode: 'rpc', sessionManager: manager, model,
    modelRegistry: { getAvailable: () => [model] },
    isIdle: () => true, isProjectTrusted: () => false,
  };
  pstack({
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command.handler),
    appendEntry: (type, data) => manager.appendCustomEntry(type, data),
    sendMessage: message => messages.push(JSON.parse(message.content)),
  });
  try { await run({ directory, handlers, commands, messages, manager, ctx }); }
  finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(directory, { recursive: true, force: true });
  }
}

test('B7 configured roles reach pstack skill requests with mode off or never enabled', () => extensionFixture(async ({ commands, handlers, ctx }) => {
  await commands.get('setup-pstack')('set user review fixture/model off', ctx);
  for (const explicitlyOff of [false, true]) {
    if (explicitlyOff) await commands.get('poteto-mode')('off', ctx);
    const event = { messageType: 'user', prompt: '/skill:arena review this', systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(event, ctx);
    const guidance = Object.values(event.systemPromptOptions.sections).join('\n');
    assert.match(guidance, /"review":\{"model":"fixture\/model","thinking":"off"\}/);
    assert.doesNotMatch(guidance, /is ON/);
  }
}));
import { MODE_ENTRY, modeFromBranch, modeGuidance, parseConfig, validateChoices, resolveSubagentModel, applySubagentRole } from '../extensions/pstack/runtime.mjs';
import { configPaths, loadConfig, updateConfig } from '../extensions/pstack/config.mjs';

const modeEntry = enabled => ({ type: 'custom', customType: MODE_ENTRY, data: { version: 1, enabled } });
test('mode follows only the supplied branch, defaults off and rejects unknown versions', () => {
  assert.deepEqual(modeFromBranch([]), { enabled: false, explicit: false });
  assert.equal(modeFromBranch([modeEntry(true)]).enabled, true);
  assert.equal(modeFromBranch([modeEntry(true), modeEntry(false)]).enabled, false);
  assert.equal(modeFromBranch([modeEntry(true)]).enabled, true);
  assert.throws(() => modeFromBranch([{ ...modeEntry(true), data: { version: 2, enabled: true } }]), /Unsupported/);
  assert.equal(modeFromBranch([{ ...modeEntry(true), data: { version: 2 } }, modeEntry(false)]).enabled, false, 'off recovers from an older incompatible entry');
  assert.equal(modeGuidance({ explicit: false }, '/skill', {}), undefined);
  assert.match(modeGuidance({ enabled: false, explicit: true }, '/skill', {}), /OFF/);
});
test('strict schema and exact model/thinking reject bad choices without substitution', () => {
  const m = { provider: 'test', id: 'a/b', reasoning: true };
  const good = parseConfig({ version: 1, roles: { code: { model: 'test/a/b', thinking: 'high' } } });
  validateChoices(good.roles, [m], m, () => ['off', 'high']);
  for (const bad of [{ version: 2, roles: {} }, { version: 1, roles: { unknown: { model: 'inherit' } } }, { version: 1, roles: { code: { model: 'fuzzy' } } }, { version: 1, roles: {}, extra: true }]) assert.throws(() => parseConfig(bad));
  assert.throws(() => validateChoices({ code: { model: 'test/missing' } }, [m], m, () => ['high']), /not available/);
  assert.throws(() => validateChoices({ code: { model: 'inherit', thinking: 'max' } }, [m], m, () => ['high']), /unsupported/);
});
test('resolveSubagentModel strictly resolves role, dispatches configured catalog models, and rejects bad models without fallback', () => {
  const m1 = { provider: 'magpie', id: 'opendesign/deepseek-v4.1-flash', reasoning: true };
  const m2 = { provider: 'test', id: 'worker-model', reasoning: true };
  const available = [m1, m2];
  const levels = m => m === m1 ? ['off', 'low', 'high'] : ['off'];

  // Test inherit / unconfigured
  const emptyRoles = {};
  assert.deepEqual(resolveSubagentModel('pstack.comment-sicko', emptyRoles, available, m1, levels), { role: 'review', model: undefined });
  assert.deepEqual(resolveSubagentModel('poteto-agent', { code: { model: 'inherit' } }, available, m1, levels), { role: 'code', model: 'magpie/opendesign/deepseek-v4.1-flash' });

  assert.deepEqual(resolveSubagentModel('review', { review: { model: 'inherit', thinking: 'high' } }, available, m1, levels), { role: 'review', model: 'magpie/opendesign/deepseek-v4.1-flash:high' });
  assert.throws(() => resolveSubagentModel('review', { review: { model: 'inherit', thinking: 'max' } }, available, m1, levels), /unsupported/);
  assert.throws(() => resolveSubagentModel('review', { review: { model: 'inherit' } }, available, null, levels), /not available/);
  const input = { agent: 'pstack.comment-sicko' };
  applySubagentRole(input, { review: { model: 'inherit', thinking: 'high' } }, available, m1, levels);
  assert.equal(input.model, 'magpie/opendesign/deepseek-v4.1-flash:high');
  applySubagentRole(input, { review: { model: 'test/worker-model' } }, available, m1, levels);
  assert.equal(input.model, 'magpie/opendesign/deepseek-v4.1-flash:high', 'explicit per-run choice wins');
  const writerInput = { agent: 'pstack.poteto-agent' };
  applySubagentRole(writerInput, { code: { model: 'test/worker-model' } }, available, m1, levels);
  assert.equal(writerInput.model, 'test/worker-model');

  // Test explicit configured model and thinking
  const configuredRoles = {
    review: { model: 'magpie/opendesign/deepseek-v4.1-flash', thinking: 'high' },
    code: { model: 'test/worker-model' }
  };
  assert.deepEqual(resolveSubagentModel('pstack.comment-sicko', configuredRoles, available, m1, levels), {
    role: 'review',
    model: 'magpie/opendesign/deepseek-v4.1-flash:high'
  });
  assert.deepEqual(resolveSubagentModel('pstack.poteto-agent', configuredRoles, available, m1, levels), {
    role: 'code',
    model: 'test/worker-model'
  });

  // Test unknown agent or role
  assert.throws(() => resolveSubagentModel('unknown-agent', configuredRoles, available, m1, levels), /Unknown agent or role/);

  // Test unavailable model in catalog: MUST fail explicitly, NO silent fallback
  const missingModelRoles = { review: { model: 'magpie/nonexistent-model' } };
  assert.throws(
    () => resolveSubagentModel('pstack.comment-sicko', missingModelRoles, available, m1, levels),
    /roles\.review\.model: magpie\/nonexistent-model is not available in catalog; cannot launch subagent without configured model/
  );

  // Test unsupported thinking level
  const badThinkingRoles = { review: { model: 'magpie/opendesign/deepseek-v4.1-flash', thinking: 'max' } };
  assert.throws(
    () => resolveSubagentModel('pstack.comment-sicko', badThinkingRoles, available, m1, levels),
    /roles\.review\.thinking: max is unsupported by magpie\/opendesign\/deepseek-v4.1-flash/
  );
});
test('configuration merges per role only for trusted projects, and writes atomically and idempotently', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'pstack-config-test-'));
  try {
    const paths = configPaths(resolve(dir, 'agent'), resolve(dir, 'project'), '.custom-pi');
    assert.equal(paths.project, resolve(dir, 'project/.custom-pi/pstack.json'), 'Project path follows the host config directory');
    const user = { version: 1, roles: { code: { model: 'test/a' }, review: { model: 'inherit' } } };
    assert.equal(await updateConfig(paths.user, () => user), true);
    const before = await stat(paths.user);
    assert.equal(await updateConfig(paths.user, () => user), false);
    assert.equal((await stat(paths.user)).mtimeMs, before.mtimeMs);
    await updateConfig(paths.project, () => ({ version: 1, roles: { code: { model: 'test/b' } } }));
    assert.equal((await loadConfig(paths, true)).roles.code.model, 'test/b');
    assert.equal((await loadConfig(paths, true)).roles.review.model, 'inherit');
    assert.equal((await loadConfig(paths, false)).roles.code.model, 'test/a');
    await writeFile(paths.project, '{broken');
    assert.equal((await loadConfig(paths, false)).roles.code.model, 'test/a');
    await assert.rejects(loadConfig(paths, true), /pstack.json/);
    await writeFile(paths.user + '.lock', 'busy');
    await assert.rejects(updateConfig(paths.user, () => user), /being edited/);
    assert.deepEqual(JSON.parse(await readFile(paths.user, 'utf8')), user);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
