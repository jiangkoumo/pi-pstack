// Prompt-contract test for the delegation defaults. It pins the wording that reaches a model
// through modeGuidance and the shipped poteto-mode skill. It does not start a model, so it does
// not count real subagent spawns; host-side live checks own that evidence.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { modeGuidance, roleGuidance } from '../extensions/pstack/runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillPath = resolve(root, 'skills/poteto-mode/SKILL.md');
const skillFiles = {
  template: await readFile(resolve(root, 'adapters/pi/overrides/skills/poteto-mode/SKILL.md.template'), 'utf8'),
  generated: await readFile(skillPath, 'utf8'),
};
const modeOn = modeGuidance({ enabled: true, explicit: true }, skillPath, {});

test('mode on plus an ordinary feature request authorizes the playbook subagent delegation (prompt contract)', () => {
  assert.match(modeOn, /This mode authorizes the local subagent delegation its playbooks prescribe/);
  assert.match(modeOn, /\(how, architect, arena, delegate writer, interrogate, comment-sicko\)/);
  assert.doesNotMatch(modeOn, /grants no delegation/);
  assert.doesNotMatch(modeOn, /not permission to delegate/);
  for (const [name, text] of Object.entries(skillFiles)) {
    assert.match(text, /Invoking `\/skill:poteto-mode`, or turning persistent mode on with `\/poteto-mode on`, authorizes the local subagent delegation this playbook prescribes/, `${name} states the invocation grant`);
    assert.match(text, /Use pi-subagents `subagent` with `agent: "pstack\.poteto-agent"` for any subagent you spawn inside a playbook step/, `${name} routes playbook subagents to pstack.poteto-agent`);
    assert.match(text, /Launch a read-only reviewer \(`pstack\.comment-sicko`\)/, `${name} routes independent review to pstack.comment-sicko`);
    assert.doesNotMatch(text, /Loading a skill grants no extra authority to delegate/, `${name} drops the old blanket denial`);
  }
});

test('an explicit no-delegation instruction is answered by a zero-spawn contract (prompt contract)', () => {
  assert.match(modeOn, /Spawn no subagents when the user or project forbids delegation\./);
  assert.doesNotMatch(modeOn, /always delegate/i);
  for (const [name, text] of Object.entries(skillFiles)) {
    assert.match(text, /When the user or project instructions forbid delegation, spawn no subagents\./, `${name} keeps the operator override`);
    assert.match(text, /Use this sequence only when delegation is authorized/, `${name} ties the writer gate to the same grant`);
  }
});

test('push, PR, merge, external message and local commit gates stay separate (prompt contract)', () => {
  assert.match(modeOn, /Pushes, PR creation, merges and external messages still need separate explicit authorization\./);
  assert.match(modeOn, /Local commits need explicit operator authorization; never commit just because the user said "Fix it"\./);
  for (const [name, text] of Object.entries(skillFiles)) {
    assert.match(text, /Pushes, PR creation, merges and external messages still require separate explicit authorization in the current session\./, `${name} keeps the delivery gate`);
    assert.match(text, /Local commits require explicit operator authorization\./, `${name} keeps the commit gate`);
    assert.match(text, /Never commit just because the user said "Fix it"\./, `${name} rejects a bare fix instruction as commit authority`);
  }
});

test('delegation stays unauthorized when the mode is off or was never enabled', () => {
  const modeOff = modeGuidance({ enabled: false, explicit: true }, skillPath, {});
  assert.match(modeOff, /is OFF/);
  assert.doesNotMatch(modeOff, /authorizes the local subagent delegation/);
  assert.equal(modeGuidance({ enabled: false, explicit: false }, skillPath, {}), undefined);
});

test('role preferences still carry no permission to switch the current model', () => {
  const roles = roleGuidance({ code: { model: 'inherit' } });
  assert.match(roles, /not permission to switch the current model/);
  assert.doesNotMatch(roles, /permission to delegate/);
});
