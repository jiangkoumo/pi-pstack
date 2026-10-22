import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkSkillReferences } from './check-skill-references.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASES_PATH = resolve(ROOT, 'scripts/routing-cases.json');
const POTETO_TEMPLATE = resolve(ROOT, 'adapters/pi/overrides/skills/poteto-mode/SKILL.md.template');
const RECALL_TEMPLATE = resolve(ROOT, 'adapters/pi/overrides/skills/recall/SKILL.md.template');
const KETCHUP_TEMPLATE = resolve(ROOT, 'adapters/pi/overrides/skills/ketchup/SKILL.md.template');
const CASES = JSON.parse(await readFile(CASES_PATH, 'utf8'));

const stripFrontmatter = text => text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
const frontmatterDescription = text => text.match(/^description: "(.*)"$/m)?.[1] ?? '';
const LIVE = process.argv.includes('--live');
const MAX_CASE_TIMEOUT_MS = 45000;

function expectedArtifact(expectation) {
  if (expectation.skill) return `skills/${expectation.skill}/SKILL.md`;
  if (expectation.playbook) return `skills/poteto-mode/playbooks/${expectation.playbook}.md`;
  return null;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function packageArtifact(path) {
  const normalized = path.replace(/\\/g, '/');
  const rel = normalized.startsWith('skills/') ? normalized : normalized.slice(normalized.indexOf('/skills/') + 1);
  return /^skills\/[a-z0-9-]+\/(?:SKILL\.md|playbooks\/[a-z0-9-]+\.md)$/.test(rel) ? rel : null;
}

function sessionPathScope(path, { workspace, sessionRoot, expectedSessionsDir }) {
  const raw = path.replace(/\\/g, '/');
  const absolute = raw.startsWith('/') ? raw : resolve(workspace, raw);
  const normalized = absolute.replace(/\\/g, '/');
  const expected = expectedSessionsDir.replace(/\\/g, '/');
  const root = sessionRoot.replace(/\\/g, '/');
  const currentSessionRoot = join(dirname(workspace), 'sessions').replace(/\\/g, '/');
  if (normalized === expected || normalized.startsWith(expected + '/')) return 'in-scope';
  // The session manager's own transcript directory is the live session, not
  // another workspace. Reading it is allowed but it is never recall evidence.
  if (normalized === currentSessionRoot || normalized.startsWith(currentSessionRoot + '/')) return 'current-session';
  // Listing the aggregate sessions directory is a cross-workspace glob.
  if (normalized === root || normalized.startsWith(root + '/')) return 'foreign-workspace';
  // Any other sessions tree, including a relative sessions/--slug--/ path, is
  // outside this fixture.
  if (normalized.includes('/sessions/') || normalized.endsWith('/sessions')) return 'foreign-workspace';
  return 'none';
}

function registerOfflineTests() {
test('routing manifest keeps its labeled reconstruction provenance and extends it to 53 cases', () => {
  assert.equal(CASES.version, 1);
  assert.equal(CASES.mode, 'on');
  assert.equal(CASES.source.kind, 'reconstructed');
  assert.match(CASES.source.note, /original 46-case list .* was not supplied/i);
  assert.match(CASES.source.note, /must not be described as one/i);
  assert.equal(CASES.cases.length, 53, 'Original 46 cases plus ketchup/sharpen additions and three Phase B formal/statechart routes');
});

test('every routing case has a unique id and a declared hit', () => {
  const ids = new Set();
  for (const item of CASES.cases) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `Invalid case id: ${item.id}`);
    assert(!ids.has(item.id), `Duplicate case id: ${item.id}`);
    ids.add(item.id);
    assert.equal(typeof item.request, 'string');
    assert(item.request.trim().length > 0, `Empty request: ${item.id}`);
    const hits = [item.expect?.skill, item.expect?.playbook].filter(Boolean);
    assert.equal(hits.length, 1, `Case must declare exactly one hit: ${item.id}`);
    assert(expectedArtifact(item.expect), `Missing expectation artifact: ${item.id}`);
  }
});

