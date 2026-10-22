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

test('recall requests receive the exact current workspace session directory before mining', () => extensionFixture(async ({ directory, commands, handlers, ctx }) => {
  await commands.get('poteto-mode')('on', ctx);
  for (const prompt of ['上次我们做到哪了', '之前的会话', 'what did I work on', '这周我在这个项目做了什么']) {
    const event = { messageType: 'user', prompt, systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(event, ctx);
    const guidance = Object.values(event.systemPromptOptions.sections).join('\n');
    assert.match(guidance, /Read .*skills\/recall\/SKILL\.md.*before.*session/i);
    const slug = `--${directory.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
    assert(guidance.includes(JSON.stringify(resolve(directory, 'agent/sessions', slug))));
    assert.match(guidance, /Never list or search the sessions root/);
  }
}));

test('ordinary fixes mentioning recall do not trigger transcript mining guidance', () => extensionFixture(async ({ commands, handlers, ctx }) => {
  await commands.get('poteto-mode')('on', ctx);
  for (const prompt of ['fix the recall parser', 'the recall test is failing', 'add tests for recall', 'review the recall implementation']) {
    const event = { messageType: 'user', prompt, systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(event, ctx);
    assert.doesNotMatch(Object.values(event.systemPromptOptions.sections).join('\n'), /only authorized workspace session directory/);
  }
}));

test('B2 module probes do not fall back to the real agent directory', () => extensionFixture(async ({ directory }) => {
  for (const script of ['check-p3-agents.mjs', 'check-p3-readonly-gate.mjs']) {
    const result = spawnSync(process.execPath, [resolve('scripts', script), '--allow-skip'], {
      encoding: 'utf8', env: { ...process.env, PI_SUBAGENTS_ROOT: '', PI_CODING_AGENT_DIR: resolve(directory, 'isolated-agent') },
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    // A repository-local dev dependency is valid in an isolated agent directory;
    // isolation forbids the operator's ambient package, not this locked fixture.
    if (report.status !== 'passed') {
      assert.equal(report.status, 'skipped');
      assert(report.candidates.includes(resolve(directory, 'isolated-agent/npm/node_modules/pi-subagents')));
      assert(!report.candidates.includes(resolve(process.env.HOME ?? '', '.pi/agent/npm/node_modules/pi-subagents')));
    }
  }
}));

const { default: pstack } = await createJiti(import.meta.url).import('../extensions/pstack/index.ts');
async function extensionFixture(run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-role-regression-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = resolve(directory, 'agent');
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
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
    registerTool: tool => tools.set(tool.name, tool),
    appendEntry: (type, data) => manager.appendCustomEntry(type, data),
    sendMessage: message => messages.push(JSON.parse(message.content)),
  });
  try { await run({ directory, handlers, commands, tools, messages, manager, ctx }); }
  finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(directory, { recursive: true, force: true });
  }
}

test('B6 mode status reports durable mode state before the first assistant message', () => extensionFixture(async ({ commands, messages, ctx, manager }) => {
  await commands.get('poteto-mode')('status', ctx);
  assert.equal(messages.at(-1).persistent, false);
  await commands.get('poteto-mode')('on', ctx);
  assert.equal(messages.at(-1).mode.enabled, true);
  assert.equal(messages.at(-1).persistent, true);
  await commands.get('poteto-mode')('status', ctx);
  assert.equal(messages.at(-1).persistent, true);
  await commands.get('poteto-mode')('off', ctx);
  assert.equal(messages.at(-1).mode.enabled, false);
  assert.equal(messages.at(-1).persistent, true);
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'saved' }], api: 'openai-completions', provider: 'fixture', model: 'model', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
  await commands.get('poteto-mode')('status', ctx);
  assert.equal(messages.at(-1).persistent, true);
}));

test('status commands expose verifier isolation and any degraded warning', () => extensionFixture(async ({ commands, messages, ctx }) => {
  for (const command of ['poteto-mode', 'setup-pstack']) {
    await commands.get(command)('status', ctx);
    const capability = messages.at(-1).verification;
    assert(capability, `${command} must report verification capability`);
    assert(['os-sandbox', 'degraded-worktree'].includes(capability.isolation));
    if (capability.degraded) {
      assert.match(capability.warning, /NOT an OS sandbox/);
      assert.equal(typeof capability.responsibleParty, 'string');
      assert(capability.limitations.length > 0);
    }
  }
}));

test('TLC configuration survives trusted merging and role edits, and reaches status and verification_exec', () => extensionFixture(async ({ directory, commands, tools, messages, ctx }) => {
  const paths = configPaths(resolve(directory, 'agent'), directory, '.pi');
  const userJar = resolve(directory, 'missing-user-tla2tools.jar');
  const projectJar = resolve(directory, 'missing-project-tla2tools.jar');
  await updateConfig(paths.user, () => ({ version: 1, roles: {}, tla: { tla2toolsJar: userJar } }));
  await updateConfig(paths.project, () => ({ version: 1, roles: {}, tla: { tla2toolsJar: projectJar } }));
  assert.equal((await loadConfig(paths, false)).tla.tla2toolsJar, userJar);
  assert.equal((await loadConfig(paths, true)).tla.tla2toolsJar, projectJar);
  await updateConfig(paths.project, () => ({ version: 1, roles: {}, tla: {} }));
  assert.equal((await loadConfig(paths, true)).tla.tla2toolsJar, userJar, 'An empty project block does not erase the user jar');
  await commands.get('setup-pstack')('set user review fixture/model off', ctx);
  await commands.get('setup-pstack')('unset user review', ctx);
  assert.equal(JSON.parse(await readFile(paths.user, 'utf8')).tla.tla2toolsJar, userJar);
  for (const command of ['setup-pstack', 'poteto-mode']) {
    await commands.get(command)('status', ctx);
    const capability = messages.at(-1).tlc;
    assert.equal(capability.available, false);
    assert.match(capability.reason, /missing-user-tla2tools.jar|conflicting/);
    assert.match(capability.warning, /未做形式化验证，原因是缺少 TLC/);
  }
  const outcome = await tools.get('verification_exec').execute('tlc-missing', { command: 'tlc', spec: 'Spec.tla', config: 'Spec.cfg' }, undefined, undefined, ctx);
  assert.equal(outcome.details.formalVerification, 'not-performed');
  assert.equal(outcome.details.fallback, 'generated-input-tests');
  assert.match(outcome.content[0].text, /未做形式化验证，原因是缺少 TLC/);
}));

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
