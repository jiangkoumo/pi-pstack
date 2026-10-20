import assert from 'node:assert/strict';
import test from 'node:test';
import * as loop from '../extensions/pstack/loop.mjs';

test('abort notification persists interrupted once and leaves explicit terminal states alone', () => {
  const handlers = new Map();
  const entries = [];
  const pi = {
    on: (name, handler) => { handlers.set(name, handler); return () => handlers.delete(name); },
    appendEntry: (customType, data) => entries.push({ type: 'custom', customType, data }),
  };
  assert.equal(typeof loop.registerLoopAbortHooks, 'function');
  const dispose = loop.registerLoopAbortHooks(pi);
  const ctx = { sessionManager: { getBranch: () => entries } };
  const notify = aborted => handlers.get('agent_settled')({ aborted }, ctx);
  notify(true);
  assert.equal(entries.length, 0);
  const initial = loop.createInitialLoopState({ goal: 'fix', until: { command: 'false' } });
  entries.push({ type: 'custom', customType: loop.LOOP_ENTRY, data: initial });
  notify(false);
  assert.equal(entries.length, 1);
  notify(true);
  assert.equal(entries.length, 2);
  assert.equal(entries.at(-1).data.status, 'interrupted');
  assert.equal(entries.at(-1).data.reason, 'operator-aborted');
  assert.equal(entries.at(-1).data.turn, initial.turn);
  notify(true);
  assert.equal(entries.length, 2);
  for (const status of ['completed', 'failed', 'stopped', 'interrupted']) {
    entries.push({ type: 'custom', customType: loop.LOOP_ENTRY, data: { ...initial, status, reason: 'operator-stopped' } });
    const count = entries.length;
    notify(true);
    assert.equal(entries.length, count, status);
  }
  // Some host paths can emit an aborted settle boundary before the notification.
  entries.push({ type: 'custom', customType: loop.LOOP_ENTRY,
    data: loop.decideNextStep(initial, null, { outcome: 'aborted' }).nextState });
  notify(true);
  assert.equal(entries.at(-1).data.status, 'interrupted');
  dispose();
  assert.equal(handlers.size, 0);
});