test('every declared hit resolves to a packaged skill or playbook', async () => {
  for (const item of CASES.cases) {
    const artifact = resolve(ROOT, expectedArtifact(item.expect));
    const text = await readFile(artifact, 'utf8').catch(() => null);
    assert.notEqual(text, null, `Missing routing artifact for ${item.id}: ${expectedArtifact(item.expect)}`);
  }
});

test('poteto-mode names the restored recall, tdd, sharpen, correct and automate-me routes', async () => {
  const template = await readFile(POTETO_TEMPLATE, 'utf8');
  for (const skill of ['recall', 'tdd', 'sharpen', 'correct', 'automate-me']) {
    assert(template.includes(`../${skill}/SKILL.md`), `poteto-mode must route to ${skill}`);
    assert(template.toLowerCase().includes(skill === 'automate-me' ? 'automate-me' : skill), `poteto-mode must name ${skill}`);
  }
  assert.match(template, /"what did I work on"/);
  assert.match(template, /上次我们做到哪了/);
  assert.match(template, /这周做了什么/);
  assert.match(template, /之前的会话/);
  assert.match(template, /test-first/i);
  assert.match(template, /red \/ green \/ refactor/i);
  assert.match(template, /sharpen, tighten, deepen, or rewrite a prompt/i);
  assert.match(template, /got it wrong, to correct it/i);
});

test('poteto-mode no longer keeps substitute rows or phantom skill references', async () => {
  const template = await readFile(POTETO_TEMPLATE, 'utf8');
  assert.doesNotMatch(template, /^\| automate-me \|/m);
  assert.doesNotMatch(template, /^\| recall \|/m);
  assert.doesNotMatch(template, /create-skill/);
  assert.match(template, /references\/bugbot-triage\.md/);
  assert.match(template, /The ported \[Ketchup\]\(\.\.\/ketchup\/SKILL\.md\), \[Recall\]\(\.\.\/recall\/SKILL\.md\) and \[Automate me\]/);
});

test('routing manifest keeps the original 46 cases and adds two ketchup cases', () => {
  const ketchup = CASES.cases.filter(item => item.expect.skill === 'ketchup');
  assert.equal(ketchup.length, 2, 'Issue #20 adds two current-conversation ketchup cases');
  for (const item of ketchup) {
    assert.equal(item.category, 'skill', `ketchup case must be a skill hit: ${item.id}`);
    assert.match(item.request, /this conversation|总结一下这次对话/, `ketchup case must name this conversation: ${item.id}`);
  }
  assert.equal(CASES.cases.filter(item => item.expect.skill === 'recall').length, 4, 'Keep the four past-session recall cases');
  for (const id of ['sk-tdd-tdd', 'sk-sharpen-rewrite']) {
    assert(CASES.cases.some(item => item.id === id), `Keep the original case: ${id}`);
  }
  assert.equal(CASES.cases.length, 53, 'Keep the original 50 cases and add three Phase B formal/statechart routes');
});

test('formal creation, maintenance and statechart each have an explicit bundled route', async () => {
  const text = await readFile(POTETO_TEMPLATE, 'utf8');
  for (const name of ['create-formal-verification-skill', 'maintain-formal-verification-skill', 'statechart']) {
    assert(CASES.cases.some(item => item.expect.skill === name));
    assert(text.includes(`../${name}/SKILL.md`));
  }
});

