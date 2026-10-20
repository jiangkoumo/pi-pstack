import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// P3 experiment: concurrent writer isolation and the writer review gate.
//
// What this check actually does:
// - Builds a throwaway clean Git fixture (git init/add/commit inside the fixture only;
//   this worktree is never committed).
// - Installs the package tarball into a temp consumer project, then loads the real
//   installed Pi host (PI_PSTACK_PI_ROOT) with the installed pi-subagents extension.
// - One parent session launches two pstack.poteto-agent children in the same turn with
//   async:true. Scenario 1 uses worktree:true (managed worktrees); scenario 2 uses
//   worktree:false (shared cwd) on purpose, to observe whether the host refuses.
// - A local OpenAI-compatible fixture provider scripts both children. A server-side
//   barrier holds each child until both have written their identically named file, so the
//   concurrent window is real and the follow-up read is ordered after both writes.
//
// What it does NOT claim: background OS process isolation details, external models,
// crash recovery, or that comment-sicko is a general reviewer.

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
const subRoot = process.env.PI_SUBAGENTS_ROOT || resolve(getAgentDir(), 'npm/node_modules/pi-subagents');
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed pi-coding-agent package root');

const directory = await mkdtemp(resolve(tmpdir(), 'pstack-p3-worktrees-'));
const agentDir = resolve(directory, 'agent');
const cwd = resolve(directory, 'consumer');
const worktreeBase = resolve(directory, 'worktrees');
const installDir = resolve(directory, 'package');
const subagentTempRoot = resolve(directory, 'subagents-temp');
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_SUBAGENTS_TEMP_ROOT = subagentTempRoot;
// Detached async children resolve the host package from argv/PI env; this SDK harness runs a script,
// so name the installed host explicitly (same override pi-subagents documents for wrapper installs).
process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = piRoot;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;

const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));

const markerFor = name => `P3_WT_${name}`;
const fileFor = prefix => (prefix === 'LANE' ? 'lane.txt' : 'shared.txt');

const requests = [];
const childRequests = [];
const results = [];
const errors = [];
let wakeCount = 0;
const WAKE_PATTERN = /Inspect subagent updates above|Background task completed/;

let session;
let scenario = null;
let barrier;
const launchedScenarios = new Set();
let worktreeBaseReal;

function samePath(left, right) {
  if (left === right) return true;
  try { return realpathSync(left) === realpathSync(right); } catch { return false; }
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => (typeof part === 'string' ? part : part?.text ?? JSON.stringify(part))).join('\n');
  return JSON.stringify(content ?? '');
}
function toolResultsOf(input) {
  const lastAssistant = input.messages.findLastIndex(message => message.role === 'assistant');
  return input.messages.slice(lastAssistant + 1).filter(message => message.role === 'tool');
}
function assistantTurnsOf(input) {
  return input.messages.filter(message => message.role === 'assistant').length;
}
function promptText(input) {
  return input.messages.map(messageText).join('\n');
}
function laneOf(input) {
  const match = promptText(input).match(/P3_WT_(LANE|SHARED)_([AB])/);
  return match ? { prefix: match[1], lane: match[2] } : null;
}
function criterionIds(input) {
  const text = promptText(input);
  const start = text.indexOf('criteriaSatisfied');
  if (start < 0) return [];
  const end = text.indexOf('changedFiles', start);
  const slice = text.slice(start, end > start ? end : start + 1200);
  return [...slice.matchAll(/"id":\s*"([^"]+)"/g)].map(match => match[1]);
}
function acceptanceReport(input, lane) {
  const ids = criterionIds(input);
  const file = fileFor(laneOf(input)?.prefix ?? 'LANE');
  return {
    criteriaSatisfied: ids.map(id => ({ id, status: 'satisfied', evidence: `fixture lane ${lane} satisfied ${id}` })),
    changedFiles: [file],
    testsAddedOrUpdated: [],
    commandsRun: [{ command: 'pwd', result: 'passed', summary: `fixture pwd in lane ${lane}` }],
    validationOutput: [`lane ${lane} read-back matched its own marker`],
    residualRisks: ['synthetic fixture lane only'],
    noStagedFiles: true,
    diffSummary: `adds ${file} in lane ${lane}`,
    reviewFindings: ['no blockers (fixture lane)'],
    manualNotes: `fixture writer lane ${lane}`,
  };
}
function sse(response, model, delta, finishReason) {
  const base = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model };
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
}

