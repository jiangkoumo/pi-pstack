import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { findSubagentsRoot } from './check-review-diff.mjs';
import { disposeTestSession, finalizeCheck, trackIntervals } from './test-session-lifecycle.mjs';

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
  if (!existsSync(piPackageRoot)) {
    t.skip('the Pi package is not available in this environment');
    return;
  }
  // The probe must load the repo-local devDependency, not a global Pi install;
  // an explicit PI_SUBAGENTS_ROOT still wins.
  const localRoot = resolve(root, 'node_modules/pi-subagents');
  const expectedRoot = process.env.PI_SUBAGENTS_ROOT ? resolve(process.env.PI_SUBAGENTS_ROOT) : localRoot;
  assert.ok(existsSync(resolve(expectedRoot, 'index.js')), `pi-subagents is not installed where expected: ${expectedRoot}; run npm ci --include=dev`);
  const subRoot = findSubagentsRoot();
  assert(subRoot, 'a pi-subagents package must be available');
  assert.equal(await realpath(subRoot), await realpath(expectedRoot), 'the lifecycle probe must load the repo-local dependency');
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

test('a stuck shutdown is bounded and still disposes the session', { timeout: 5000 }, async () => {
  let disposed = false;
  const session = {
    extensionRunner: { emit: () => new Promise(() => {}) },
    dispose() { disposed = true; },
  };
  const started = Date.now();
  await assert.rejects(disposeTestSession(session, { timeoutMs: 200 }), /session shutdown did not finish within 200ms/);
  assert.equal(disposed, true, 'dispose must run even when the shutdown event hangs');
  assert.ok(Date.now() - started < 2000, 'the shutdown wait must be bounded');
});

test('finalizeCheck exits through a referenced interval and a hung shutdown', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-cleanup-exit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = resolve(directory, 'fixture.mjs');
  const helper = new URL('./test-session-lifecycle.mjs', import.meta.url).href;
  await writeFile(fixture, `
import { disposeTestSession, finalizeCheck } from ${JSON.stringify(helper)};
const mode = process.env.MODE;
// A referenced interval is invisible to _getActiveHandles() and would keep this
// process alive forever without the explicit exit in finalizeCheck.
setInterval(() => {}, 1000);
const session = {
  extensionRunner: { emit: mode === 'hang' ? () => new Promise(() => {}) : async () => {} },
  dispose() {},
};
process.exitCode = 7;
await finalizeCheck(async () => {
  await disposeTestSession(session, { timeoutMs: 150 });
  if (mode === 'hang-cleanup') await new Promise(() => {});
}, { timeoutMs: 400 });
`);
  const cases = [
    { mode: 'clean', expected: 7, pattern: null },
    { mode: 'hang', expected: 1, pattern: /session shutdown did not finish within 150ms/ },
    { mode: 'hang-cleanup', expected: 1, pattern: /cleanup exceeded 400ms/ },
  ];
  for (const { mode, expected, pattern } of cases) {
    const started = Date.now();
    const run = spawnSync(process.execPath, [fixture], {
      encoding: 'utf8', timeout: 10000, env: { ...process.env, MODE: mode },
    });
    assert.equal(run.signal, null, `${mode}: the fixture must exit, not be killed by the test timeout`);
    assert.equal(run.status, expected, `${mode}: ${run.stderr}`);
    assert.ok(Date.now() - started < 5000, `${mode}: cleanup must stay bounded`);
    if (pattern) assert.match(run.stderr, pattern);
  }
});
