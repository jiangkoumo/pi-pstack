import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { disposeTestSession } from './test-session-lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
test('production Pi gate blocks bad commit and PR requests before execution and permits a Conventional commit', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'pstack-publication-host-'));
  const cwd = resolve(dir, 'repo');
  const agentDir = resolve(dir, 'agent');
  const previous = process.env.PI_CODING_AGENT_DIR;
  let session;
  let serverError;
  const observed = [];
  const bodyPath = resolve(cwd, 'bad-body.md');
  const commands = [
    'git commit -m "Update the gate"',
    'git commit -m "fix(fixture): record a compliant change"',
    `gh pr create --title "Update the gate" --body-file "${bodyPath}"`,
  ];
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      const tools = input.messages.filter(m => m.role === 'tool');
      if (tools.length === 1) assert.match(JSON.stringify(tools[0]), /Publication gate blocked/);
      if (tools.length === 2) assert.doesNotMatch(JSON.stringify(tools[1]), /Publication gate blocked/);
      if (tools.length === 3) assert.match(JSON.stringify(tools[2]), /Publication gate blocked/);
      const command = commands[tools.length];
      const base = { id: 'publication-host', object: 'chat.completion.chunk', created: 1, model: 'parent' };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const delta = command ? { role: 'assistant', tool_calls: [{ index: 0, id: `c${tools.length}`, type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command }) } }] } : { role: 'assistant', content: 'HOST_GATE_DONE' };
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: command ? 'tool_calls' : 'stop' }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    } catch (error) { serverError = error; res.writeHead(500); res.end('fixture failed'); }
  });
  try {
    await mkdir(cwd);
    await mkdir(agentDir);
    const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
    git(['init', '-b', 'main']);
    git(['config', 'user.name', 'Fixture']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    await writeFile(resolve(cwd, 'change.txt'), 'change\n');
    await writeFile(bodyPath, '## Problem\nIncorrect PR headings.\n');
    git(['add', 'change.txt']);
    process.env.PI_CODING_AGENT_DIR = agentDir;
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', retry: { enabled: false }, compaction: { enabled: false } });
    const modelsPath = resolve(agentDir, 'models.json');
    await writeFile(modelsPath, JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only', models: [{ id: 'parent', name: 'parent', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, additionalExtensionPaths: [resolve(root, 'extensions/pstack/index.ts')], noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'parent'), resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
    await session.bindExtensions({ mode: 'rpc', onError: e => { throw e; } });
    session.subscribe(e => { if (e.type === 'message_end' && e.message.role === 'toolResult') observed.push(e.message); });
    await session.prompt('Exercise the publication gate.');
    await session.waitForIdle();
    assert.ifError(serverError);
    assert.match(session.getLastAssistantText(), /HOST_GATE_DONE/);
    assert.equal(observed.length, 3);
    assert.equal(git(['rev-list', '--count', 'HEAD']).trim(), '1');
    assert.equal(git(['log', '-1', '--format=%s']).trim(), 'fix(fixture): record a compliant change');
    assert.equal(await readFile(resolve(cwd, 'change.txt'), 'utf8'), 'change\n');
  } finally {
    try { await disposeTestSession(session); } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise(done => server.close(done));
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    }
  }
});
