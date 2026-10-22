import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent';
import { ROLE_AGENTS, createRoleAgentController, guardPstackTopLevelModel } from '../extensions/pstack/role-agents.mjs';
import { closeTestServer, disposeTestSession, finalizeCheck, removeTestDirectory } from './test-session-lifecycle.mjs';

// This fixture loads only pi-subagents' public package entry. The production
// pstack entry is deliberately not loaded: the owner wires this same controller.
const subRootCandidates = [
  process.env.PI_SUBAGENTS_ROOT,
  fileURLToPath(new URL('../node_modules/pi-subagents', import.meta.url)),
  resolve(getAgentDir(), 'npm/node_modules/pi-subagents'),
  resolve(homedir(), '.pi/agent/npm/node_modules/pi-subagents'),
].filter(Boolean);

let subRoot = subRootCandidates.find(p => existsSync(resolve(p, 'index.js')));
if (!subRoot && process.argv.includes('--allow-skip')) {
  console.log(JSON.stringify({ status: 'skipped', reason: 'pi-subagents not found in environment' }));
  process.exit(0);
}
assert(subRoot, 'Set PI_SUBAGENTS_ROOT or install pi-subagents');
const directory = await mkdtemp(resolve(tmpdir(), 'pstack-parallel-roles-'));
const agentDir = resolve(directory, 'agent');
const cwd = resolve(directory, 'workspace');
const agentsDir = resolve(directory, 'definitions');
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const requests = [];
const toolResults = [];
const errors = [];
const controllers = [];
let session;
let nextInput;
let scenario = 'parallel';
let registry;
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); originalWarn(...args); };
const roles = Object.fromEntries(Object.keys(ROLE_AGENTS).map(role => [role, { model: `fixture-${role}/${role}`, thinking: role === 'review' ? 'high' : 'low' }]));
let activeRoles = roles;
let activeScriptText = '';
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  const parent = input.tools?.some(tool => tool.function.name === 'subagent');
  requests.push({ parent, scenario, url: request.url, input });
  const taskMessage = input.messages.findLast(message => message.role === 'user');
  const afterUser = input.messages.slice(input.messages.lastIndexOf(taskMessage) + 1);
  const launch = parent && !afterUser.some(message => message.role === 'tool');
  const call = launch ? nextInput : undefined;
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'role-fixture', object: 'chat.completion.chunk', created: 1, model: input.model };
  const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${requests.length}`, type: 'function', function: { name: 'subagent', arguments: JSON.stringify(call) } }] } : { role: 'assistant', content: 'ROLE_FIXTURE_DONE' };
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\n`);
  response.end('data: [DONE]\n\n');
});
try {
  await Promise.all([mkdir(agentDir), mkdir(cwd), mkdir(agentsDir)]);
  const settings = { defaultProjectTrust: 'never', subagents: { asyncByDefault: false, intercomBridge: { mode: 'off' } }, retry: { enabled: false }, compaction: { enabled: false } };
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify(settings));
  for (const [role, name] of Object.entries(ROLE_AGENTS)) {
    await writeFile(resolve(agentsDir, name.slice(7) + '.md'), `---\nname: ${name.slice(7)}\npackage: pstack\ndescription: Role fixture ${role}\ntools: read, grep, find, ls\nexcludeTools: contact_supervisor\nsystemPromptMode: append\ninheritProjectContext: false\ninheritGlobalContext: false\ninheritSkills: false\nasync: false\nacceptanceRole: read-only\n---\nRole fixture ${role}. Return ROLE_FIXTURE_DONE without tools.\n`);
  }
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  // A third-party provider extension registered by the host. Foreground children
  // inherit the provider registration, so a provider-qualified role model must
  // launch without needing the extension's hooks inside the child.
  const providerExtensionPath = resolve(directory, 'thirdparty-provider.mjs');
  await writeFile(providerExtensionPath, `export default function (pi) {
  pi.registerProvider('thirdparty', {
    baseUrl: 'http://127.0.0.1:${server.address().port}/thirdparty/v1',
    api: 'openai-completions',
    apiKey: 'fixture-only',
    models: [{ id: 'inherited-child', name: 'Inherited Child', reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  });
}
`);
  const modelsPath = resolve(agentDir, 'models.json');
  const ids = ['parent', ...Object.keys(ROLE_AGENTS), 'override'];
  await writeFile(modelsPath, JSON.stringify({ providers: Object.fromEntries(ids.map(id => [`fixture-${id}`, {
    baseUrl: `http://127.0.0.1:${server.address().port}/${id}/v1`, api: 'openai-completions', apiKey: 'fixture-only',
    models: [{ id, name: id, reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  }])) }));
  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
  const settingsManager = SettingsManager.inMemory(settings);
  const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true,
    additionalExtensionPaths: [resolve(subRoot, 'index.js'), providerExtensionPath], noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
    extensionFactories: [pi => {
      const controller = createRoleAgentController(pi, agentsDir);
      controllers.push(controller);
      pi.on('session_start', async (_event, ctx) => {
        registry = ctx.modelRegistry;
        await controller.refresh(activeRoles, ctx.modelRegistry.getAvailable(), ctx.model, () => ['off', 'low', 'high']);
      });
      pi.on('session_shutdown', () => controller.dispose());
      pi.on('tool_call', event => event.toolName === 'subagent' ? guardPstackTopLevelModel(event.input, { scriptText: activeScriptText }) : undefined);
    }],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  ({ session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture-parent', 'parent'),
    resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
  await session.bindExtensions({ mode: 'rpc', onError: error => errors.push(error) });
  assert.deepEqual(errors, []);
  session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent']);
  assert(session.getActiveToolNames().includes('subagent'), JSON.stringify(session.getAllTools()));
  session.subscribe(event => { if (event.type === 'message_end' && event.message.role === 'toolResult') toolResults.push(event.message); });
  const tasks = Object.entries(ROLE_AGENTS).map(([role, agent]) => ({ agent, task: `Return ROLE_FIXTURE_DONE for ${role}.` }));
  async function run(label, input, expected) {
    scenario = label;
    nextInput = input;
    const before = requests.length;
    const previousResults = toolResults.length;
    await session.prompt(`Execute fixture scenario ${label}.`);
    await session.waitForIdle();
    assert.deepEqual(errors, []);
    const children = requests.slice(before).filter(request => !request.parent);
    if (expected !== null) {
      assert.equal(children.length, expected.length, `${label}: ${JSON.stringify(toolResults.slice(previousResults))}`);
      for (const [model, thinking, route] of expected) {
        const child = children.find(request => request.input.model === model);
        assert(child, `${label}: missing actual child model ${model}`);
        assert.equal(child.input.reasoning_effort, thinking, `${label}: ${model} thinking`);
        assert.equal(child.url, route ?? `/${model}/v1/chat/completions`, 'actual provider-specific HTTP route');
        assert.deepEqual((child.input.tools ?? []).map(tool => tool.function.name).sort(), ['find', 'grep', 'ls', 'read']);
      }
    }
    const result = toolResults.at(-1);
    const shouldError = expected !== null && expected.length === 0 && label.startsWith('blocked-');
    assert.equal(result?.isError ?? false, shouldError, `${label}: ${JSON.stringify(result)}`);
    return children;
  }
  const defaults = { async: false, options: { artifacts: false, context: 'fresh', acceptance: false, timeoutMs: 20000 } };
  const parallelChildren = await run('parallel', { workflow: 'parallel', args: { tasks }, ...defaults }, Object.keys(ROLE_AGENTS).map(role => [role, roles[role].thinking]));
  // Assert distinct providers were contacted for the parallel roles.
  const parallelProviders = new Set(parallelChildren.map(c => c.url.slice(1).split('/')[0]));
  assert.equal(parallelProviders.size, Object.keys(ROLE_AGENTS).length, 'Distinct provider endpoints must be contacted for every role: ' + JSON.stringify([...parallelProviders]));
  assert(parallelProviders.has('code') && parallelProviders.has('review'), JSON.stringify([...parallelProviders]));
  const script = tasks.map((task, index) => `const r${index} = await runs.run(${JSON.stringify('role-' + index)}, ${JSON.stringify({ ...task, acceptance: false, async: false })}); if (!r${index}.ok) throw new Error('child failed');`).join('\n') + '\nreturn "done";';
  const scriptPath = resolve(directory, 'sequence.js');
  await writeFile(scriptPath, script);
  await run('sequence', { workflow: scriptPath, ...defaults }, Object.keys(ROLE_AGENTS).map(role => [role, roles[role].thinking]));
  await run('blocked-parallel', { workflow: 'parallel', args: { tasks }, model: 'fixture-parent/parent', ...defaults }, []);
  assert.match(JSON.stringify(toolResults.at(-1)), /Remove top-level model/);

  // Supply script text for the tool_call hook like the production host does.
  activeScriptText = script;
  await run('blocked-script', { workflow: scriptPath, model: 'fixture-parent/parent', ...defaults }, []);
  assert.match(JSON.stringify(toolResults.at(-1)), /Remove top-level model/);

  // Unrelated scripts with top-level model are not blocked.
  const otherScriptPath = resolve(directory, 'other.js');
  await writeFile(otherScriptPath, 'return "unrelated";');
  activeScriptText = 'return "unrelated";';
  // A script without children executes successfully; expected child requests is empty.
  await run('unrelated-script-allowed', { workflow: otherScriptPath, model: 'fixture-parent/parent', ...defaults }, null);
  assert.equal(toolResults.at(-1).isError ?? false, false);
  activeScriptText = '';

  // A third-party provider extension registered by the host must remain usable
  // by children now that role fixtures no longer declare an empty extensions list.
  // Foreground children inherit the provider registration but not ambient hooks.
  assert(registry, 'session_start must expose the model registry');
  activeRoles = { ...roles, code: { model: 'thirdparty/inherited-child', thinking: 'low' } };
  await controllers[0].refresh(activeRoles, registry.getAvailable(), runtime.getModel('fixture-parent', 'parent'), () => ['off', 'low', 'high']);
  const providerChildren = await run('thirdparty-provider-extension', { workflow: 'parallel', args: { tasks: [tasks[0]] }, ...defaults }, [['inherited-child', 'low', '/thirdparty/v1/chat/completions']]);
  assert.equal(providerChildren.length, 1, 'Exactly one child must use the extension-provided provider');
  assert.equal(warnings.some(warning => /extensions: \[\] override/.test(warning)), false, 'Empty extensions must not disable ambient provider extensions: ' + warnings.join('\n'));

  // Live refresh: inherit code role binds parent model; unset code role uses subagents.defaultModel
  activeRoles = { ...roles, code: { model: 'inherit', thinking: 'low' } };
  await controllers[0].refresh(activeRoles, await runtime.getAvailable(), runtime.getModel('fixture-parent', 'parent'), () => ['off', 'low', 'high']);
  await run('live-refresh-inherit', { workflow: 'parallel', args: { tasks: [tasks[0]] }, ...defaults }, [['parent', 'low']]);

  activeRoles = Object.fromEntries(Object.entries(roles).filter(([role]) => role !== 'code'));
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({ ...settings, subagents: {
    ...settings.subagents, defaultModel: 'fixture-parent/parent', defaultThinking: 'low',
  } }));
  await controllers[0].refresh(activeRoles, await runtime.getAvailable(), runtime.getModel('fixture-parent', 'parent'), () => ['off', 'low', 'high']);
  await run('live-refresh-default-model', { workflow: 'parallel', args: { tasks: [tasks[0]] }, ...defaults }, [['parent', 'low']]);
  // The owner reads user settings on disk for runtime-agent model overrides.
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({ ...settings, subagents: {
    ...settings.subagents, agentOverrides: { 'pstack.comment-sicko': { model: 'fixture-override/override', thinking: 'low', tools: ['write'] } },
  } }));
  await run('user-override', { workflow: 'parallel', args: { tasks: [tasks.find(task => task.agent === ROLE_AGENTS.review)] }, ...defaults }, [['override', 'low']]);
  console.log(JSON.stringify({ status: 'passed', passed: 6, failed: 0, childRequests: requests.filter(request => !request.parent).length,
    transport: 'real Pi SDK + pi-subagents public entry + actual foreground children + local SSE provider',
    entryWiring: 'inline controller factory; production index not wired', providerExtension: 'host-registered thirdparty provider inherited by child',
    cases: ['all-role named parallel', 'all-role sequential runs.run', 'parallel top model blocked', 'raw script top model blocked', 'third-party provider extension child launch without empty extensions warning', 'user model/thinking override with tools preserved'] }));
} catch (error) {
  process.exitCode = 1;
  console.error(error?.stack ?? String(error));
} finally {
  await finalizeCheck(async () => {
    const cleanupErrors = [];
    try { await disposeTestSession(session); } catch (error) { cleanupErrors.push(error); }
    for (const controller of controllers) {
      try { controller.dispose(); } catch (error) { cleanupErrors.push(error); }
    }
    try { await closeTestServer(server); } catch (error) { cleanupErrors.push(error); }
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    try { await removeTestDirectory(directory); } catch (error) { cleanupErrors.push(error); }
    console.warn = originalWarn;
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'parallel roles cleanup failed');
  });
}
