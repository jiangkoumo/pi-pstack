import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOOP_ENTRY,
  LOOP_TURN_TYPE,
  parseLoopArgs,
  loopFromBranch,
  createInitialLoopState,
  decideNextStep,
  renderLoopPrompt,
} from '../extensions/pstack/loop.mjs';

test('parseLoopArgs parses status and stop subcommands', () => {
  assert.deepEqual(parseLoopArgs(''), { action: 'status' });
  assert.deepEqual(parseLoopArgs('status'), { action: 'status' });
  assert.deepEqual(parseLoopArgs('  status  '), { action: 'status' });

  assert.deepEqual(parseLoopArgs('stop'), { action: 'stop', reason: 'operator-stopped' });
  assert.deepEqual(parseLoopArgs('stop user cancelled early'), { action: 'stop', reason: 'user cancelled early' });
});

test('parseLoopArgs parses resume subcommand with options', () => {
  assert.deepEqual(parseLoopArgs('resume'), { action: 'resume', maxTurns: undefined });
  assert.deepEqual(parseLoopArgs('resume --max-turns 12'), { action: 'resume', maxTurns: 12 });
  assert.throws(() => parseLoopArgs('resume --max-turns 0'), /--max-turns must be between/);
  assert.throws(() => parseLoopArgs('resume --max-turns 200'), /--max-turns must be between/);
  assert.throws(() => parseLoopArgs('resume --unknown-flag'), /Unknown option for resume/);
});

test('parseLoopArgs parses run options and goals', () => {
  const r1 = parseLoopArgs('run fix the bug in math.ts');
  assert.equal(r1.action, 'run');
  assert.equal(r1.goal, 'fix the bug in math.ts');
  assert.equal(r1.maxTurns, 8);
  assert.equal(r1.until, null);
  assert.equal(r1.allowDirty, false);

  const r2 = parseLoopArgs('--max-turns 5 --until "npm test" --allow-dirty refactor the parser');
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
  assert.throws(() => parseLoopArgs('--max-turns'), /--max-turns requires a positive integer/);
  assert.throws(() => parseLoopArgs('--until'), /--until requires a shell command string/);
  assert.throws(() => parseLoopArgs('--unknown foo'), /Unknown \/loop option: --unknown/);
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

test('renderLoopPrompt generates proper instructions without false commitments', () => {
  const state = createInitialLoopState({ goal: 'implement algorithm', maxTurns: 5, until: { command: 'node test.mjs', timeoutSec: 10 } });
  const prompt = renderLoopPrompt(state, 2, { exitCode: 1 });
  assert(prompt.includes('[pstack /loop turn 2/5]'));
  assert(prompt.includes('Goal: implement algorithm'));
  assert(prompt.includes('Stop predicate: `node test.mjs`'));
  assert(prompt.includes('Last predicate exit code: 1'));
  assert(prompt.includes('Do not make unrequested git commits or pushes.'));
});
