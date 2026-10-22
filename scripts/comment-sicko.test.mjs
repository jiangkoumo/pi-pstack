import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { parseRoleAgent } from '../extensions/pstack/role-agents.mjs';
import { parseGitReadCommand, runGitRead } from '../extensions/pstack/git-read.mjs';
import { disposeTestSession, trackIntervals } from './test-session-lifecycle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const piPackageRoot = resolve(root, 'node_modules/@earendil-works/pi-coding-agent');

function subagentsRoot() {
  const candidates = [
    process.env.PI_SUBAGENTS_ROOT,
    resolve(process.env.HOME ?? '', '.pi/agent/npm/node_modules/pi-subagents'),
    resolve(root, 'node_modules/pi-subagents'),
  ].filter(Boolean);
  return candidates.find(path => existsSync(resolve(path, 'index.js')));
}

const SAMPLE_DIFF = [
  'diff --git a/sample.js b/sample.js',
  '--- a/sample.js',
  '+++ b/sample.js',
  '@@ -1 +1,2 @@',
  ' export const sample = 1;',
  '+// this comment exists only to be reviewed',
  '',
].join('\n');

// A background child loads ambient extensions unless the agent declares
// `extensions`. The provider below exists only as an ambient extension, which is
// exactly the shape that used to fail with `Model "..." not found`.
test('comment-sicko background child resolves a provider-extension model with thinking', { timeout: 120000 }, async t => {
  const subRoot = subagentsRoot();
  if (!subRoot || !existsSync(piPackageRoot)) {
    t.skip('pi-subagents or the Pi package is not available in this environment');
    return;
  }
  assert.equal(await existsSync(resolve(root, 'agents/comment-sicko.md')), true);

  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-comment-sicko-'));
  const agentDir = resolve(directory, 'agent');
  const cwd = resolve(directory, 'workspace');
  const providerDir = resolve(directory, 'provider-extension');
  const markerPath = resolve(directory, 'ambient-loads.jsonl');
  const tempRoot = resolve(directory, 'subagent-temp');
  const parentRequests = [];
  const childRequests = [];
  const toolResults = [];
  const errors = [];
  const registrations = [];
  const previous = {
    agentDir: process.env.PI_CODING_AGENT_DIR,
    tempRoot: process.env.PI_SUBAGENTS_TEMP_ROOT,
    piRoot: process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT,
    marker: process.env.FIXTURE_AMBIENT_MARKER,
    url: process.env.FIXTURE_PROVIDER_URL,
  };
  let session;
  const tracker = trackIntervals();
  const textOf = message => typeof message?.content === 'string'
    ? message.content
    : (message?.content ?? []).map(part => part?.type === 'text' ? part.text : '').join('');
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const isParent = Boolean(input.tools?.some(tool => tool.function?.name === 'subagent'));
    const chunk = { id: 'comment-sicko-fixture', object: 'chat.completion.chunk', created: 1, model: input.model };
    const reply = (call, content) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const delta = call
        ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${requests}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] }
        : { role: 'assistant', content };
      response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\n`);
      response.end('data: [DONE]\n\n');
    };
    let requests = parentRequests.length + childRequests.length;
    if (!isParent) {
      childRequests.push(input);
      reply(undefined, 'Yes... Ha ha ha... Yes!\nREVIEW_SAMPLE_JS:1 the added comment is meat; no edits applied.');
      return;
    }
    parentRequests.push(input);
    // The parent transcript starts with the single task message; its tool results
    // are the only tool messages in these requests.
    const stages = input.messages.filter(message => message.role === 'tool');
    if (stages.length === 0) {
      reply({ name: 'subagent', args: {
        agent: 'pstack.comment-sicko',
        task: `Review this diff for comments: ${SAMPLE_DIFF.replace(/\n/g, '\\n')}. Report findings only.`,
        async: true,
        options: { context: 'fresh', artifacts: false, timeoutMs: 90000 },
      } }, undefined);
      return;
    }
    if (stages.length === 1) {
      const runId = /Async[^\[]*\[([^\]\s]+)\]/.exec(textOf(stages[0]))?.[1];
      assert(runId, 'Background launch must return a run id: ' + textOf(stages[0]).slice(0, 500));
      reply({ name: 'bg_wait', args: { id: runId, timeoutMs: 90000 } }, undefined);
      return;
    }
    reply(undefined, 'PARENT_DONE');
  });
  try {
    await Promise.all([mkdir(agentDir), mkdir(cwd), mkdir(providerDir), mkdir(tempRoot)]);
    await writeFile(markerPath, '');
    await new Promise(accept => server.listen(0, '127.0.0.1', accept));
    const providerUrl = `http://127.0.0.1:${server.address().port}/v1`;
    await writeFile(resolve(providerDir, 'package.json'), JSON.stringify({
      name: 'comment-sicko-provider-fixture',
      version: '0.0.0',
      private: true,
      type: 'module',
      pi: { extensions: ['./index.ts'] },
    }, null, 2));
    await writeFile(resolve(providerDir, 'index.ts'), [
      "import { appendFileSync } from 'node:fs';",
      'export default function register(pi) {',
      '  appendFileSync(process.env.FIXTURE_AMBIENT_MARKER, JSON.stringify({',
      '    event: "provider_extension_loaded",',
      '    pid: process.pid,',
      '    asyncRunner: process.env.PI_ASYNC_NATIVE_RUNNER ?? null,',
      '  }) + "\\n");',
      '  pi.registerProvider("alias", {',
      '    name: "Ambient fixture provider",',
      '    baseUrl: process.env.FIXTURE_PROVIDER_URL,',
      '    api: "openai-completions",',
      '    apiKey: "fixture-only",',
      '    models: [{',
      '      id: "review",',
      '      name: "review",',
      '      reasoning: true,',
      '      input: ["text"],',
      '      contextWindow: 64000,',
      '      maxTokens: 2048,',
      '      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },',
      '    }],',
      '  });',
      '}',
      '',
    ].join('\n'));
    const settings = {
      defaultProjectTrust: 'never',
      packages: [providerDir],
      subagents: { asyncByDefault: false, intercomBridge: { mode: 'off' } },
      retry: { enabled: false },
      compaction: { enabled: false },
    };
    await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify(settings));
    await writeFile(resolve(agentDir, 'models.json'), JSON.stringify({ providers: {
      fixture: {
        baseUrl: providerUrl,
        api: 'openai-completions',
        apiKey: 'fixture-only',
        models: [{ id: 'parent', name: 'parent', reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      },
    } }));
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_SUBAGENTS_TEMP_ROOT = tempRoot;
    process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = piPackageRoot;
    process.env.FIXTURE_AMBIENT_MARKER = markerPath;
    process.env.FIXTURE_PROVIDER_URL = providerUrl;

    const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
    const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath: resolve(agentDir, 'models.json'), allowModelNetwork: false });
    const settingsManager = SettingsManager.inMemory(settings);
    const definition = parseRoleAgent(await readFile(resolve(root, 'agents/comment-sicko.md'), 'utf8'), 'pstack.comment-sicko', resolve(root, 'agents'));
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      additionalExtensionPaths: [resolve(subRoot, 'index.js'), resolve(providerDir, 'index.ts')],
      noSkills: true,
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true,
      extensionFactories: [pi => {
        pi.on('session_start', () => {
          const request = { version: 1, name: 'pstack.comment-sicko', definition: {
            ...definition,
            inheritProjectContext: false,
            defaultAsync: true,
            model: 'alias/review',
            thinking: 'high',
            // Production installs the pstack package ambient, which supplies
            // git_read to the child. This fixture has no package install, so the
            // provider of that tool is named explicitly; it does not change the
            // `extensions` key the model-resolution assertion is about.
            subagentOnlyExtensions: [resolve(root, 'extensions/pstack/index.ts')],
          } };
          pi.events.emit('pi-subagents:runtime-agent-register:v1', request);
          assert(request.result?.ok, String(request.result?.error));
          registrations.push(request.result.registration);
        });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      modelRuntime: runtime,
      model: runtime.getModel('fixture', 'parent'),
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(cwd),
    }));
    await session.bindExtensions({ mode: 'rpc', onError: error => errors.push(error) });
    session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent', 'bg_wait']);
    assert(session.getActiveToolNames().includes('subagent'));
    assert(session.getActiveToolNames().includes('bg_wait'));
    session.subscribe(event => { if (event.type === 'message_end' && event.message.role === 'toolResult') toolResults.push(event.message); });

    const markers = () => readFile(markerPath, 'utf8').then(text => text.split('\n').filter(Boolean).map(line => JSON.parse(line)));
    assert.equal((await markers()).length, 1, 'The parent session loads the provider extension once');
    await session.prompt('Run the comment-sicko provider fixture.');
    await session.waitForIdle();
    assert.deepEqual(errors, []);
    const wait = toolResults.filter(result => result.toolName === 'bg_wait').at(-1);
    assert(wait, 'Parent must wait for the background run');
    assert.equal(wait.isError ?? false, false, JSON.stringify(wait));
    const runId = /run "([^"]+)"/.exec(textOf(wait))?.[1];
    assert(runId, 'The wait result must name the run: ' + textOf(wait).slice(0, 600));
    const readJson = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; } };
    const runsRoot = resolve(tempRoot, 'async-subagent-runs');
    const resultsRoot = resolve(tempRoot, 'async-subagent-results');
    let status;
    for (const entry of await readdir(runsRoot, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const candidate = await readJson(resolve(runsRoot, entry.name, 'status.json'));
      if (candidate?.runId === runId) status = candidate;
    }
    const completion = await readJson(resolve(resultsRoot, 'completion-replay', `${runId}.json`));
    assert(status, 'The background run must write status: ' + textOf(wait).slice(0, 600));
    assert.equal(completion?.completion?.success, true, 'The background child must resolve the provider-extension model instead of failing: ' + JSON.stringify(completion ?? status).slice(0, 1200));
    assert.equal(status.state, 'complete');
    assert.equal(completion.completion.results?.[0]?.model, 'alias/review:high', 'The delivered model must keep provider and thinking');
    const childSessionFile = completion.completion.results?.[0]?.sessionFile;
    let childSession = '';
    try { childSession = await readFile(childSessionFile, 'utf8'); } catch {}
    assert.match(childSession, /REVIEW_SAMPLE_JS/, 'The child session must carry the provider result: ' + childSession.slice(-800));
    assert.equal(childRequests.length, 1, 'Exactly one child model call: ' + JSON.stringify([...childRequests.map(request => request.model)]));
    assert.equal(childRequests[0].model, 'review');
    const childTools = (childRequests[0].tools ?? []).map(tool => tool.function?.name).sort();
    assert.deepEqual(childTools, ['find', 'git_read', 'grep', 'ls', 'read'], 'The child must receive exactly the read-only allowlist, including git_read');
    assert.equal(childRequests[0].reasoning_effort, 'high', 'The configured thinking level must reach the provider request');
    const loads = await markers();
    assert.equal(loads.length, 2, 'The detached child must load the ambient provider extension: ' + JSON.stringify(loads));
    assert.notEqual(loads[1].pid, process.pid, 'The ambient load must come from the detached runner process');
    assert.ok(loads.some(load => load.asyncRunner === '1'), 'The ambient load must be the async runner child');
    assert.equal(definition.extensions, undefined, 'The generated comment-sicko must leave extensions unset so the background child loads ambient providers');
    assert.deepEqual(definition.subagentOnlyExtensions, [resolve(root, 'extensions/pstack/index.ts')]);
  } finally {
    try {
      await disposeTestSession(session);
      for (const registration of registrations) registration.dispose();
      server.closeAllConnections();
      if (server.listening) await new Promise(accept => server.close(accept));
      for (const [key, env] of [['PI_CODING_AGENT_DIR', previous.agentDir], ['PI_SUBAGENTS_TEMP_ROOT', previous.tempRoot], ['PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT', previous.piRoot], ['FIXTURE_AMBIENT_MARKER', previous.marker], ['FIXTURE_PROVIDER_URL', previous.url]]) {
        if (env === undefined) delete process.env[key];
        else process.env[key] = env;
      }
      await new Promise(accept => setTimeout(accept, 500));
      await rm(directory, { recursive: true, force: true });
    } finally {
      tracker.restore();
    }
  }
  assert.deepEqual([...tracker.live], [], `Session teardown leaked ${tracker.live.size} extension interval(s)`);
});

