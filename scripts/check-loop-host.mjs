#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed Pi package root');

const {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  ModelRuntime,
} = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));

const directory = await mkdtemp(resolve(tmpdir(), 'pstack-loop-host-test-'));
process.env.PI_CODING_AGENT_DIR = resolve(directory, 'agent');
const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = resolve(directory, 'workspace');

const requests = [];
const failures = [];

const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  try {
    requests.push(JSON.parse(body));
  } catch {
    // ignore
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'pstack-loop-host', object: 'chat.completion.chunk', created: 1, model: 'fixture' };
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'Step iteration executed.' }, finish_reason: null }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});

await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const port = server.address().port;

try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const modelsPath = resolve(agentDir, 'models.json');
  await writeFile(modelsPath, JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: 'openai-completions',
        apiKey: 'test-only',
        models: [{
          id: 'model',
          name: 'Fixture',
          reasoning: false,
          input: ['text'],
          contextWindow: 64000,
          maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }]
      }
    }
  }));

  const runtime = await ModelRuntime.create({
    authPath: resolve(agentDir, 'auth.json'),
    modelsPath,
    allowModelNetwork: false
  });
  const model = runtime.getModel('fixture', 'model');
  assert(model);

  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: 'never',
    compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1024 },
    retry: { enabled: false }
  });

  async function openSession(sessionDir, reason = 'startup') {
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      additionalExtensionPaths: [root],
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);

    const manager = SessionManager.create(cwd, sessionDir);
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      settingsManager,
      modelRuntime: runtime,
      model,
      resourceLoader: loader,
      sessionManager: manager,
      tools: [],
      sessionStartEvent: { type: 'session_start', reason }
    });
    await session.bindExtensions({ mode: 'rpc', onError: e => failures.push(e) });
    return { session, manager };
  }

  // -------------------------------------------------------------
  // Test 1: Bounded loop stops at max-turns budget
  // -------------------------------------------------------------
  {
    const sessionDir = resolve(directory, 's1');
    const { session, manager } = await openSession(sessionDir);
    const beforeCount = requests.length;

    // Start a 2-turn loop with failing predicate until budget exhausted
    await session.prompt('/loop run --max-turns 2 --until false test budget exhaustion');
    await session.waitForIdle();

    // Each turn triggers one request and settles, advancing turn until budget
    const afterCount = requests.length;
    assert.equal(afterCount - beforeCount, 2, 'Should execute exactly 2 turns for --max-turns 2');

    const branch = manager.getBranch();
    const loopEntries = branch.filter(e => e.type === 'custom' && e.customType === 'pstack.loop.v1');
    assert(loopEntries.length >= 2, 'Must record loop state entries');
    const latest = loopEntries.at(-1).data;
    assert.equal(latest.status, 'stopped', 'Loop status should be stopped');
    assert.equal(latest.reason, 'budget-exhausted', 'Reason should be budget-exhausted');
    assert.equal(latest.turn, 2, 'Turn count should be 2');
    console.log('PASS Test 1: Bounded loop stops at max-turns budget');
  }

  // -------------------------------------------------------------
  // Test 2: Loop stops when predicate is satisfied (exit code 0)
  // -------------------------------------------------------------
  {
    const sessionDir = resolve(directory, 's2');
    const { session, manager } = await openSession(sessionDir);
    const markerFile = resolve(cwd, 'done.marker');
    try { await rm(markerFile); } catch {}

    const beforeCount = requests.length;
    // Set predicate to check for marker file. We will create it after turn 1.
    // Use --max-turns 5.
    // To simulate satisfaction at turn 2, we can intercept before settle or write it before turn 2.
    let turnCount = 0;
    session.subscribe(event => {
      if (event.type === 'turn_start') {
        turnCount++;
        if (turnCount === 2) {
          // Create marker during turn 2 so predicate passes at turn 2 settlement
          writeFile(markerFile, 'DONE');
        }
      }
    });

    await session.prompt(`/loop run --max-turns 5 --until "test -f ${markerFile}" achieve goal`);
    await session.waitForIdle();
    assert.equal(turnCount, 2, 'Should stop after turn 2 when marker file appears');

    const branch = manager.getBranch();
    const loopEntries = branch.filter(e => e.type === 'custom' && e.customType === 'pstack.loop.v1');
    const latest = loopEntries.at(-1).data;
    assert.equal(latest.status, 'completed', 'Loop status should be completed');
    assert.equal(latest.reason, 'predicate-satisfied', 'Reason should be predicate-satisfied');
    assert.equal(latest.lastPredicateResult?.exitCode, 0, 'Predicate exit code should be 0');
    console.log('PASS Test 2: Loop stops when predicate is satisfied');
  }

  // -------------------------------------------------------------
  // Test 3: Operator /loop stop aborts active loop
  // -------------------------------------------------------------
  {
    const sessionDir = resolve(directory, 's3');
    const { session, manager } = await openSession(sessionDir);

    // Stop on an idle session returns stopped: false without throwing
    await session.prompt('/loop stop');

    // Start a 10-turn loop, stop it after turn 1
    session.subscribe(event => {
      if (event.type === 'turn_start') {
        // Stop the loop while it is running
        session.prompt('/loop stop');
      }
    });

    await session.prompt('/loop run --max-turns 10 --until false long running work');
    await session.waitForIdle();

    const branch = manager.getBranch();
    const loopEntries = branch.filter(e => e.type === 'custom' && e.customType === 'pstack.loop.v1');
    const latest = loopEntries.at(-1).data;
    assert.equal(latest.status, 'stopped');
    assert(latest.reason.includes('operator') || latest.reason.includes('aborted'));
    console.log('PASS Test 3: Operator /loop stop aborts active loop');
  }

  console.log(JSON.stringify({
    status: 'passed',
    testSuite: 'P5 /loop host integration',
    scenarios: ['budget-exhaustion', 'predicate-satisfaction', 'operator-stop'],
    hostVersion: 'Pi 1.3.0',
    failures: failures.length
  }, null, 2));

} finally {
  server.close();
  await rm(directory, { recursive: true, force: true });
}
