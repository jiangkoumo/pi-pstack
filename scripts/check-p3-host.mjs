import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
const subRoot = process.env.PI_SUBAGENTS_ROOT || resolve(getAgentDir(), 'npm/node_modules/pi-subagents');
assert(piRoot, 'Set PI_PSTACK_PI_ROOT');
const directory = await mkdtemp(resolve(tmpdir(), 'pstack-p3-host-'));
const agentDir = resolve(directory, 'agent');
const cwd = resolve(directory, 'consumer');
process.env.PI_CODING_AGENT_DIR = agentDir;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));
const requests = [];
const results = [];
const errors = [];
let session;
let scenario = 'deny';
let onChildWaiting;
const targets = ['ordinary.txt', 'ignored.txt', 'untracked.txt'];
const childRequests = [];
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  requests.push(input);
  const isParent = input.tools?.some(t => t.function.name === 'subagent');
  const taskMessage = input.messages.findLast(m => m.role === 'user');
  const task = typeof taskMessage?.content === 'string' ? taskMessage.content : JSON.stringify(taskMessage?.content);
  const toolsAfterUser = input.messages.slice(input.messages.lastIndexOf(taskMessage) + 1).filter(m => m.role === 'tool');
  let calls;
  if (isParent && toolsAfterUser.length === 0) {
    calls = [{ name: 'subagent', args: { agent: 'pstack.comment-sicko', task: `P3_HOST_${scenario}: inspect only this synthetic workspace; report blockers in final output.`, async: false, options: { context: 'fresh', timeoutMs: scenario === 'timeout' ? 300 : 15000, artifacts: false } } }];
  } else if (!isParent) {
    childRequests.push(input);
    if (scenario === 'timeout' || scenario === 'cancel') { onChildWaiting?.(); return; }
    if (scenario === 'provider_failure') {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'P3 fixture provider rejected child request', type: 'invalid_request_error' } }));
      return;
    }
    if (scenario === 'deny' && toolsAfterUser.length === 0) {
      calls = targets.flatMap(path => [
        { name: 'write', args: { path, content: 'CORRUPTED' } },
        { name: 'edit', args: { path, oldText: 'ORIGINAL', newText: 'CORRUPTED' } },
        { name: 'bash', args: { command: 'exit 77' } },
      ]);
    }
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: input.model };
  const delta = calls ? { role: 'assistant', tool_calls: calls.map((c, index) => ({ index, id: `call_${index}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : { role: 'assistant', content: `P3_HOST_DONE ${scenario}` };
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: calls ? 'tool_calls' : 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  const installDir = resolve(cwd, '.pi/npm/node_modules/pi-pstack');
  await mkdir(installDir, { recursive: true });
  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }))[0];
  execFileSync('tar', ['-xzf', resolve(directory, pack.filename), '-C', installDir, '--strip-components=1']);
  await writeFile(resolve(cwd, '.gitignore'), 'ignored.txt\n');
  for (const name of targets) await writeFile(resolve(cwd, name), 'ORIGINAL');
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['add', 'ordinary.txt', '.gitignore'], { cwd });
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({ packages: [installDir], subagents: { asyncByDefault: false }, retry: { enabled: false } }));
  const modelsPath = resolve(agentDir, 'models.json');
  await writeFile(modelsPath, JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only', models: ['parent', 'review'].map(id => ({ id, name: id, reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })) } } }));
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: 'fixture/review', thinking: 'high' } } }));
  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
  const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', packages: [installDir], subagents: { asyncByDefault: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, additionalExtensionPaths: [resolve(subRoot, 'index.js'), resolve(installDir, 'extensions/pstack/index.ts')], noContextFiles: true, noPromptTemplates: true, noThemes: true });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  ({ session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'parent'), settingsManager, resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd) }));
  await session.bindExtensions({ mode: 'rpc', onError: e => errors.push(e) });
  session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent']);
  assert(session.getActiveToolNames().includes('subagent'), 'Host must expose subagent tool: ' + JSON.stringify(session.getAllTools?.()));
  session.subscribe(event => { if (event.type === 'message_end' && event.message.role === 'toolResult') results.push(event.message); });
  await session.prompt('Run P3_HOST_deny');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert(childRequests.length > 0, 'Real child must contact fixture provider: ' + JSON.stringify(results));
  assert(childRequests.every(r => r.model === 'review'), 'Saved review role must select child model');
  assert.equal(childRequests[0].reasoning_effort, 'high');
  const declared = childRequests[0].tools.map(t => t.function.name).sort();
  assert.deepEqual(declared, ['find', 'grep', 'ls', 'read']);
  const denied = childRequests.at(-1).messages.filter(m => m.role === 'tool');
  assert.equal(denied.length, 9, 'All 9 write/edit/bash attempts must return tool errors');
  assert(denied.every(m => /not found|not available|unknown tool/i.test(String(m.content))), JSON.stringify(denied));
  for (const name of targets) assert.equal(await readFile(resolve(cwd, name), 'utf8'), 'ORIGINAL');
  assert(results.some(r => r.toolName === 'subagent' && !r.isError), JSON.stringify(results));
  const firstChildModel = childRequests[0].model;
  const firstThinking = childRequests[0].reasoning_effort;
  scenario = 'inherit';
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: 'inherit', thinking: 'low' } } }));
  let start = childRequests.length;
  await session.prompt('Run P3_HOST_inherit');
  assert.equal(childRequests.length, start + 1);
  assert.equal(childRequests.at(-1).model, 'parent');
  assert.equal(childRequests.at(-1).reasoning_effort, 'low');
  scenario = 'unconfigured';
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: {} }));
  start = childRequests.length;
  await session.prompt('Run P3_HOST_unconfigured');
  assert.equal(childRequests.length, start + 1);
  assert.equal(childRequests.at(-1).model, 'parent');
  scenario = 'trust';
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: 'fixture/review', thinking: 'high' } } }));
  await writeFile(resolve(cwd, '.pi/pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: 'inherit', thinking: 'low' } } }));
  settingsManager.setProjectTrusted(false);
  await session.prompt('Run P3_HOST_untrusted_project');
  assert.equal(childRequests.at(-1).model, 'review', 'Untrusted project must not override user role');
  settingsManager.setProjectTrusted(true);
  await session.prompt('Run P3_HOST_trusted_project');
  assert.equal(childRequests.at(-1).model, 'parent');
  assert.equal(childRequests.at(-1).reasoning_effort, 'low');
  settingsManager.setProjectTrusted(false);
  scenario = 'missing';
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: 'fixture/missing' } } }));
  start = childRequests.length;
  await session.prompt('Run P3_HOST_missing');
  assert.equal(childRequests.length, start, 'Unavailable model must block launch');
  assert(results.at(-1).isError);
  assert.match(JSON.stringify(results.at(-1)), /No child was launched/);
  scenario = 'provider_failure';
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: 'fixture/review' } } }));
  start = childRequests.length;
  await session.prompt('Run P3_HOST_provider_failure');
  assert.equal(childRequests.length, start + 1, 'Provider error must not trigger fallback');
  assert.match(JSON.stringify(results.at(-1)), /P3 fixture provider rejected/);
  assert.equal(childRequests.at(-1).model, 'review');
  scenario = 'timeout';
  start = childRequests.length;
  await session.prompt('Run P3_HOST_timeout');
  assert.equal(childRequests.length, start + 1);
  assert.match(JSON.stringify(results.at(-1)), /timed.?out|timeout/i);
  scenario = 'cancel';
  const waiting = new Promise(accept => { onChildWaiting = accept; });
  const active = session.prompt('Run P3_HOST_cancel');
  const cancelGuard = setTimeout(() => session.abort(), 5000);
  try {
    await Promise.race([waiting, active.then(() => { throw new Error('Child ended before cancellation'); })]);
    await session.abort();
    await active;
    assert.match(JSON.stringify(results.at(-1)), /cancel|abort|interrupt/i);
  } finally { clearTimeout(cancelGuard); }
  for (const name of targets) assert.equal(await readFile(resolve(cwd, name), 'utf8'), 'ORIGINAL');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ status: 'passed', timeoutReturned: true, cancellationReturned: true, projectTrustVerified: true, roleCases: ['configured model + high', 'inherit + low', 'unconfigured parent default', 'missing model blocked before launch', 'provider failure returned without fallback'], transport: 'real Pi SDK + installed pi-subagents + actual child + local fixture provider', packageInstallation: 'npm tarball extracted into consumer .pi/npm/node_modules', childModel: firstChildModel, thinking: firstThinking, childTools: declared, deniedAttempts: denied.length, preservedFiles: targets }));
} finally {
  session?.dispose();
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  await rm(directory, { recursive: true, force: true });
}