test('sharpen cases exercise the deepened-then-rewritten reversal from Issue #24', async () => {
  const sharpen = CASES.cases.filter(item => item.expect.skill === 'sharpen');
  assert.equal(sharpen.length, 4, 'Keep the two original sharpen cases and add the two Issue #24 reversal cases');
  for (const item of sharpen) {
    assert.equal(item.category, 'sharpen', `sharpen case must declare the sharpen category: ${item.id}`);
  }
  for (const id of ['sk-sharpen-prompt', 'sk-sharpen-rewrite']) {
    assert.ok(sharpen.some(item => item.id === id), `Keep the original case: ${id}`);
  }

  const deepen = sharpen.find(item => item.id === 'sk-sharpen-deepen');
  assert.ok(deepen, 'Issue #24 must add a deepen-not-enlarge case');
  assert.match(deepen.request, /deeper, not bigger/i, 'The reversal case must ask for a deeper task, not a bigger one');
  assert.match(deepen.request, /rewritten prompt/i, 'The reversal case must ask for the rewritten prompt');

  const deepenZh = sharpen.find(item => item.id === 'sk-sharpen-deepen-zh');
  assert.ok(deepenZh, 'Issue #24 must add a Chinese deepen/rewrite case');
  assert.match(deepenZh.request, /加深/);
  assert.match(deepenZh.request, /重写/);

  // The cases above are only reachable if the shipped trigger text carries the
  // same vocabulary; keep them grounded instead of inventing intents.
  const shipped = await readFile(resolve(ROOT, 'skills/sharpen/SKILL.md'), 'utf8');
  const description = frontmatterDescription(shipped);
  assert.match(description, /deeper, not bigger/i, 'shipped description must state deepen-not-enlarge');
  assert.match(description, /then rewrite the prompt/i, 'shipped description must state the rewritten prompt is returned');
  assert.doesNotMatch(shipped, /Don't hand back a rewritten prompt/i, 'the pre-reversal behavior must be gone from the shipped body');
});

test('ketchup template keeps the pinned body and scopes itself to this chat', async () => {
  const [template, upstream] = await Promise.all([
    readFile(KETCHUP_TEMPLATE, 'utf8'),
    readFile(resolve(ROOT, 'upstream/pstack/skills/ketchup/SKILL.md'), 'utf8'),
  ]);
  assert.equal(stripFrontmatter(template), stripFrontmatter(upstream), 'ketchup body must stay identical to the pinned upstream body');
  const description = frontmatterDescription(template);
  assert.match(description, /catch me up on this conversation/i);
  assert.match(description, /总结一下这次对话/);
  assert.match(description, /past sessions|earlier days|another session id/i);
  assert.match(description, /ketchup, not recall|not recall/i);
});

test('recall description defers this conversation to ketchup and stays on past sessions', async () => {
  const template = await readFile(RECALL_TEMPLATE, 'utf8');
  const description = frontmatterDescription(template);
  assert.match(description, /ketchup/);
  assert.match(description, /this conversation|this chat/i);
  assert.match(description, /past sessions|earlier sessions|earlier days|past work/i);
});

test('poteto-mode routes this-chat catch-up to ketchup and past sessions to recall', async () => {
  const template = await readFile(POTETO_TEMPLATE, 'utf8');
  assert(template.includes('../ketchup/SKILL.md'), 'poteto-mode must link the ketchup skill');
  const routingLines = template.split('\n').filter(line => line.startsWith('- '));
  const ketchupLine = routingLines.find(line => line.includes('**ketchup** skill'));
  assert(ketchupLine, 'poteto-mode must add a ketchup route');
  assert.match(ketchupLine, /this conversation|this chat/i);
  assert.match(ketchupLine, /总结一下这次对话/);
  const recallLine = routingLines.find(line => line.includes('**recall** skill'));
  assert(recallLine, 'poteto-mode must keep a recall route');
  assert.match(recallLine, /past sessions|earlier days|another session id/i);
  assert.doesNotMatch(recallLine, /catch up/i);
});

test('skill reference checker fails unknown links and phantom skills, passes real reference files', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'pstack-skill-refs-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const templateDir = join(fixture, 'adapters/pi/overrides/skills/demo');
  await mkdir(templateDir, { recursive: true });
  await mkdir(join(fixture, 'skills/demo'), { recursive: true });
  await mkdir(join(fixture, 'skills/real'), { recursive: true });
  await mkdir(join(fixture, 'skills/demo/references'), { recursive: true });
  await writeFile(join(fixture, 'skills/real/SKILL.md'), '# Real\n');
  await writeFile(join(fixture, 'skills/demo/references/bugbot-triage.md'), '# Real reference\n');
  await writeFile(join(fixture, 'skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(templateDir, 'SKILL.md.template'), [
    '---',
    'name: demo',
    'description: demo',
    '---',
    '',
    '- Good: [real](../real/SKILL.md) and [reference](references/bugbot-triage.md).',
    '- Bad: [ghost](../ghost/SKILL.md) and `/skill:ghost`.',
    '- Bad: **create-skill**.',
  ].join('\n'));

  const result = await checkSkillReferences(fixture);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /Missing local link target/);
  assert.match(JSON.stringify(result.errors), /Unknown skill reference/);
  assert.match(JSON.stringify(result.errors), /Phantom skill reference/);
  assert(result.errors.some(error => error.target === 'references/bugbot-triage.md') === false, 'A real reference file must not be reported');
});

