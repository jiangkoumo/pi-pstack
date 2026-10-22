import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
import {
  LOOP_ENTRY,
  LOOP_TURN_TYPE,
  parseLoopArgs,
  loopFromBranch,
  createInitialLoopState,
  decideNextStep,
  renderLoopPrompt,
} from '../extensions/pstack/loop.mjs';
import { COMPLETION_EXIT_CODES } from '../extensions/pstack/publication-gate.mjs';

const pstack = await createJiti(import.meta.url).import('../extensions/pstack/index.ts', { default: true });

function loopHarness({ mode = 'rpc', state = null } = {}) {
  const entries = state ? [{ type: 'custom', customType: LOOP_ENTRY, data: state }] : [];
  const commands = new Map();
  const handlers = new Map();
  const messages = [];
  const executions = [];
  pstack({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (customType, data) => entries.push({ type: 'custom', customType, data }),
    sendMessage: async (...args) => messages.push(args),
    exec: async (...args) => {
      executions.push(args);
      return { code: 1, killed: false, stdout: '', stderr: '' };
    },
  });
  const ctx = { mode, cwd: process.cwd(), isIdle: () => true, sessionManager: { getBranch: () => entries } };
  return { entries, messages, executions, run: args => commands.get('loop').handler(args, ctx),
    settle: (outcome = 'completed', canContinue = true) => handlers.get('agent_before_settle')({
      outcome, context: { canContinue }, entries: [],
    }, ctx) };
}

test('parseLoopArgs parses status and stop subcommands', () => {
  assert.deepEqual(parseLoopArgs(''), { action: 'status' });
  assert.deepEqual(parseLoopArgs('status'), { action: 'status' });
  assert.deepEqual(parseLoopArgs('  status  '), { action: 'status' });

  assert.deepEqual(parseLoopArgs('stop'), { action: 'stop', reason: 'operator-stopped' });
});

test('parseLoopArgs parses resume subcommand with options', () => {
  assert.deepEqual(parseLoopArgs('resume'), { action: 'resume', maxTurns: undefined });
  assert.deepEqual(parseLoopArgs('resume --max-turns 12'), { action: 'resume', maxTurns: 12 });
  assert.throws(() => parseLoopArgs('resume --max-turns 0'), /--max-turns must be between/);
  assert.throws(() => parseLoopArgs('resume --max-turns 200'), /--max-turns must be between/);
  assert.throws(() => parseLoopArgs('resume --unknown-flag'), /Unknown option for resume/);
});

test('parseLoopArgs parses run options and goals', () => {
  const r1 = parseLoopArgs('run --until "npm test" fix the bug in math.ts');
  assert.equal(r1.action, 'run');
  assert.equal(r1.goal, 'fix the bug in math.ts');
  assert.equal(r1.maxTurns, 8);
  assert.deepEqual(r1.until, { command: 'npm test', timeoutSec: 60 });
  assert.equal(r1.allowDirty, false);

  const r2 = parseLoopArgs('run --max-turns 5 --until "npm test" --allow-dirty refactor the parser');
  assert.equal(r2.action, 'run');
  assert.equal(r2.goal, 'refactor the parser');
  assert.equal(r2.maxTurns, 5);
  assert.deepEqual(r2.until, { command: 'npm test', timeoutSec: 60 });
  assert.equal(r2.allowDirty, true);

  const r3 = parseLoopArgs('run --until "pytest tests/test_api.py" --until-timeout 120 -- verify endpoints');
  assert.equal(r3.action, 'run');
  assert.equal(r3.goal, 'verify endpoints');
  assert.deepEqual(r3.until, { command: 'pytest tests/test_api.py', timeoutSec: 120 });

  assert.throws(() => parseLoopArgs('run'), /Usage: \/loop/);
  assert.throws(() => parseLoopArgs('run --max-turns'), /--max-turns requires a positive integer/);
  assert.throws(() => parseLoopArgs('run --until'), /--until requires a shell command string/);
  assert.throws(() => parseLoopArgs('run --unknown foo'), /Unknown \/loop option: --unknown/);
});

test('B1: print and JSON reject run/resume before state changes or messages', async () => {
  for (const mode of ['print', 'json']) {
    const h = loopHarness({ mode });
    await assert.rejects(h.run('run --until "npm test" --allow-dirty fix'), /RPC\/TUI/);
    assert.equal(h.entries.length, 0);
    assert.equal(h.messages.length, 0);
    assert.equal(h.executions.length, 0);
    const state = { ...createInitialLoopState({ goal: 'fix', until: { command: 'npm test' } }), status: 'interrupted' };
    const resumed = loopHarness({ mode, state });
    await assert.rejects(resumed.run('resume'), /RPC\/TUI/);
    assert.equal(resumed.entries.length, 1);
    assert.equal(resumed.messages.length, 0);
  }
  for (const mode of ['rpc', 'tui']) {
    const h = loopHarness({ mode });
    await h.run('run --until "npm test" --allow-dirty fix');
    assert.equal(h.entries.at(-1).data.status, 'running');
    assert.equal(h.messages.length, 1);
  }
});