test('git-read rejects everything except the three whitelisted read commands', () => {
  for (const command of ['git diff', 'git log', 'git diff --stat', 'git log --oneline -n5', 'git show HEAD:src/app.js', 'git diff HEAD~1 -- src/app.js']) {
    const parsed = parseGitReadCommand(command);
    assert.equal(parsed.ok, true, command + ': ' + parsed.reason);
  }
  for (const command of [
    'git push', 'git commit -m x', 'git checkout main', 'git reset --hard', 'rm -rf /tmp/x', 'ls -la',
    'git diff --output=/tmp/x', 'git diff --output /tmp/x', 'git --no-pager log', 'git -c core.pager=cat log',
    'git log | rm -rf /', 'git log; rm -rf /', 'git diff > /tmp/x', 'git diff --ext-diff', 'git show --exec=sh',
    'git diff --no-index a b', 'git log --format=%H', 'git diff `whoami`', 'git diff $(whoami)', '',
  ]) {
    const parsed = parseGitReadCommand(command);
    assert.equal(parsed.ok, false, 'Must reject: ' + command);
    assert(parsed.reason, 'Rejection must explain itself: ' + command);
  }
});

test('git-read defaults to main...HEAD in a real repository', { timeout: 60000 }, async t => {
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-git-read-'));
  const git = args => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };
  try {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'fixture@example.com']);
    git(['config', 'user.name', 'Fixture']);
    await writeFile(resolve(directory, 'app.js'), 'export const value = 1;\n');
    git(['add', 'app.js']);
    git(['commit', '-q', '-m', 'base']);
    git(['checkout', '-q', '-b', 'feature']);
    await writeFile(resolve(directory, 'app.js'), 'export const value = 2;\n// review me\n');
    git(['add', 'app.js']);
    git(['commit', '-q', '-m', 'feature']);

    const diff = await runGitRead('git diff', { cwd: directory });
    assert.equal(diff.ok, true, diff.reason);
    assert.equal(diff.argv.join(' '), 'diff main...HEAD');
    assert.match(diff.stdout, /\+export const value = 2/);
    const log = await runGitRead('git log --oneline', { cwd: directory });
    assert.equal(log.ok, true, log.reason);
    assert.match(log.stdout, /feature/);
    const show = await runGitRead('git show --stat HEAD', { cwd: directory });
    assert.equal(show.ok, true, show.reason);
    assert.match(show.stdout, /app\.js/);
    const rejected = await runGitRead('git push', { cwd: directory });
    assert.equal(rejected.ok, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
