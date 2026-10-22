// Optional live acceptance: real model, isolated session/config, no product writes.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent';
import { disposeTestSession, withTimeout } from './test-session-lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const operatorDir = getAgentDir();
const credentials = JSON.parse(await readFile(resolve(operatorDir, 'auth.json'), 'utf8'));
const runtime = await ModelRuntime.create({
  modelsPath: resolve(operatorDir, 'models.json'),
  credentials: {
    read: async id => credentials[id],
    list: async () => Object.entries(credentials).map(([providerId, c]) => ({ providerId, type: c.type })),
    modify: async () => { throw new Error('Operator credentials are read-only'); },
    delete: async () => { throw new Error('Operator credentials are read-only'); },
  },
  allowModelNetwork: false,
});
const model = runtime.getModel('magpie', 'opendesign/deepseek-v4.1-flash');
assert(model, 'Requested model must be available');
const dir = await mkdtemp(resolve(tmpdir(), 'pstack-stage-b-skills-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const results = [];
try {
  const agentDir = resolve(dir, 'agent');
  await mkdir(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const decisions = [
    ['D101', 'Approve the search index migration', 'Cuts search latency; staging replay passed; a rollback requires rebuilding the old index.'],
    ['D102', 'Choose the invoice retention period', '30 days costs less; 90 days supports quarterly disputes; legal policy is unknown.'],
    ['D103', 'Merge the retry fix', 'Stops duplicate deliveries; regression reproduction passes; adds one database write.'],
    ['D104', 'Grant staging access', 'Needed for the release smoke test; access is currently missing; waiting blocks that test.'],
    ['D105', 'Approve the accessibility copy', 'Explains failed payments clearly; keyboard review passed; wording remains a product choice.'],
    ['D106', 'Pick the rollout window', 'Morning has staffing; overnight has lower traffic; on-call coverage is unknown.'],
    ['D107', 'Approve the dependency upgrade', 'Fixes the reported parser crash; compatibility suite passed; older plugins may need updates.'],
  ];
  const cases = [
    { id: 'sharpen', skill: 'sharpen', prompt: '/skill:sharpen Investigate why our Node queue occasionally executes a job twice after a timeout. Keep the scope to identifying the cause and a reproducible check.', validate(reply) {
      assert.match(reply, /queue|job|timeout/i);
      assert.match(reply, /trace|log|source|code|raw/i);
      assert.match(reply, /test|reproduc|check|independent/i);
      assert(!/^#{1,3}\s*(?:\d+\.|four questions|answers|analysis|rewritten prompt)|^Read the skill|^Here(?:’|')s/im.test(reply), 'Return the rewritten prompt itself, not a separate framing answer');
    } },
    { id: 'ketchup', skill: 'ketchup', history: decisions, prompt: '/skill:ketchup', validate(reply) {
      const topics = [/search index/i, /retention/i, /retry/i, /staging access/i, /accessibility/i, /rollout window/i, /dependency upgrade/i];
      for (const [index, topic] of topics.entries()) assert(topic.test(reply), `Missing pending decision ${decisions[index][0]}: ${topic}`);
    } },
  ];
  for (const item of cases) {
    let session;
    try {
      const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', compaction: { enabled: false }, retry: { enabled: false } });
      const loader = new DefaultResourceLoader({ cwd: dir, agentDir, settingsManager, noExtensions: true, additionalSkillPaths: [resolve(root, 'skills', item.skill)], noContextFiles: true, noPromptTemplates: true, noThemes: true });
      await loader.reload();
      const manager = SessionManager.inMemory(dir);
      if (item.history) {
        manager.appendMessage({ role: 'user', content: 'Prepare the release and report every decision still needing me. Do not make those decisions.', timestamp: Date.now() });
        manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'All seven items still await the user:\n' + decisions.map(([id, name, context]) => `${id}: ${name}. ${context}`).join('\n') }], api: 'openai-completions', provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
      }
      ({ session } = await createAgentSession({ cwd: dir, agentDir, settingsManager, modelRuntime: runtime, model, resourceLoader: loader, sessionManager: manager, tools: ['read'] }));
      await withTimeout(session.prompt(item.prompt), 45000, item.id);
      const reply = session.getLastAssistantText();
      try { item.validate(reply); }
      catch (error) { console.error(JSON.stringify({ id: item.id, reply })); throw error; }
      results.push({ id: item.id, passed: true, reply });
    } finally {
      if (session?.isStreaming) await session.abort();
      await disposeTestSession(session);
    }
  }
  const report = { model: `${model.provider}/${model.id}`, passed: results.length, cases: results, scope: 'Real model output on fixture prompts; human review of replies remains part of acceptance.' };
  const out = process.argv[2];
  if (out) await writeFile(resolve(out), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(dir, { recursive: true, force: true });
}
