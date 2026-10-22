import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } from '@earendil-works/pi-coding-agent';
import * as loop from '../extensions/pstack/loop.mjs';
import { closeTestServer, disposeTestSession, finalizeCheck, removeTestDirectory } from './test-session-lifecycle.mjs';

// Real Pi SDK, local SSE fixture, no external child/model launch. The inline
// factory is the entry wiring contract until the package entry imports it.
const directory = await mkdtemp(resolve(tmpdir(), 'pstack-abort-state-'));
const sessions = [];
let abortSession;
let requests = 0;
const server = createServer(async (request, response) => {
  for await (const _chunk of request) { /* drain */ }
  requests++;
  void abortSession.abort();
  response.on('error', () => {});
});
try {
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  const agentDir = resolve(directory, 'agent');
  await mkdir(agentDir);
  const modelsPath = resolve(agentDir, 'models.json');
  await writeFile(modelsPath, JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'test-only',
    models: [{ id: 'model', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 64000,
      maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } }));
  const modelRuntime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
  const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', compaction: { enabled: false }, retry: { enabled: false } });
  for (const mode of ['rpc', 'tui']) {
    const errors = [];
    const observations = [];
    const manager = SessionManager.inMemory(directory);
    const resourceLoader = new DefaultResourceLoader({ cwd: directory, agentDir, settingsManager,
      noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: [new URL('../extensions/pstack/index.ts', import.meta.url).pathname],
      extensionFactories: [pi => {
        if (!process.argv.includes('--without-hook')) loop.registerLoopAbortHooks?.(pi);
        pi.on('agent_settled', event => observations.push({ aborted: event.aborted, status: loop.loopFromBranch(manager.getBranch()).state?.status }));
      }],
    });
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const { session } = await createAgentSession({ cwd: directory, agentDir, settingsManager, modelRuntime,
      model: modelRuntime.getModel('fixture', 'model'), resourceLoader, sessionManager: manager, tools: [] });
    sessions.push(session);
    abortSession = session;
    await session.bindExtensions({ mode, onError: error => errors.push(error) });
    const marker = resolve(directory, `${mode}.marker`);
    const before = requests;
    await session.prompt(`/loop run --until "touch ${marker}" --allow-dirty fix`);
    await session.waitForIdle();
    const latest = loop.loopFromBranch(manager.getBranch());
    assert.equal(latest.state?.status, 'interrupted', `${mode}: abort must immediately interrupt loop in the same process`);
    assert.equal(latest.active, false);
    assert.equal(latest.state.reason, 'operator-aborted');
    assert.equal(latest.state.lastPredicateResult, null);
    assert.equal(requests, before + 1, 'no continuation after abort');
    assert.deepEqual(observations, [{ aborted: true, status: 'interrupted' }]);
    await session.prompt('/loop status');
    const status = manager.getBranch().filter(e => e.type === 'custom_message' && e.customType === 'pstack.command').at(-1);
    assert.equal(JSON.parse(status.content).loop.status, 'interrupted');
    await assert.rejects(stat(marker), { code: 'ENOENT' });
    assert.deepEqual(errors, []);
  }
  console.log(JSON.stringify({ status: 'passed', passed: 2, failed: 0, host: 'real Pi SDK', transport: 'local fixture', externalChildren: 0, scenarios: ['rpc abort/status', 'tui abort/status'] }));
} finally {
  await finalizeCheck(async () => {
    const cleanupErrors = [];
    for (const session of sessions) {
      try { await disposeTestSession(session); } catch (error) { cleanupErrors.push(error); }
    }
    try { await closeTestServer(server); } catch (error) { cleanupErrors.push(error); }
    try { await removeTestDirectory(directory); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'abort-state cleanup failed');
  });
}