function resetBarrier(label, expected) {
  barrier = {
    label,
    expected,
    arrivals: new Map(),
    released: false,
    resolvedAt: null,
    worktreeListing: null,
    entries: [],
    gitStatusAtBarrier: null,
  };
}
function snapshotWorktrees() {
  const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' });
  const entries = listing.split('\n').filter(line => line.startsWith('worktree ')).map(line => {
    const path = line.slice('worktree '.length);
    const exists = (() => { try { return realpathSync(path); } catch { return undefined; } })();
    return { path, real: exists ?? path, isSource: samePath(path, cwd) };
  });
  return { listing, entries };
}
function arriveAtBarrier(laneTag) {
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error(`Barrier ${barrier?.label} timed out waiting for both children`)), 60000);
    barrier.arrivals.set(laneTag, { at: Date.now(), accept: () => { clearTimeout(timer); accept(); } });
    if (barrier.arrivals.size >= barrier.expected && !barrier.released) {
      barrier.released = true;
      barrier.resolvedAt = Date.now();
      const snapshot = snapshotWorktrees();
      barrier.worktreeListing = snapshot.listing;
      barrier.entries = snapshot.entries;
      barrier.gitStatusAtBarrier = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
      for (const arrival of barrier.arrivals.values()) arrival.accept();
    }
  });
}

function parentCalls(input, userText) {
  if (WAKE_PATTERN.test(userText)) return null; // native completion turn: plain final text
  if (scenario === null || launchedScenarios.has(scenario)) return null;
  const lastUserIndex = input.messages.findLastIndex(message => message.role === 'user');
  const toolResultsAfterUser = input.messages.slice(lastUserIndex + 1).filter(message => message.role === 'tool');
  if (toolResultsAfterUser.length >= 2) return null; // launch results already returned
  launchedScenarios.add(scenario);
  if (scenario === 'worktree') {
    return [1, 2].map(index => ({
      name: 'subagent',
      args: {
        agent: 'pstack.poteto-agent',
        task: `P3_WT_LANE_${index === 1 ? 'A' : 'B'}: fixture writer task. Work only in your current working directory; the fixture provider scripts the steps. Report blockers in your final output.`,
        async: true,
        worktree: true,
        options: { context: 'fresh', timeoutMs: 60000 },
      },
    }));
  }
  if (scenario === 'shared') {
    return [1, 2].map(index => ({
      name: 'subagent',
      args: {
        agent: 'pstack.poteto-agent',
        task: `P3_WT_SHARED_${index === 1 ? 'A' : 'B'}: fixture writer task in the shared cwd. The fixture provider scripts the steps. Report blockers in your final output.`,
        async: true,
        worktree: false,
        options: { context: 'fresh', timeoutMs: 60000 },
      },
    }));
  }
  return null;
}

function childCalls(input, tag, prefix) {
  const turns = input.messages.filter(message => message.role === 'assistant').length;
  const file = fileFor(prefix);
  if (turns === 0) {
    return [
      { name: 'bash', args: { command: 'pwd' } },
      { name: 'read', args: { path: file } },
      { name: 'write', args: { path: file, content: markerFor(tag) } },
    ];
  }
  if (turns === 1) return 'barrier';
  return null;
}