test('B3: goals require run and reserved command words cannot swallow trailing goals', () => {
  for (const args of ['stop the flaky test', 'status foo', 'resume the task', 'fix tests', '--until "npm test" fix']) {
    assert.throws(() => parseLoopArgs(args));
  }
  for (const goal of ['stop the flaky test', 'status foo', 'resume the task']) {
    const parsed = parseLoopArgs(`run --until "npm test" ${goal}`);
    assert.equal(parsed.action, 'run');
    assert.equal(parsed.goal, goal);
  }
});

test('B4: new runs and resumed legacy loops require an executable stop predicate', async () => {
  assert.throws(() => parseLoopArgs('run fix tests'), /--until.*required/);
  assert.throws(() => parseLoopArgs('run --until "" fix tests'), /--until/);
  const legacy = { ...createInitialLoopState({ goal: 'fix tests' }), status: 'interrupted' };
  const h = loopHarness({ state: legacy });
  await assert.rejects(h.run('resume'), /--until.*required/);
  assert.equal(h.entries.length, 1);
  assert.equal(h.messages.length, 0);
});

test('B9: aborted or errored turns never execute the until command', async () => {
  for (const [outcome, reason] of [['aborted', 'operator-aborted'], ['error', 'turn-error']]) {
    const state = createInitialLoopState({ goal: 'fix', until: { command: 'side-effecting predicate' } });
    const h = loopHarness({ state });
    const result = await h.settle(outcome);
    assert.equal(h.executions.length, 0, outcome);
    assert.equal(result.continue, false);
    assert.equal(result.entries.at(-1).data.reason, reason);
  }
  const h = loopHarness({ state: createInitialLoopState({ goal: 'fix', until: { command: 'npm test' } }) });
  const result = await h.settle();
  assert.equal(h.executions.length, 1);
  assert.equal(result.continue, true);
});

test('B11: shell words preserve escaped quotes and reject malformed tokens and integers', () => {
  const parsed = parseLoopArgs(String.raw`run --until "echo \"x\"" fix\ the\ test`);
  assert.equal(parsed.until.command, 'echo "x"');
  assert.equal(parsed.goal, 'fix the test');
  assert.equal(parseLoopArgs(String.raw`run --until 'echo "x"' fix`).until.command, 'echo "x"');
  assert.equal(parseLoopArgs(String.raw`run --until "printf '%s' C:\\tmp" fix`).until.command, String.raw`printf '%s' C:\tmp`);
  for (const value of ['5abc', '1.5', 'NaN', 'Infinity']) {
    assert.throws(() => parseLoopArgs(`run --max-turns ${value} --until true fix`), /--max-turns/);
    assert.throws(() => parseLoopArgs(`resume --max-turns ${value}`), /--max-turns/);
    assert.throws(() => parseLoopArgs(`run --until-timeout ${value} --until true fix`), /--until-timeout/);
  }
  assert.throws(() => parseLoopArgs('run --until "unterminated fix'), /quote/i);
  assert.throws(() => parseLoopArgs('run --until true fix\\'), /escape/i);
});

test('loopFromBranch extracts current state', () => {
  assert.deepEqual(loopFromBranch([]), { active: false, state: null });
  assert.deepEqual(loopFromBranch([{ type: 'message', content: 'hello' }]), { active: false, state: null });

  const activeEntry = {
    type: 'custom',
    customType: LOOP_ENTRY,
    data: {
      version: 1,
      runId: 'r1',
      status: 'running',
      goal: 'write tests',
      turn: 2,
      maxTurns: 5,
    },
  };
  assert.deepEqual(loopFromBranch([activeEntry]), { active: true, state: activeEntry.data });

  const stoppedEntry = {
    type: 'custom',
    customType: LOOP_ENTRY,
    data: {
      version: 1,
      runId: 'r1',
      status: 'stopped',
      goal: 'write tests',
      turn: 3,
      maxTurns: 5,
    },
  };
  assert.deepEqual(loopFromBranch([activeEntry, stoppedEntry]), { active: false, state: stoppedEntry.data });

  assert.throws(() => loopFromBranch([{ type: 'custom', customType: LOOP_ENTRY, data: { version: 2 } }]), /Unsupported or malformed/);
});

test('createInitialLoopState produces expected structure', () => {
  const state = createInitialLoopState({ goal: 'fix root causes', maxTurns: 10, until: { command: 'npm test', timeoutSec: 30 } });
  assert.equal(state.version, 1);
  assert.equal(typeof state.runId, 'string');
  assert.equal(state.status, 'running');
  assert.equal(state.turn, 1);
  assert.equal(state.maxTurns, 10);
  assert.equal(state.goal, 'fix root causes');
  assert.deepEqual(state.until, { command: 'npm test', timeoutSec: 30 });
});

