import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closeTestServer, finalizeCheck, removeTestDirectory } from './test-session-lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed Pi package root');
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, AgentSessionRuntime, CONFIG_DIR_NAME } = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));
const directory = await mkdtemp(resolve(tmpdir(), 'pstack-host-test-'));
process.env.PI_CODING_AGENT_DIR = resolve(directory, 'agent');
const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = resolve(directory, 'workspace');
const requests = [];
const sessions = [];
const servicesBySession = new WeakMap();
const failures = [];
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  requests.push(JSON.parse(body));
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'pstack-host', object: 'chat.completion.chunk', created: 1, model: 'fixture' };
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'host fixture response' }, finish_reason: null }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const port = server.address().port;
const check = (name, passed) => { assert(passed, name); console.log('PASS ' + name); };
try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  const modelsPath = resolve(agentDir, 'models.json');
  await writeFile(modelsPath, JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${port}/v1`, api: 'openai-completions', apiKey: 'test-only', models: [{ id: 'model', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, { id: 'reasoner', name: 'Reasoner', reasoning: true, thinkingLevelMap: { xhigh: null }, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
  const model = runtime.getModel('fixture', 'model');
  assert(model);
  const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1024 }, retry: { enabled: false } });
  const records = [];
  async function open(manager, reason = 'startup') {
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, additionalExtensionPaths: [root], noContextFiles: true, noPromptTemplates: true, noThemes: true });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { session } = await createAgentSession({ cwd, agentDir, settingsManager, modelRuntime: runtime, model, resourceLoader: loader, sessionManager: manager, tools: [], sessionStartEvent: { type: 'session_start', reason } });
    await session.bindExtensions({ mode: 'rpc', onError: e => failures.push(e) });
    sessions.push(session);
    servicesBySession.set(session, { cwd, agentDir, settingsManager, modelRuntime: runtime, resourceLoader: loader, diagnostics: [] });
    session.subscribe(event => { if (event.type === 'message_end') records.push(event.message); });
    return session;
  }
  const manager = SessionManager.create(cwd, resolve(directory, 'sessions'));
  let session = await open(manager);
  async function prompt(text, expected) {
    const start = requests.length;
    const previousErrors = failures.length;
    await session.prompt(text);
    check('one provider request for ' + text, requests.length === start + 1);
    const system = requests.at(-1).messages.filter(m => ['system', 'developer'].includes(m.role)).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    const section = system;
    assert.equal(failures.length, previousErrors, 'before_agent_start errors');
    check('effective mode section ' + expected, expected === 'absent' ? !section.includes('<pstack_mode>') : section.includes(expected));
    check('mode section not duplicated', (section.match(/<pstack_mode>/g) ?? []).length <= 1);
    return system;
  }
  await prompt('initial', 'absent');
  const baselineLeaf = manager.getLeafId();
  await session.prompt('/poteto on');
  assert.deepEqual(failures, [], 'activation command errors');
  await session.prompt('/poteto on');
  check('on is idempotent', manager.getBranch().filter(e => e.customType === 'pstack.mode.v1').length === 1);
  const onLeaf = manager.getLeafId();
  await prompt('first enabled request', 'is ON');
  const onPrompt = await prompt('second enabled request', 'is ON');
  check('prompt contains only concise skill pointer', onPrompt.includes('Read ') && !onPrompt.includes('## Route the task'));
  await session.reload();
  await prompt('after reload', 'is ON');
  await session.prompt('/poteto off');
  await prompt('after off', 'is OFF');
  check('off removes on reminder', !session.systemPrompt.includes('is ON'));
  await session.navigateTree(onLeaf, { summarize: false });
  await prompt('back to enabled branch', 'is ON');
  await session.navigateTree(baselineLeaf, { summarize: false });
  await prompt('before activation', 'absent');
  await session.prompt('/poteto on');
  await prompt('request before compaction', 'is ON');
  await session.compact('Summarize this fixture');
  check('actual host compaction recorded', manager.getBranch().some(e => e.type === 'compaction'));
  await session.reload();
  await prompt('after compaction checkpoint', 'is ON');
  const file = manager.getSessionFile();
  assert(file);
  session.dispose();
  session = await open(SessionManager.open(file), 'resume');
  await prompt('resumed session', 'is ON');
  const forkFile = session.sessionManager.createBranchedSession(session.sessionManager.getLeafId());
  session.dispose();
  session = await open(SessionManager.open(forkFile), 'fork');
  await prompt('fork inherits branch state', 'is ON');
  session.dispose();
  session = await open(SessionManager.create(cwd, resolve(directory, 'sessions')), 'new');
  await prompt('new session starts off', 'absent');
  await session.prompt('/setup-pstack set user code fixture/model off');
  const configFile = resolve(agentDir, 'pstack.json');
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  check('setup writes exact validated role', config.roles.code.model === 'fixture/model' && config.roles.code.thinking === 'off');
  const firstConfig = await readFile(configFile, 'utf8');
  await session.prompt('/setup-pstack set user code fixture/model off');
  check('setup is idempotent', await readFile(configFile, 'utf8') === firstConfig);
  const expectError = async (text, pattern) => {
    const before = failures.length;
    try { await session.prompt(text); } catch (error) { failures.push({ error: String(error) }); }
    check('reject ' + text, failures.slice(before).some(e => pattern.test(JSON.stringify(e))));
  };
  await expectError('/setup-pstack set user code fixture/missing off', /not available/);
  await expectError('/setup-pstack set user code fixture/model high', /unsupported/);
  await session.prompt('/setup-pstack set user review fixture/reasoner high');
  check('reasoning model supports high through actual Pi capability helper', JSON.parse(await readFile(configFile, 'utf8')).roles.review.thinking === 'high');
  await expectError('/setup-pstack set user review fixture/reasoner xhigh', /unsupported/);
  await expectError('/setup-pstack set user review fixture/reasoner max', /unsupported/);
  await session.prompt('/setup-pstack unset user review');
  settingsManager.setProjectTrusted(false);
  await expectError('/setup-pstack set project review inherit', /untrusted/);
  check('invalid writes preserve config', await readFile(configFile, 'utf8') === firstConfig);
  settingsManager.setProjectTrusted(true);
  await session.prompt('/setup-pstack set project code inherit off');
  await session.prompt('/setup-pstack status');
  check('trusted project overrides role', records.some(m => m.customType === 'pstack.command' && /"code":\s*\{\s*"model": "inherit"/.test(String(m.content))));
  await session.prompt('/setup-pstack unset project code');
  check('unset restores user preference', JSON.parse(await readFile(resolve(cwd, CONFIG_DIR_NAME, 'pstack.json'), 'utf8')).roles.code === undefined);
  await session.prompt('/poteto on');
  await writeFile(configFile, '{bad json');
  const statusStart = records.length;
  const errorsBeforeStatus = failures.length;
  await session.prompt('/setup-pstack status');
  await session.prompt('/poteto status');
  check('both statuses show malformed config without failing', failures.length === errorsBeforeStatus && records.slice(statusStart).filter(m => m.customType === 'pstack.command' && String(m.content).includes('configError') && String(m.content).includes('pstack.json')).length === 2);
  await prompt('malformed active config', 'Pstack configuration/state error:');
  check('malformed config is visible in provider request', JSON.stringify(requests.at(-1)).includes('Pstack configuration/state error:'));
  await session.prompt('/poteto off');
  await writeFile(configFile, firstConfig);
  const afterConfigErrorRequest = requests.length;
  await session.prompt('/setup-pstack models');
  await session.prompt('/setup-pstack status');
  check('commands do not invoke provider', requests.length === afterConfigErrorRequest);
  check('unexpected extension errors absent', failures.length === 5);
  check('role config never switches current model', session.model.provider === 'fixture' && session.model.id === 'model');
  const controller = new AgentSessionRuntime(session, servicesBySession.get(session), async options => {
    const next = await open(options.sessionManager, options.sessionStartEvent?.reason);
    return { session: next, services: servicesBySession.get(next), diagnostics: [], extensionsResult: servicesBySession.get(next).resourceLoader.getExtensions() };
  });
  controller.setRebindSession(async next => { session = next; });
  await controller.switchSession(file);
  await prompt('runtime switch back to enabled session', 'is ON');
  await controller.newSession();
  await prompt('runtime new session is off', 'absent');
  await controller.switchSession(file);
  const selectedUser = controller.session.sessionManager.getBranch().find(e => e.type === 'message' && e.message.role === 'user' && String(JSON.stringify(e.message.content)).includes('request before compaction'));
  assert(selectedUser);
  await controller.fork(selectedUser.id, { position: 'at' });
  await prompt('runtime fork preserves enabled path', 'is ON');
  await controller.dispose();
  console.log(JSON.stringify({ status: 'passed', providerRequests: requests.length, expectedCommandErrors: failures.length, transport: 'real Pi SDK + local OpenAI-compatible SSE fixture; no external model calls', lifecycle: ['continuous turns', 'off', 'tree branches', 'reload', 'actual host compaction', 'resume', 'fork', 'new session', 'runtime session switch/new/fork'], config: ['exact model', 'idempotence', 'unknown model', 'unsupported thinking', 'reasoning model high/xhigh/max boundaries', 'both status error diagnostics', 'untrusted project', 'no model switch'] }));
} finally {
  await finalizeCheck(async () => {
    const cleanupErrors = [];
    for (const session of sessions) {
      try { session.dispose(); } catch (error) { cleanupErrors.push(error); }
    }
    try { await closeTestServer(server); } catch (error) { cleanupErrors.push(error); }
    try { await removeTestDirectory(directory); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'p2-host cleanup failed');
  });
}