test('routing cases are explicit-only and do not depend on auto-invocation', async () => {
  for (const item of CASES.cases.filter(entry => entry.expect.skill)) {
    const artifact = expectedArtifact(item.expect);
    const text = await readFile(resolve(ROOT, artifact), 'utf8');
    assert.match(text, /^disable-model-invocation: true$/m, `${artifact} must stay explicit-only`);
  }
});
}

// ---------------------------------------------------------------------------
// Live mode-on routing: `node scripts/routing.test.mjs --live [--cases id,id]`
// ---------------------------------------------------------------------------

function workspaceSlug(cwd) {
  return `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
}

function readOnlyCredentialStore(authPath) {
  let cache;
  const load = async () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(authPath, 'utf8'));
    } catch {
      cache = {};
    }
    return cache;
  };
  return {
    read: async providerId => (await load())[providerId],
    list: async () => Object.entries(await load()).map(([providerId, credential]) => ({ providerId, type: credential?.type ?? 'api_key' })),
    modify: async () => { throw new Error('Read-only credential store: refusing to mutate operator credentials'); },
    delete: async () => { throw new Error('Read-only credential store: refusing to mutate operator credentials'); },
  };
}

async function writeSessionFixture(sessionDir, cwd, id, lines) {
  await mkdir(sessionDir, { recursive: true });
  const path = join(sessionDir, `2026-10-20T09-00-00-000Z_${id}.jsonl`);
  const entries = [
    { type: 'session', version: 3, id, timestamp: '2026-10-20T09:00:00.000Z', cwd },
    ...lines.map((content, index) => ({
      type: 'message',
      id: `m${index + 1}`,
      parentId: index === 0 ? null : `m${index}`,
      timestamp: `2026-10-20T09:00:0${index + 1}.000Z`,
      message: { role: index % 2 === 0 ? 'user' : 'assistant', content, timestamp: 1 },
    })),
  ];
  await writeFile(path, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  return path;
}

async function prepareWorkspace(caseItem, agentDir, workspace) {
  await mkdir(join(workspace, 'src'), { recursive: true });
  await mkdir(join(workspace, 'test'), { recursive: true });
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ name: 'routing-fixture', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }, null, 2));
  await writeFile(join(workspace, 'README.md'), '# Routing fixture\n\nA small app used only to observe pstack routing.\n');
  await writeFile(join(workspace, 'src/router.js'), 'export function route(request) {\n  return request.startsWith("fix ") ? "bug-fix" : "feature";\n}\n');
  await writeFile(join(workspace, 'test/router.test.mjs'), 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { route } from "../src/router.js";\n\ntest("routes fixes", () => assert.equal(route("fix it"), "bug-fix"));\n');
  if (caseItem.category === 'recall') {
    await writeSessionFixture(join(agentDir, 'sessions', workspaceSlug(workspace)), workspace, '11111111-1111-1111-1111-111111111111', [
      'Investigate why recall reads the wrong workspace sessions.',
      'Found the slug comes from cwd and the current session is excluded. Open thread: verify mtime ordering.',
    ]);
    await writeSessionFixture(join(agentDir, 'sessions', workspaceSlug(workspace)), workspace, '22222222-2222-2222-2222-222222222222', [
      'Fix the routing table so sharpen and tdd are reachable.',
      'Routing rows added; still need a live mode-on check for recall.',
    ]);
  }
}

async function prepareGeneratedPackage() {
  const copyRoot = await mkdtemp(resolve(tmpdir(), 'pstack-routing-package-'));
  try {
    const generatedRoot = join(copyRoot, 'package');
    await cp(ROOT, generatedRoot, {
      recursive: true,
      filter(source) {
        const rel = relative(ROOT, source);
        return rel === '' || !/^(node_modules|\.git|\.herdr)(\/|$)/.test(rel);
      },
    });
    // The live run must observe freshly generated resources, never a stale
    // working-tree skills/ or agents/ directory.
    await rm(join(generatedRoot, 'skills'), { recursive: true, force: true });
    await rm(join(generatedRoot, 'agents'), { recursive: true, force: true });
    try {
      await execFileAsync(process.execPath, ['scripts/generate-pi-resources.mjs'], {
        cwd: generatedRoot,
        env: { ...process.env, PI_CODING_AGENT_DIR: join(copyRoot, 'generator-agent') },
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(`Generator failed in temporary copy: ${String(error.stderr ?? error.message).slice(-2000)}`);
    }
    await readFile(join(generatedRoot, 'skills/poteto-mode/SKILL.md'), 'utf8');
    return { copyRoot, generatedRoot };
  } catch (error) {
    await rm(copyRoot, { recursive: true, force: true });
    throw error;
  }
}

async function closeSession(session) {
  if (!session) return;
  let timer;
  try {
    await Promise.race([
      session.extensionRunner?.emit({ type: 'session_shutdown', reason: 'quit' }) ?? Promise.resolve(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('session shutdown timed out')), 5000); }),
    ]);
  } catch {
    // A timed-out or failed shutdown must not skip dispose.
  } finally {
    clearTimeout(timer);
  }
  try {
    session.dispose();
  } catch {
    // Disposal is best-effort after the shutdown event.
  }
}

function parseLiveArgs(argv) {
  const value = flag => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    provider: value('--provider') ?? 'magpie',
    model: value('--model') ?? 'opendesign/deepseek-v4.1-flash',
    cases: value('--cases')?.split(',').map(id => id.trim()).filter(Boolean),
    limit: value('--limit') ? Number(value('--limit')) : undefined,
    out: value('--out'),
    timeoutMs: Math.min(Number(value('--timeout-ms')) || MAX_CASE_TIMEOUT_MS, MAX_CASE_TIMEOUT_MS),
    keep: argv.includes('--keep'),
  };
}

async function runLive(argv) {
  const options = parseLiveArgs(argv);
  const pi = await import('@earendil-works/pi-coding-agent');
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, getAgentDir } = pi;

  const realAgentDir = getAgentDir();
  const modelsPath = resolve(realAgentDir, 'models.json');
  const authPath = resolve(realAgentDir, 'auth.json');
  const runtime = await ModelRuntime.create({
    credentials: readOnlyCredentialStore(authPath),
    modelsPath,
    allowModelNetwork: false,
  });
  const model = runtime.getModel(options.provider, options.model);
  if (!model) {
    console.error(JSON.stringify({ status: 'failed', reason: 'Model not found', provider: options.provider, model: options.model, modelsPath }));
    process.exitCode = 2;
    return;
  }

  let cases = CASES.cases;
  if (options.cases?.length) {
    const known = new Set(CASES.cases.map(item => item.id));
    for (const id of options.cases) assert(known.has(id), `Unknown routing case: ${id}`);
    cases = CASES.cases.filter(item => options.cases.includes(item.id));
  }
  if (options.limit) cases = cases.slice(0, options.limit);

  const generated = await prepareGeneratedPackage();
  const generatedRoot = generated.generatedRoot;
  const root = await mkdtemp(resolve(tmpdir(), 'pstack-routing-live-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const previousHome = process.env.HOME;
  const settings = SettingsManager.inMemory({
    defaultProjectTrust: 'always',
    compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1024 },
    retry: { enabled: false },
  });
  const results = [];

  try {
    for (const [index, item] of cases.entries()) {
      const started = Date.now();
      const caseRoot = join(root, `case-${index}`);
      const workspace = join(caseRoot, 'workspace');
      const home = join(caseRoot, 'home');
      const agentDir = join(home, '.pi', 'agent');
      const artifact = expectedArtifact(item.expect);
      let session;
      let result;

      try {
        await mkdir(agentDir, { recursive: true });
        // The extension and recall both resolve the agent directory from this
        // process environment. Keep HOME and PI_CODING_AGENT_DIR on the same
        // fixture so a `~/.pi/agent` guess cannot reach the operator's data.
        process.env.HOME = home;
        process.env.PI_CODING_AGENT_DIR = agentDir;
        await prepareWorkspace(item, agentDir, workspace);

        const loader = new DefaultResourceLoader({
          cwd: workspace,
          agentDir,
          settingsManager: settings,
          noExtensions: true,
          additionalExtensionPaths: [generatedRoot],
          noContextFiles: true,
          noPromptTemplates: true,
          noThemes: true,
        });
        await loader.reload();
        assert.deepEqual(loader.getExtensions().errors, [], `Extension load errors for ${item.id}`);

        const manager = SessionManager.create(workspace, join(caseRoot, 'sessions'));
        // Context turns are fixture history, not measured routing turns.
        for (const entry of item.context ?? []) manager.appendMessage({ role: entry.role, content: entry.content, timestamp: Date.now() });
        ({ session } = await createAgentSession({
          cwd: workspace,
          agentDir,
          settingsManager: settings,
          modelRuntime: runtime,
          model,
          resourceLoader: loader,
          sessionManager: manager,
          tools: ['read', 'grep', 'find', 'ls'],
          sessionStartEvent: { type: 'session_start', reason: 'startup' },
        }));
        const extensionErrors = [];
        await session.bindExtensions({ mode: 'rpc', onError: error => extensionErrors.push(String(error?.message ?? error)) });

        const attempted = [];
        const successfulReads = [];
        const sessionEvidence = [];
        const sessionViolations = [];
        const currentSessionReads = [];
        const readOrder = [];
        const pendingReads = new Map();
        const texts = [];
        const isRecall = item.category === 'recall';
        const sessionRoot = join(agentDir, 'sessions');
        const expectedSessionsDir = join(sessionRoot, workspaceSlug(workspace));
        let sequence = 0;
        let skillHit = false;
        let sessionHit = false;
        let foreignSessionAttempt = false;
        let currentSessionAttempt = false;
        let firstSkillRead = null;
        let firstSessionRead = null;
        let firstExpectedRead = null;
        let aborted = false;
        const abortOnce = () => {
          if (aborted) return;
          aborted = true;
          void session.abort().catch(() => {});
        };
        const observeSessionPath = (path, successful, tool) => {
          const scope = sessionPathScope(path, { workspace, sessionRoot, expectedSessionsDir });
          if (scope === 'foreign-workspace') {
            foreignSessionAttempt = true;
            sessionViolations.push({ tool, path, scope });
            abortOnce();
          } else if (scope === 'current-session' && successful) {
            currentSessionAttempt = true;
            currentSessionReads.push(path);
          } else if (successful && scope === 'in-scope') {
            sessionEvidence.push(path);
            sessionHit = true;
            if (isRecall && skillHit) abortOnce();
          }
          return scope;
        };

        session.subscribe(event => {
          if (event.type === 'tool_execution_start') {
            const args = event.args ?? {};
            for (const value of [args.path, args.file_path]) {
              if (typeof value === 'string') {
                attempted.push(value);
                observeSessionPath(value, false, event.toolName);
              }
            }
            if (typeof args.pattern === 'string') {
              attempted.push(args.pattern);
              // A find/grep pattern can widen a non-sessions path into another
              // workspace. Classify it when it names a sessions tree explicitly.
              if (args.pattern.includes('sessions/') || args.pattern.includes('/sessions')) {
                observeSessionPath(args.pattern, false, event.toolName);
              }
            }
            if (event.toolName === 'read' && typeof args.path === 'string') pendingReads.set(event.toolCallId, args.path);
          } else if (event.type === 'tool_execution_end' && event.toolName === 'read') {
            const path = pendingReads.get(event.toolCallId);
            pendingReads.delete(event.toolCallId);
            if (!event.isError && typeof path === 'string') {
              sequence += 1;
              successfulReads.push(path);
              const normalized = path.replace(/\\/g, '/');
              const artifactRead = normalized === artifact || normalized.endsWith('/' + artifact);
              const scope = observeSessionPath(path, true, event.toolName);
              const artifactPath = packageArtifact(path);
              readOrder.push({
                seq: sequence,
                tool: event.toolName,
                path,
                kind: artifactRead ? 'expected-skill' : artifactPath ? 'skill' : scope === 'in-scope' ? 'session' : 'other',
              });
              if (artifactPath && !firstSkillRead) firstSkillRead = { seq: sequence, path: artifactPath };
              if (artifactRead && !firstExpectedRead) firstExpectedRead = { seq: sequence, path };
              if (scope === 'in-scope' && !firstSessionRead) firstSessionRead = { seq: sequence, path };
              if (artifactRead) {
                skillHit = true;
                if (!isRecall) abortOnce();
              }
            }
          } else if (event.type === 'message_end' && event.message?.role === 'assistant') {
            const content = event.message.content;
            if (typeof content === 'string') texts.push(content);
            else if (Array.isArray(content)) for (const block of content) if (block.type === 'text') texts.push(block.text);
          }
        });

        await session.prompt('/poteto-mode on');
        const mode = manager.getBranch().filter(entry => entry.customType === 'pstack.mode.v1').at(-1)?.data;

        let promptError;
        let timer;
        try {
          await Promise.race([
            session.prompt(item.request),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${options.timeoutMs}ms`)), options.timeoutMs); }),
          ]);
        } catch (error) {
          promptError = error;
          if (!aborted) await withTimeout(session.abort(), 5000, 'abort');
        } finally {
          clearTimeout(timer);
        }

        const selected = [...new Set(successfulReads.map(packageArtifact).filter(Boolean))];
        const skillBeforeSession = firstExpectedRead && firstSessionRead ? firstExpectedRead.seq < firstSessionRead.seq : null;
        const routingHit = isRecall ? skillHit && sessionHit : skillHit;
        const passed = routingHit && !foreignSessionAttempt && mode?.enabled === true && (!isRecall || skillBeforeSession === true);
        result = {
          id: item.id,
          request: item.request,
          expected: item.expect,
          expectedArtifact: artifact,
          passed,
          modeOn: mode?.enabled === true,
          hit: routingHit,
          skillHit,
          ...(isRecall ? { sessionHit, foreignSessionAttempt, currentSessionAttempt, sessionEvidence: [...new Set(sessionEvidence)], sessionViolations, currentSessionReads: [...new Set(currentSessionReads)] } : { foreignSessionAttempt, sessionViolations }),
          skillBeforeSession,
          firstSkillRead,
          firstExpectedRead,
          firstSessionRead,
          readOrder,
          promptError: promptError ? String(promptError?.message ?? promptError) : undefined,
          selected,
          routingLayer: 'mode-on routing-only: selected skills/playbooks and, for recall, read the current-cwd session fixture; this is not a full workflow run',
          attemptedReads: [...new Set(attempted)],
          successfulReads: [...new Set(successfulReads)],
          extensionErrors,
          reply: (texts.at(-1) ?? '').slice(0, 500),
          durationMs: Date.now() - started,
        };
      } catch (error) {
        result = {
          id: item.id,
          request: item.request,
          expected: item.expect,
          expectedArtifact: artifact,
          passed: false,
          modeOn: false,
          hit: false,
          reason: String(error?.message ?? error),
          selected: [],
          durationMs: Date.now() - started,
        };
      } finally {
        await closeSession(session);
        if (!options.keep) await rm(caseRoot, { recursive: true, force: true });
        process.env.PI_CODING_AGENT_DIR = previousAgentDir;
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
        console.error(JSON.stringify({ case: item.id, passed: result.passed, selected: result.selected, durationMs: result.durationMs }));
      }
      results.push(result);
    }
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (!options.keep) {
      await rm(root, { recursive: true, force: true });
      await rm(generated.copyRoot, { recursive: true, force: true });
    }
  }

  const passed = results.filter(result => result.passed).length;
  const report = {
    status: passed === results.length && results.length > 0 ? 'passed' : 'failed',
    model: `${model.provider}/${model.id}`,
    mode: 'on',
    generatedResources: 'fresh temporary copy',
    source: CASES.source,
    cases: results,
    passed,
    failed: results.length - passed,
  };
  const text = JSON.stringify(report, null, 2);
  if (options.out) await writeFile(options.out, text + '\n');
  else console.log(text);
  if (report.status !== 'passed') process.exitCode = 1;
}

if (LIVE) {
  await runLive(process.argv.slice(2));
} else {
  registerOfflineTests();
}