test('decideNextStep handles host outcomes and predicate results', () => {
  const baseState = createInitialLoopState({ goal: 'test', maxTurns: 3, until: { command: 'npm test', timeoutSec: 30 } });

  // 1. Host aborted
  const sAborted = decideNextStep(baseState, null, { outcome: 'aborted' });
  assert.equal(sAborted.action, 'stop');
  assert.equal(sAborted.nextState.status, 'stopped');
  assert.equal(sAborted.nextState.reason, 'operator-aborted');

  // 2. Host error
  const sError = decideNextStep(baseState, null, { outcome: 'error' });
  assert.equal(sError.action, 'stop');
  assert.equal(sError.nextState.status, 'failed');
  assert.equal(sError.nextState.reason, 'turn-error');

  // 3. Predicate satisfied (exit code 0)
  const sSatisfied = decideNextStep(baseState, { exitCode: 0 });
  assert.equal(sSatisfied.action, 'stop');
  assert.equal(sSatisfied.nextState.status, 'completed');
  assert.equal(sSatisfied.nextState.reason, 'predicate-satisfied');

  // 4. Predicate not satisfied (exit code 1), budget remaining (turn 1 < 3)
  const sContinue = decideNextStep(baseState, { exitCode: 1 });
  assert.equal(sContinue.action, 'continue');
  assert.equal(sContinue.nextState.status, 'running');
  assert.equal(sContinue.nextState.turn, 2);

  // 5. Predicate not satisfied, but budget reached (turn 3 of 3)
  const lastTurnState = { ...baseState, turn: 3 };
  const sExhausted = decideNextStep(lastTurnState, { exitCode: 1 });
  assert.equal(sExhausted.action, 'stop');
  assert.equal(sExhausted.nextState.status, 'stopped');
  assert.equal(sExhausted.nextState.reason, 'budget-exhausted');

  // 6. Predicate timed out
  const sTimedOut = decideNextStep(baseState, { exitCode: null, timedOut: true });
  assert.equal(sTimedOut.action, 'stop');
  assert.equal(sTimedOut.nextState.status, 'failed');
  assert.equal(sTimedOut.nextState.reason, 'predicate-timeout');

  // 7. Predicate error (exitCode >= 126 or error flag)
  const sPredErr = decideNextStep(baseState, { exitCode: 127 });
  assert.equal(sPredErr.action, 'stop');
  assert.equal(sPredErr.nextState.status, 'failed');
  assert.equal(sPredErr.nextState.reason, 'predicate-error');
});

