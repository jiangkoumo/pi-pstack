import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { findSubagentsRoot } from './check-review-diff.mjs';
import { disposeTestSession, trackIntervals } from './test-session-lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const piPackageRoot = resolve(root, 'node_modules/@earendil-works/pi-coding-agent');

// The fixtures below used to call `session.dispose()` on the AgentSession returned
// by createAgentSession. That method does not emit `session_shutdown`, so an
// extension runtime (pi-subagents' result watcher in particular) never tears down
// its intervals and keeps talking to a context that is stale after disposal.
async function startSubagentsSession(directory) {
  const agentDir = resolve(directory, 'agent');
  const cwd = resolve(directory, 'workspace');
  const subRoot = findSubagentsRoot();
  await Promise.all([mkdir(agentDir), mkdir(cwd)]);
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({
    defaultProjectTrust: 'never',
    subagents: { asyncByDefault: false, intercomBridge: { mode: 'off' } },
    retry: { enabled: false },
    compaction: { enabled: false },
  }));
  await writeFile(resolve(agentDir, 'models.json'), JSON.stringify({ providers: {
    fixture: {
      baseUrl: 'http://127.0.0.1:9/v1',
      api: 'openai-completions',
      apiKey: 'fixture-only',
      models: [{ id: 'idle', name: 'idle', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    },
  } }));
  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath: resolve(agentDir, 'models.json'), allowModelNetwork: false });
  const settings = SettingsManager.inMemory({
    defaultProjectTrust: 'never',
    subagents: { asyncByDefault: false, intercomBridge: { mode: 'off' } },
    retry: { enabled: false },
    compaction: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: settings,
    noExtensions: true,
    additionalExtensionPaths: [resolve(subRoot, 'index.js')],
    noSkills: true,
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model: runtime.getModel('fixture', 'idle'),
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: SessionManager.inMemory(cwd),
  });
  await session.bindExtensions({ mode: 'rpc', onError: error => { throw error; } });
  return session;
}

test('pi-subagents extension timers are cleared when the session is disposed', { timeout: 60000 }, async t => {
  const subRoot = findSubagentsRoot();
  if (!subRoot || !existsSync(piPackageRoot)) {
    t.skip('pi-subagents or the Pi package is not available in this environment');
    return;
  }
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-test-lifecycle-'));
  const previous = {
    agentDir: process.env.PI_CODING_AGENT_DIR,
    tempRoot: process.env.PI_SUBAGENTS_TEMP_ROOT,
  };
  process.env.PI_CODING_AGENT_DIR = resolve(directory, 'agent');
  process.env.PI_SUBAGENTS_TEMP_ROOT = resolve(directory, 'subagent-temp');
  await mkdir(process.env.PI_SUBAGENTS_TEMP_ROOT, { recursive: true });
  const tracker = trackIntervals();
  let session;
  try {
    session = await startSubagentsSession(directory);
    assert(session.getActiveToolNames().includes('subagent'), 'pi-subagents must be bound');
    assert(tracker.live.size > 0, 'pi-subagents must own at least one interval before teardown');
    await disposeTestSession(session);
    await new Promise(accept => setImmediate(accept));
    assert.deepEqual([...tracker.live], [], `Session disposal leaked ${tracker.live.size} interval(s)`);
  } finally {
    try {
      await disposeTestSession(session);
    } finally {
      tracker.restore();
    }
    if (previous.agentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous.agentDir;
    if (previous.tempRoot === undefined) delete process.env.PI_SUBAGENTS_TEMP_ROOT;
    else process.env.PI_SUBAGENTS_TEMP_ROOT = previous.tempRoot;
    await rm(directory, { recursive: true, force: true });
  }
});