const server = createServer(async (request, response) => {
  try {
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const isParent = Array.isArray(input.tools) && input.tools.some(tool => tool.function?.name === 'subagent');
    const lastUser = [...input.messages].reverse().find(message => message.role === 'user');
    const lastUserText = messageText(lastUser);

    if (isParent) {
      requests.push(input);
      if (process.env.P3_WT_DEBUG) console.error(`[parent] model=${input.model} msgs=${input.messages.length} last=${JSON.stringify(lastUserText.slice(0, 120))}`);
      if (WAKE_PATTERN.test(lastUserText)) wakeCount += 1;
      const calls = parentCalls(input, lastUserText);
      if (calls) {
        return sse(response, input.model, {
          role: 'assistant',
          tool_calls: calls.map((call, index) => ({ index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })),
        }, 'tool_calls');
      }
      return sse(response, input.model, { role: 'assistant', content: 'P3_WT_HOST_TURN_DONE' }, 'stop');
    }

    childRequests.push(input);
    const lane = laneOf(input);
    if (process.env.P3_WT_DEBUG) console.error(`[child] model=${input.model} turns=${assistantTurnsOf(input)} lane=${lane ? lane.prefix + '_' + lane.lane : 'none'}`);
    if (!lane) return sse(response, input.model, { role: 'assistant', content: 'P3_WT_CHILD_UNKNOWN_LANE' }, 'stop');
    const tag = `${lane.prefix}_${lane.lane}`;
    const calls = childCalls(input, tag, lane.prefix);
    if (calls === 'barrier') {
      await arriveAtBarrier(tag);
      return sse(response, input.model, { role: 'assistant', tool_calls: [
        { index: 0, id: 'call_read_after', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: fileFor(lane.prefix) }) } },
        { index: 1, id: 'call_status_after', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'git status --porcelain' }) } },
      ] }, 'tool_calls');
    }
    if (calls) {
      return sse(response, input.model, {
        role: 'assistant',
        tool_calls: calls.map((call, index) => ({ index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })),
      }, 'tool_calls');
    }
    const report = acceptanceReport(input, tag);
    const content = [
      `P3_WT_DONE ${tag} file=${fileFor(lane.prefix)} marker=${markerFor(tag)}`,
      '',
      '```acceptance-report',
      JSON.stringify(report, null, 2),
      '```',
    ].join('\n');
    return sse(response, input.model, { role: 'assistant', content }, 'stop');
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: String(error) } }));
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));

const sleep = ms => new Promise(accept => setTimeout(accept, ms));