test('Pi host: print/JSON refusal, multi-turn RPC budget/predicate stops, and abort/error guards', { timeout: 20000 }, async () => {
  const { createServer } = await import('node:http');
  const { mkdtemp, mkdir, writeFile, stat, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { resolve } = await import('node:path');
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import('@earendil-works/pi-coding-agent');
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-loop-regression-'));
  const sessions = [];
  let requests = 0;
  let responseMode = 'success';
  let abortSession;
  let predicateMarker;
  let predicateRequest;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain the fixture request */ }
    requests++;
    if (responseMode === 'abort') {
      void abortSession.abort();
      return;
    }
    if (responseMode === 'error') {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'fixture turn error' } }));
      return;
    }
    if (predicateMarker && requests === predicateRequest) await writeFile(predicateMarker, 'done');
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const base = { id: 'loop-regression', object: 'chat.completion.chunk', created: 1, model: 'fixture' };
    for (const [delta, finish_reason] of [[{ role: 'assistant', content: 'Done.' }, null], [{}, 'stop']]) {
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    }
    response.end('data: [DONE]\n\n');
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
    async function open(mode) {
      const errors = [];
      const boundaries = [];
      const manager = SessionManager.inMemory(directory);
      const resourceLoader = new DefaultResourceLoader({ cwd: directory, agentDir, settingsManager,
        noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
        additionalExtensionPaths: [new URL('../extensions/pstack/index.ts', import.meta.url).pathname],
        extensionFactories: [pi => pi.on('agent_before_settle', event => {
          boundaries.push({ outcome: event.outcome, canContinue: event.context.canContinue });
        })] });
      await resourceLoader.reload();
      assert.deepEqual(resourceLoader.getExtensions().errors, []);
      const { session } = await createAgentSession({ cwd: directory, agentDir, settingsManager, modelRuntime,
        model: modelRuntime.getModel('fixture', 'model'), resourceLoader, sessionManager: manager, tools: [] });
      sessions.push(session);
      await session.bindExtensions({ mode, onError: error => errors.push(error) });
      return { session, manager, errors, boundaries, latest: () => loopFromBranch(manager.getBranch()).state };
    }
    for (const mode of ['print', 'json']) {
      const h = await open(mode);
      const before = requests;
      await h.session.prompt('/loop run --until true --allow-dirty fix');
      await h.session.waitForIdle();
      assert(h.errors.some(error => /RPC\/TUI/.test(error.error)));
      assert.equal(h.latest(), null);
      assert.equal(requests, before);
    }
    const h = await open('rpc');
    const before = requests;
    await h.session.prompt('/loop run --max-turns 2 --until false --allow-dirty fix');
    await h.session.waitForIdle();
    assert.equal(requests - before, 2);
    assert.equal(h.latest().reason, 'budget-exhausted');
    assert.equal(h.latest().turn, 2);
    assert.equal(h.latest().lastPredicateResult.exitCode, 1);
    predicateMarker = resolve(directory, 'completed.marker');
    predicateRequest = requests + 2;
    await h.session.prompt(`/loop run --max-turns 4 --until "test -f ${predicateMarker}" --allow-dirty fix`);
    await h.session.waitForIdle();
    assert.equal(requests - before, 4);
    assert.equal(h.latest().status, 'completed');
    assert.equal(h.latest().reason, 'predicate-satisfied');
    assert.equal(h.latest().turn, 2);
    assert.equal(h.latest().lastPredicateResult.exitCode, 0);
    assert.equal(h.boundaries.length, 4);
    assert(h.boundaries.every(boundary => boundary.outcome === 'completed'));
    // The observer runs after pstack: proposed loop messages enable continuation,
    // while the two terminal answers still have canContinue=false.
    assert.deepEqual(h.boundaries.map(boundary => boundary.canContinue), [true, false, true, false]);
    assert.deepEqual(h.errors, []);
    for (const [outcome, reason] of [['error', 'turn-error'], ['abort', 'operator-aborted']]) {
      responseMode = outcome;
      const stopped = await open('rpc');
      abortSession = stopped.session;
      const marker = resolve(directory, `${outcome}.marker`);
      await stopped.session.prompt(`/loop run --until "touch ${marker}" --allow-dirty fix`);
      await stopped.session.waitForIdle();
      if (outcome === 'error') assert.equal(stopped.latest().reason, reason);
      // Pi may skip the settle boundary entirely on abort; either path must avoid the predicate.
      assert.equal(stopped.latest().lastPredicateResult, null);
      await assert.rejects(stat(marker), { code: 'ENOENT' });
      assert.deepEqual(stopped.errors, []);
    }
  } finally {
    for (const session of sessions) session.dispose();
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
    await rm(directory, { recursive: true, force: true });
  }
});

test('A6: completion predicate exit 1 continues while incomplete, 126 stops blocked, budget and abort still win', () => {
  const state = createInitialLoopState({ goal: 'publish the verified change', maxTurns: 3 });
  const incomplete = { exitCode: COMPLETION_EXIT_CODES.incomplete };
  const continueDecision = decideNextStep(state, incomplete);
  assert.equal(continueDecision.action, 'continue');
  assert.equal(continueDecision.nextState.turn, 2);

  const exhausted = decideNextStep({ ...state, turn: 3 }, incomplete);
  assert.equal(exhausted.action, 'stop');
  assert.equal(exhausted.nextState.reason, 'budget-exhausted');

  const blockedDecision = decideNextStep(state, { exitCode: COMPLETION_EXIT_CODES.blocked });
  assert.equal(blockedDecision.action, 'stop');
  assert.equal(blockedDecision.nextState.status, 'failed');
  assert.equal(blockedDecision.nextState.reason, 'predicate-error');

  const completeDecision = decideNextStep(state, { exitCode: COMPLETION_EXIT_CODES.complete });
  assert.equal(completeDecision.action, 'stop');
  assert.equal(completeDecision.nextState.status, 'completed');
  assert.equal(completeDecision.nextState.reason, 'predicate-satisfied');

  const aborted = decideNextStep(state, incomplete, { outcome: 'aborted' });
  assert.equal(aborted.action, 'stop');
  assert.equal(aborted.nextState.reason, 'operator-aborted');
});

test('renderLoopPrompt generates proper instructions without false commitments', () => {
  const state = createInitialLoopState({ goal: 'implement algorithm', maxTurns: 5, until: { command: 'node test.mjs', timeoutSec: 10 } });
  const prompt = renderLoopPrompt(state, 2, { exitCode: 1 });
  assert(prompt.includes('[pstack /loop turn 2/5]'));
  assert(prompt.includes('Goal: implement algorithm'));
  assert(prompt.includes('Stop predicate: `node test.mjs`'));
  assert(prompt.includes('Last predicate exit code: 1'));
  assert(prompt.includes('Do not make unrequested git commits or pushes.'));
});
