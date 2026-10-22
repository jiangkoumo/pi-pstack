import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { disposeTestSession } from './test-session-lifecycle.mjs';
import { detectSandbox } from '../extensions/pstack/verification-exec.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('production pstack.verifier executes npm test and refuses write and push in a detached child', { timeout: 90000 }, async t => {
  const requireSandbox = process.env.PSTACK_VERIFY_REQUIRE_SANDBOX === '1';
  if (requireSandbox) {
    const capability = await detectSandbox();
    assert.equal(capability.available, true, `OS sandbox required: ${capability.reason}`);
  }
  const dir = await mkdtemp(resolve(tmpdir(), 'pstack-verifier-child-'));
  const agentDir = resolve(dir, 'agent');
  const cwd = resolve(dir, 'workspace');
  const previous = Object.fromEntries(['PI_CODING_AGENT_DIR', 'PI_SUBAGENTS_TEMP_ROOT', 'PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT'].map(key => [key, process.env[key]]));
  const requests = [];
  let session;
  let providerError;
  const server = createServer(async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const parent = input.model === 'parent';
      requests.push({ parent, input });
      const tools = input.messages.filter(m => m.role === 'tool');
      let call;
      let content;
      if (parent && tools.length === 0) call = { name: 'subagent', args: { agent: 'pstack.verifier', task: 'Independently run npm test, attempt forbidden write and push requests, and report the actual exit code.', async: true, options: { context: 'fresh', artifacts: false, acceptance: false, timeoutMs: 60000 } } };
      else if (parent && tools.length === 1) {
        const text = JSON.stringify(tools[0]);
        const id = /Async[^\[]*\[([^\]\s]+)\]/.exec(text)?.[1];
        assert(id, text.slice(0, 700));
        call = { name: 'bg_wait', args: { id, timeoutMs: 60000 } };
      } else if (parent) {
        content = 'PARENT_VERIFIED';
      } else {
        const names = input.tools.map(x => x.function.name).sort();
        assert.deepEqual(names, ['find', 'grep', 'ls', 'read', 'verification_exec']);
        if (!tools.length) call = { name: 'verification_exec', args: { command: 'npm test' } };
        else if (tools.length === 1) {
          assert.match(JSON.stringify(tools[0]), /EXIT CODE: 0/);
          assert.match(JSON.stringify(tools[0]), /INDEPENDENT_FIXTURE_PASS/);
          if (requireSandbox) assert.match(JSON.stringify(tools[0]), /ISOLATION: os-sandbox/);
          call = { name: 'verification_exec', args: { command: 'echo unauthorized > mutation.txt' } };
        } else if (tools.length === 2) {
          assert.match(JSON.stringify(tools[1]), /REFUSED/);
          call = { name: 'verification_exec', args: { command: 'git push' } };
        } else {
          assert.match(JSON.stringify(tools[2]), /REFUSED/);
          content = 'VERIFIER_EXIT_0: npm test executed independently; write and push refused.';
        }
      }
      const base = { id: 'verifier-fixture', object: 'chat.completion.chunk', created: 1, model: input.model };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: `c${requests.length}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } : { role: 'assistant', content };
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    } catch (error) { providerError = error; res.writeHead(500); res.end('fixture failed'); }
  });
  try {
    await mkdir(agentDir);
    await mkdir(cwd);
    await writeFile(resolve(cwd, 'package.json'), JSON.stringify({ name: 'verifier-child-fixture', version: '1.0.0', scripts: { test: 'node test.mjs' } }));
    await writeFile(resolve(cwd, 'test.mjs'), 'console.log("INDEPENDENT_FIXTURE_PASS");\n');
    const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
    git(['init', '-b', 'main']);
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_SUBAGENTS_TEMP_ROOT = resolve(dir, 'runs');
    process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = resolve(root, 'node_modules/@earendil-works/pi-coding-agent');
    await mkdir(process.env.PI_SUBAGENTS_TEMP_ROOT);
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const settings = { defaultProjectTrust: 'never', packages: [root], retry: { enabled: false }, compaction: { enabled: false }, subagents: { asyncByDefault: true, intercomBridge: { mode: 'off' } } };
    await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify(settings));
    await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { verification: { model: 'fixture/verifier', thinking: 'off' } } }));
    const modelsPath = resolve(agentDir, 'models.json');
    await writeFile(modelsPath, JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only', models: ['parent', 'verifier'].map(id => ({ id, name: id, reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })) } } }));
    const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
    const settingsManager = SettingsManager.inMemory(settings);
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, additionalExtensionPaths: [resolve(root, 'node_modules/pi-subagents/index.js'), resolve(root, 'extensions/pstack/index.ts')], noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'parent'), resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
    const errors = [];
    await session.bindExtensions({ mode: 'rpc', onError: e => errors.push(String(e)) });
    session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent', 'bg_wait']);
    await session.prompt('Run the production verifier fixture.');
    await session.waitForIdle();
    assert.ifError(providerError);
    assert.deepEqual(errors, []);
    assert.match(session.getLastAssistantText(), /PARENT_VERIFIED/);
    const childRequests = requests.filter(x => !x.parent);
    assert.equal(childRequests.length, 4);
    assert.match(JSON.stringify(childRequests.at(-1).input.messages), /INDEPENDENT_FIXTURE_PASS/);
    assert.match(JSON.stringify(childRequests.at(-1).input.messages), /EXIT CODE: 0/);
    await assert.rejects(readFile(resolve(cwd, 'mutation.txt')), { code: 'ENOENT' });
  } finally {
    try { await disposeTestSession(session); } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise(done => server.close(done));
      for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      await rm(dir, { recursive: true, force: true });
    }
  }
});