async function waitFor(predicate, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function acceptanceOf(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return undefined;
  if (node.reviewResult || (node.evidenceStatus && node.status)) return node;
  for (const value of Object.values(node)) {
    const found = acceptanceOf(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function asyncRuns() {
  const asyncRoot = resolve(subagentTempRoot, 'async-subagent-runs');
  let names = [];
  try { names = await readdir(asyncRoot); } catch { return []; }
  const runs = [];
  for (const name of names) {
    const statusPath = resolve(asyncRoot, name, 'status.json');
    let status;
    try { status = JSON.parse(await readFile(statusPath, 'utf8')); } catch { continue; }
    runs.push({ name, asyncDir: resolve(asyncRoot, name), status, acceptance: acceptanceOf(status) });
  }
  return runs;
}

async function settleScenario(minAcceptanceRuns, label) {
  await waitFor(async () => {
    const runs = await asyncRuns();
    return runs.filter(run => run.acceptance).length >= minAcceptanceRuns && session.isIdle && wakeCount >= 1;
  }, label, 60000);
  // Native completion notices may arrive batched or one per child; wait for a quiet window.
  let seen = -1;
  while (seen !== requests.length + childRequests.length) {
    seen = requests.length + childRequests.length;
    await sleep(1200);
    await session.waitForIdle();
  }
}

async function worktreeEvidence() {
  return execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' })
    .split('\n').filter(line => line.startsWith('worktree ')).length;
}



let summary;
try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await mkdir(worktreeBase, { recursive: true });
  worktreeBaseReal = realpathSync(worktreeBase);
  await mkdir(resolve(agentDir, 'extensions/subagent'), { recursive: true });

  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }))[0];
  await mkdir(installDir, { recursive: true });
  execFileSync('tar', ['-xzf', resolve(directory, pack.filename), '-C', installDir, '--strip-components=1']);

  // Clean Git fixture baseline. The fixture repo only ever receives this one commit.
  await writeFile(resolve(cwd, 'base.txt'), 'BASELINE\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd });
  execFileSync('git', ['config', 'user.name', 'fixture'], { cwd });
  execFileSync('git', ['add', 'base.txt'], { cwd });
  execFileSync('git', ['commit', '-q', '-m', 'fixture baseline'], { cwd });
  const baselineHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({
    packages: [installDir],
    subagents: { asyncByDefault: false },
    retry: { enabled: false },
  }));
  await writeFile(resolve(agentDir, 'extensions/subagent/config.json'), JSON.stringify({
    asyncByDefault: false,
    worktreeBaseDir: worktreeBase,
    worktreeProvider: 'native',
  }));
  await writeFile(resolve(agentDir, 'models.json'), JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        api: 'openai-completions',
        apiKey: 'fixture-only',
        models: ['parent', 'writer'].map(id => ({
          id, name: id, reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 2048,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      },
    },
  }));
  // `code` role for pstack.poteto-agent: proves the role mapping reaches the real child.
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({
    version: 1,
    roles: { code: { model: 'fixture/writer', thinking: 'low' } },
  }));

  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath: resolve(agentDir, 'models.json'), allowModelNetwork: false });
  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: 'never',
    packages: [installDir],
    subagents: { asyncByDefault: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [resolve(subRoot, 'index.js'), resolve(installDir, 'extensions/pstack/index.ts')],
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);

  ({ session } = await createAgentSession({
    cwd, agentDir, modelRuntime: runtime,
    model: runtime.getModel('fixture', 'parent'),
    settingsManager, resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd),
  }));
  await session.bindExtensions({ mode: 'rpc', onError: error => errors.push(error) });
  session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent']);
  assert(session.getActiveToolNames().includes('subagent'), 'Host must expose the subagent tool');
  session.subscribe(event => { if (event.type === 'message_end' && event.message.role === 'toolResult') results.push(event.message); });

  // ---- Scenario 1: two concurrent writers in two managed worktrees ----
  scenario = 'worktree';
  wakeCount = 0;
  resetBarrier('worktree', 2);
  const childStart = childRequests.length;
  await session.prompt('Run P3_WT_WORKTREE');
  await waitFor(async () => barrier.released, 'both worktree children to reach the barrier');
  const launchResults = results.filter(result => result.toolName === 'subagent');
  assert(launchResults.length >= 2, 'Both writer launches must return tool results');
  assert(launchResults.every(result => !result.isError), JSON.stringify(launchResults));
  await settleScenario(2, 'both async writer runs to settle with acceptance ledgers');
  const worktreeWakes = wakeCount;
  const worktreeAfterRun = await worktreeEvidence();

  const worktreeBarrierListing = barrier.worktreeListing;
  const worktreeBarrierEntries = barrier.entries;
  const worktreeBarrierStatus = barrier.gitStatusAtBarrier;
  const worktreeChildren = childRequests.slice(childStart);
  assert.ok(worktreeChildren.length >= 6, 'Each lane must produce its own provider requests');
  assert(worktreeChildren.every(request => request.model === 'writer'), 'Saved code role must select the child model: ' + JSON.stringify(worktreeChildren.map(r => r.model)));
  assert(worktreeChildren.every(request => request.reasoning_effort === 'low'), 'Saved code role thinking must reach every child request: ' + JSON.stringify(worktreeChildren.map(r => r.reasoning_effort)));

  const listingEntries = worktreeBarrierEntries;
  assert.equal(listingEntries.length, 3, 'During the run Git must list the source plus two managed worktrees: ' + worktreeBarrierListing);
  const managed = listingEntries.filter(entry => !entry.isSource);
  assert.equal(managed.length, 2, 'Exactly two managed worktree paths expected: ' + JSON.stringify(listingEntries.map(entry => entry.path)));
  for (const entry of managed) assert(entry.real.startsWith(worktreeBaseReal), `Managed worktree must live under worktreeBaseDir: ${entry.path}`);
  assert.notEqual(managed[0].real, managed[1].real, 'Concurrent writers must not share a worktree');
  assert.equal(worktreeBarrierStatus, '', 'The source fixture must stay clean while both children write');

  // pwd output per lane, read back from the tool results the provider received.
  const pwdByLane = new Map();
  const readBackByLane = new Map();
  const statusByLane = new Map();
  for (const request of worktreeChildren) {
    const lane = laneOf(request);
    if (!lane) continue;
    const tag = `${lane.prefix}_${lane.lane}`;
    const turns = assistantTurnsOf(request);
    const toolResults = toolResultsOf(request);
    if (turns === 1 && toolResults[0]) {
      const pwd = messageText(toolResults[0]).trim();
      assert(isAbsolute(pwd) && pwd.includes('/pi-worktree-'), `${tag} pwd must be an absolute managed worktree path: ${pwd}`);
      pwdByLane.set(tag, pwd);
    }
    if (turns === 2 && toolResults[0] && toolResults[1]) {
      const readBack = messageText(toolResults[0]).trim();
      assert.equal(readBack, markerFor(tag), `${tag} read-back must show its own marker, got: ${readBack}`);
      readBackByLane.set(tag, readBack);
      const status = messageText(toolResults[1]).trim();
      assert.equal(status, '?? lane.txt', `${tag} git status must show only its own lane.txt, got: ${status}`);
      statusByLane.set(tag, status);
    }
  }
  assert.equal(pwdByLane.size, 2, 'Both lanes must report their cwd: ' + JSON.stringify([...pwdByLane]));
  assert(!samePath(pwdByLane.get('LANE_A'), pwdByLane.get('LANE_B')), 'Lane cwds must differ');
  const managedReals = managed.map(entry => entry.real);
  for (const [tag, pwd] of pwdByLane) {
    assert(managedReals.some(real => samePath(real, pwd)), `${tag} cwd must be one of the managed worktrees: ${pwd}`);
    assert(!samePath(pwd, cwd), `${tag} cwd must not be the source fixture`);
  }
  assert.deepEqual([...readBackByLane.keys()].sort(), ['LANE_A', 'LANE_B'], 'Each lane read its own marker after both writes: ' + JSON.stringify([...readBackByLane]));
  assert.equal(statusByLane.size, 2, 'Each lane saw only its own untracked file: ' + JSON.stringify([...statusByLane]));

  // The source fixture and its history are untouched by the concurrent writers.
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }), '', 'Source fixture must stay clean after the writers finish');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(), baselineHead, 'Source fixture HEAD must not move');
  let laneInSource = true;
  try { await readFile(resolve(cwd, 'lane.txt'), 'utf8'); } catch { laneInSource = false; }
  assert.equal(laneInSource, false, 'Writers must not create files in the source fixture');

  const worktreeRuns = (await asyncRuns()).filter(run => run.acceptance);
  assert.equal(worktreeRuns.length, 2, 'Both worktree writer runs must record acceptance ledgers');
  const acceptanceRecords = worktreeRuns.map(run => ({
    runId: run.status.runId ?? run.name,
    runState: run.status.state,
    status: run.acceptance.status,
    evidenceStatus: run.acceptance.evidenceStatus,
    reviewStatus: run.acceptance.reviewResult?.status,
    reviewSeverities: run.acceptance.reviewResult?.findings?.map(finding => finding.severity),
    reviewFindings: run.acceptance.reviewResult?.findings?.map(finding => finding.issue),
  }));
  for (const record of acceptanceRecords) {
    assert.equal(record.runState, 'complete', 'Async writer run must finish while review is pending: ' + JSON.stringify(record));
    assert.equal(record.evidenceStatus, 'checked', 'Inferred checked evidence expected: ' + JSON.stringify(record));
    assert.equal(record.status, 'review-required', 'Writer run must wait on independent review: ' + JSON.stringify(record));
    assert.equal(record.reviewStatus, 'review-required', 'ReviewResult must record review-required: ' + JSON.stringify(record));
    assert.deepEqual(record.reviewSeverities, ['non-blocking'], 'Review placeholder must be non-blocking: ' + JSON.stringify(record));
    assert.deepEqual(record.reviewFindings, ['Independent review has not been supplied.'], 'Review placeholder must be the shipped auto stub: ' + JSON.stringify(record));
  }

  // ---- Scenario 2: same cwd, no worktree, is it gated by the host? ----
  scenario = 'shared';
  wakeCount = 0;
  resetBarrier('shared', 2);
  const sharedStart = childRequests.length;
  await session.prompt('Run P3_WT_SHARED_CWD');
  await waitFor(async () => barrier.released, 'both shared-cwd children to reach the barrier', 60000);
  const sharedBarrierListing = barrier.worktreeListing;
  assert.equal(sharedBarrierListing.split('\n').filter(line => line.startsWith('worktree ')).length, 1, 'No managed worktree may appear for worktree:false');
  await settleScenario(4, 'both shared-cwd async runs to settle');

  const sharedChildren = childRequests.slice(sharedStart);
  assert.ok(sharedChildren.length >= 6, 'Both same-cwd children must run; the host must not silently block them');
  assert(sharedChildren.every(request => request.model === 'writer'), 'Role wiring must also apply without worktree isolation');
  const sharedPwd = new Map();
  const sharedRead = new Map();
  for (const request of sharedChildren) {
    const lane = laneOf(request);
    if (!lane) continue;
    const tag = `${lane.prefix}_${lane.lane}`;
    const turns = assistantTurnsOf(request);
    const toolResults = toolResultsOf(request);
    if (turns === 1 && toolResults[0]) sharedPwd.set(tag, messageText(toolResults[0]).trim());
    if (turns === 2 && toolResults[0]) {
      const read = messageText(toolResults[0]).trim();
      assert(/^P3_WT_SHARED_[AB]$/.test(read), `${tag} shared read must return one lane marker, got: ${read}`);
      sharedRead.set(tag, read);
    }
  }
  assert.equal(sharedPwd.size, 2, 'Both same-cwd children must report the shared cwd: ' + JSON.stringify([...sharedPwd]));
  for (const value of sharedPwd.values()) {
    assert(isAbsolute(value), 'pwd must be absolute: ' + value);
    assert(samePath(value, cwd), 'worktree:false child must run in the shared fixture cwd');
  }
  assert.equal(sharedRead.size, 2, 'Both same-cwd children must read shared.txt: ' + JSON.stringify([...sharedRead]));
  const [sharedReadA, sharedReadB] = [...sharedRead.values()];
  assert.equal(sharedReadA, sharedReadB, 'Shared cwd means both children observe the same last write: ' + JSON.stringify([...sharedRead]));
  assert([...sharedRead.entries()].some(([tag, value]) => value !== markerFor(tag)), 'At least one same-cwd child must observe the other lane write: ' + JSON.stringify([...sharedRead]));
  assert(sharedReadA === markerFor('SHARED_A') || sharedReadA === markerFor('SHARED_B'), 'Shared read must show one lane marker, not an interleaving');
  const sharedFileContent = await readFile(resolve(cwd, 'shared.txt'), 'utf8');
  assert.equal(sharedFileContent, sharedReadA, 'Source fixture must receive the shared-cwd write');
  const sharedStatus = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  assert.equal(sharedStatus.trim(), '?? shared.txt', 'Shared-cwd write must be visible in the source fixture: ' + sharedStatus);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(), baselineHead, 'No commit may happen in the fixture');

  assert.equal(errors.length, 0, JSON.stringify(errors));
  summary = {
    status: 'passed',
    validationLayer: 'real installed Pi host + pi-subagents extension + real child sessions + local fixture provider',
    fixture: { baselineHead, sourceRepo: cwd, worktreeBaseDir: worktreeBase },
    concurrency: {
      worktree: {
        lanes: worktreeRuns.length,
        completionNotices: worktreeWakes,
        cwdsDistinct: true,
        managedWorktrees: managed.length,
        sourceCleanAtBarrier: worktreeBarrierStatus === '',
        sourceUnchangedAfter: true,
        eachLaneReadOwnMarker: [...readBackByLane.keys()].sort(),
        afterRunWorktreeCount: worktreeAfterRun,
      },
      sharedCwd: {
        lanes: sharedChildren.length > 0 ? 2 : 0,
        hostBlockedSecondWriter: false,
        bothObservedSameContent: sharedReadA,
        sourceFileAfter: 'shared.txt',
        conclusion: 'The host does not enforce one writer per cwd; isolation is a parent scheduling rule.',
      },
    },
    role: { agent: 'pstack.poteto-agent', savedRole: 'code', childModel: worktreeChildren[0].model, thinking: worktreeChildren[0].reasoning_effort },
    acceptanceContract: {
      source: 'async run status.json',
      status: 'review-required',
      evidenceStatus: 'checked',
      reviewResult: { status: 'review-required', findings: ['Independent review has not been supplied.'] },
      runConsideredComplete: true,
      note: 'Review is recorded as pending; the run is not failed and no reviewer child is started automatically.',
      records: acceptanceRecords,
    },
  };
  console.log(JSON.stringify(summary));
} catch (error) {
  const runs = await asyncRuns().catch(() => []);
  console.error(JSON.stringify({
    debug: {
      parentRequests: requests.length,
      childRequests: childRequests.length,
      childModels: childRequests.map(request => request.model),
      asyncRuns: runs.map(run => ({ name: run.name, state: run.status.state, error: run.status.error ?? run.status.steps?.[0]?.error, stepStatus: run.status.steps?.map(step => step.status) })),
      lastResults: results.slice(-3).map(result => ({ tool: result.toolName, isError: !!result.isError, text: messageText(result).slice(0, 300) })),
      extensionErrors: errors.map(error => { try { return JSON.stringify(error); } catch { return String(error); } }),
    },
  }));
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  await rm(directory, { recursive: true, force: true });
  // The result watcher keeps its own delivery timers; disposing the session here only makes it
  // report stale-ctx failures for already-completed runs. Exit after cleanup instead, and let a
  // thrown assertion terminate the process with a non-zero code.
  if (summary) process.exit(0);
}
