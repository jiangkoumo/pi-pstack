import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import { SessionManager } from '@earendil-works/pi-coding-agent';

test('mode on before first message persists immediately to file and survives new manager instance', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-first-msg-mode-'));
  const agentDir = resolve(directory, 'agent');
  const sessionsDir = resolve(directory, 'sessions');
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    await mkdir(agentDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    const { default: pstack } = await createJiti(import.meta.url).import('../extensions/pstack/index.ts');

    const handlers = new Map();
    const commands = new Map();
    const manager = SessionManager.create(directory, sessionsDir);
    const model = { provider: 'fixture', id: 'model', reasoning: false };
    const ctx = {
      cwd: directory, mode: 'rpc', sessionManager: manager, model,
      modelRegistry: { getAvailable: () => [model] },
      isIdle: () => true, isProjectTrusted: () => false,
    };
    pstack({
      on: (name, handler) => handlers.set(name, handler),
      registerCommand: (name, command) => commands.set(name, command.handler),
      appendEntry: (type, data) => manager.appendCustomEntry(type, data),
      sendMessage: () => {},
    });

    // Run /poteto-mode on before ANY assistant or user message
    await commands.get('poteto-mode')('on', ctx);

    // Verify before_agent_start immediately injects poteto-mode guidance
    const startEvent = { messageType: 'user', prompt: 'hello', systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(startEvent, ctx);
    const injected = Object.values(startEvent.systemPromptOptions.sections).join('\n');
    assert.match(injected, /Persistent poteto-mode is ON for this user request/);

    // Re-instantiate against the same session manager before any message exists on disk
    const secondEvent = { messageType: 'user', prompt: 'second turn', systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(secondEvent, ctx);
    const freshInjected = Object.values(secondEvent.systemPromptOptions.sections).join('\n');
    assert.match(freshInjected, /Persistent poteto-mode is ON for this user request/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('mode guidance and role context are re-injected on before_agent_start after compaction', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-compact-mode-'));
  const agentDir = resolve(directory, 'agent');
  const sessionsDir = resolve(directory, 'sessions');
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    await mkdir(agentDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    const { default: pstack } = await createJiti(import.meta.url).import('../extensions/pstack/index.ts');

    const handlers = new Map();
    const commands = new Map();
    const manager = SessionManager.create(directory, sessionsDir);
    const model = { provider: 'fixture', id: 'model', reasoning: false };
    const ctx = {
      cwd: directory, mode: 'rpc', sessionManager: manager, model,
      modelRegistry: { getAvailable: () => [model] },
      isIdle: () => true, isProjectTrusted: () => false,
    };
    pstack({
      on: (name, handler) => handlers.set(name, handler),
      registerCommand: (name, command) => commands.set(name, command.handler),
      appendEntry: (type, data) => manager.appendCustomEntry(type, data),
      sendMessage: () => {},
    });

    await commands.get('poteto-mode')('on', ctx);

    // Turn 1
    const t1 = { messageType: 'user', prompt: 'turn 1', systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(t1, ctx);
    assert.match(Object.values(t1.systemPromptOptions.sections).join('\n'), /Persistent poteto-mode is ON/);

    // Simulate compaction entry in the branch
    manager.appendCompaction('compacted summary', 100);

    // Turn 2 after compaction: before_agent_start must still inject mode guidance and pstack context
    const t2 = { messageType: 'user', prompt: 'turn 2 after compaction', systemPromptOptions: { sections: {} } };
    await handlers.get('before_agent_start')(t2, ctx);
    const t2Prompt = Object.values(t2.systemPromptOptions.sections).join('\n');
    assert.match(t2Prompt, /Persistent poteto-mode is ON/);
    assert.match(t2Prompt, /Pstack run directory:/);
    assert.match(t2Prompt, /Configured role preferences/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
