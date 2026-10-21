import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent';
import { parseRoleAgent } from '../extensions/pstack/role-agents.mjs';
import { disposeTestSession } from './test-session-lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const seats = ['pstack.judgment-agent', 'pstack.strongest-agent', 'pstack.comment-sicko'];

// Product acceptance only: no remote model or task delegation. The public plugin
// executes actual foreground SDK children against this deterministic local SSE fixture.
export function findSubagentsRoot() {
  return [process.env.PI_SUBAGENTS_ROOT, resolve(getAgentDir(), 'npm/node_modules/pi-subagents'),
    resolve(homedir(), '.pi/agent/npm/node_modules/pi-subagents')].filter(Boolean).find(path => existsSync(resolve(path, 'index.js')));
}

export async function runReviewDiffFixture(options = {}) {
  const subRoot = findSubagentsRoot();
  if (!subRoot) {
    if (options.allowSkip) {
      return { status: 'skipped', reason: 'pi-subagents not found in environment' };
    }
    assert(subRoot, 'Set PI_SUBAGENTS_ROOT to an installed pi-subagents package');
  }
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-review-diff-'));
  const agentDir = resolve(directory, 'agent');
  const cwd = resolve(directory, 'workspace');
  const diffPath = resolve(cwd, 'review.diff');
  const frameworkPath = resolve(cwd, 'lead-judgment.md');
  const canary = resolve(cwd, 'write-canary.txt');
  const secret = `DIFF_EVIDENCE_${randomUUID()}`;
  const requests = [];
  const results = [];
  const errors = [];
  const registrations = [];
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  let session;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const tasks = seats.map((agent, index) => ({ agent,
    task: `Reviewer ${index + 1}. Intent: review the change. Scope: main plus working tree. Read ${diffPath} and report exact evidence with a file and line. Do not mutate files. The lead supplied this diff because reviewers cannot run Git.` }));
  const dispatch = { workflow: 'parallel', args: { tasks }, async: false,
    options: { artifacts: false, context: 'fresh', acceptance: false, timeoutMs: 30000 } };
  let handlerError;
  const server = createServer(async (request, response) => {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const parent = input.model === 'parent';
      const tools = input.messages.filter(message => message.role === 'tool');
      requests.push({ parent, input, url: request.url });
      let call;
      let content;
      if (parent && tools.length === 0) call = { name: 'subagent', arguments: dispatch };
      else if (parent && tools.length === 1) {
        assert.match(JSON.stringify(tools), new RegExp(secret), 'Parent must receive actual child evidence');
        call = { name: 'read', arguments: { path: frameworkPath } };
      } else if (parent) {
        assert.match(JSON.stringify(tools.at(-1)), /Filtering Principles/);
        content = `Intent: review change. Reviewers: A, B, C collected. Act On: sample.js:2 ${secret}. Consider: none. Noted: none. Dismissed: none. Agreement Map: all three independently read the same diff. Verdict: fix the proven issue; no edits applied.`;
      } else if (tools.length === 0) call = { name: 'write', arguments: { path: canary, content: 'unauthorized' } };
      else if (tools.length === 1) {
        assert.match(JSON.stringify(tools[0]), /not found|not available|unknown tool/i);
        call = { name: 'edit', arguments: { path: diffPath, oldText: secret, newText: 'tampered' } };
      } else if (tools.length === 2) {
        assert.match(JSON.stringify(tools[1]), /not found|not available|unknown tool/i);
        call = { name: 'read', arguments: { path: diffPath } };
      } else {
        assert.match(JSON.stringify(tools.at(-1)), new RegExp(secret), 'Child must read the real file');
        content = `Yes... Ha ha ha... Yes!\nISSUES sample.js:2 ${secret}; proposed deletion 1; MUST KILL sample; read ${diffPath}; no edits applied.`;
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const base = { id: `review-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: input.model };
      const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${requests.length}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } : { role: 'assistant', content };
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\n`);
      response.end('data: [DONE]\n\n');
    } catch (error) {
      handlerError = error;
      response.writeHead(500);
      response.end('Fixture assertion failed');
    }
  });
  try {
    await Promise.all([mkdir(agentDir), mkdir(cwd)]);
    const diff = `diff --git a/sample.js b/sample.js\n--- a/sample.js\n+++ b/sample.js\n@@ -1 +1,2 @@\n export const sample = 1;\n+// ${secret}\n`;
    await writeFile(diffPath, diff);
    await writeFile(frameworkPath, await readFile(resolve(root, 'skills/interrogate/references/lead-judgment.md'), 'utf8'));
    const settings = { defaultProjectTrust: 'never', subagents: { asyncByDefault: false, intercomBridge: { mode: 'off' } }, retry: { enabled: false }, compaction: { enabled: false } };
    await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify(settings));
    await new Promise(accept => server.listen(0, '127.0.0.1', accept));
    const modelsPath = resolve(agentDir, 'models.json');
    await writeFile(modelsPath, JSON.stringify({ providers: { fixture: {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only',
      models: ['parent', 'judgment', 'strongest', 'review'].map(id => ({ id, name: id, reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })),
    } } }));
    const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
    const reviewer = parseRoleAgent(await readFile(resolve(root, 'agents/comment-sicko.md'), 'utf8'), 'pstack.comment-sicko', resolve(root, 'agents'));
    assert.deepEqual(reviewer.tools, ['read', 'grep', 'find', 'ls', 'git_read']);
    const settingsManager = SettingsManager.inMemory(settings);
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true,
      additionalExtensionPaths: [resolve(subRoot, 'index.js')], noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
      extensionFactories: [pi => {
        pi.on('session_start', () => {
          for (const [index, name] of seats.entries()) {
            // Judgment/strongest registration belongs to the lead's shared files.
            // Use the same strict reviewer boundary while testing their public names.
            const request = { version: 1, name, definition: { ...reviewer,
              tools: ['read', 'grep', 'find', 'ls'],
              inheritProjectContext: false, defaultAsync: false, model: `fixture/${['judgment', 'strongest', 'review'][index]}`, thinking: 'low' } };
            pi.events.emit('pi-subagents:runtime-agent-register:v1', request);
            assert(request.result?.ok, String(request.result?.error));
            registrations.push(request.result.registration);
          }
        });
        pi.on('tool_call', event => {
          if (event.toolName !== 'subagent') return;
          assert.equal(event.input.workflow, 'parallel');
          assert.equal(event.input.model, undefined);
          assert.deepEqual(event.input.args.tasks.map(task => task.agent), seats);
          for (const task of event.input.args.tasks) assert.deepEqual(Object.keys(task).sort(), ['agent', 'task']);
        });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'parent'),
      resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
    await session.bindExtensions({ mode: 'rpc', onError: error => errors.push(error) });
    session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent']);
    session.subscribe(event => { if (event.type === 'message_end' && event.message.role === 'toolResult') results.push(event.message); });
    await session.prompt('Run the three-seat read-only review fixture; collect all reports, read the lead framework, then synthesize the verdict.');
    await session.waitForIdle();
    assert.ifError(handlerError);
    assert.deepEqual(errors, []);
    assert.equal(results.filter(result => result.toolName === 'subagent').length, 1, 'Exactly one parallel dispatch');
    assert.equal(results[0].isError ?? false, false, JSON.stringify(results[0]));
    const children = requests.filter(request => !request.parent);
    assert.equal(children.length, 12, 'Each of three children attempted write/edit, read diff, and returned evidence');
    assert.deepEqual([...new Set(children.map(request => request.input.model))].sort(), ['judgment', 'review', 'strongest']);
    for (const request of children) assert.deepEqual(request.input.tools.map(tool => tool.function.name).sort(), ['find', 'grep', 'ls', 'read']);
    const aggregate = JSON.stringify(results[0]);
    assert.equal(aggregate.split(secret).length - 1 >= 3, true, 'All reports retain file evidence');
    assert.match(session.getLastAssistantText(), /Act On: sample.js:2 DIFF_EVIDENCE_/);
    assert.match(session.getLastAssistantText(), /Agreement Map: all three/);
    assert.equal(await readFile(diffPath, 'utf8'), diff, 'Denied edit leaves diff intact');
    assert.equal(existsSync(canary), false, 'Denied write leaves no canary');
    return { status: 'passed', passed: 5, failed: 0, childRequests: children.length,
      transport: 'real Pi SDK + public pi-subagents entry + actual foreground children + local SSE fixture',
      cases: ['one parallel dispatch with all pstack seats and agent/task only', 'all children read lead-supplied main diff', 'write and edit rejected by actual child tool registry', 'evidence returned by all children', 'lead reads judgment framework after collection and synthesizes verdict'],
      limitation: 'Deterministic transport acceptance; no claim of live-model instruction adherence. Judgment/strongest shared production registration remains lead-owned.' };
  } finally {
    await disposeTestSession(session);
    for (const registration of registrations) registration.dispose();
    server.closeAllConnections();
    if (server.listening) await new Promise(accept => server.close(accept));
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const allowSkip = process.argv.includes('--allow-skip');
  console.log(JSON.stringify(await runReviewDiffFixture({ allowSkip })));
}
