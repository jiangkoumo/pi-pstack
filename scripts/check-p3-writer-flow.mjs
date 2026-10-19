#!/usr/bin/env node
// P3 writer delegation flow: real Pi host + pi-subagents + managed worktree,
// a writer child, a read-only reviewer child, and the mechanical writer gate.
//
// What this check does:
// - builds a throwaway Git fixture and installs the package tarball into a temp consumer;
// - loads the real installed Pi host and pi-subagents extension;
// - the fixture parent launches pstack.poteto-agent with worktree:true;
// - the fixture writer edits app.txt and returns an acceptance report;
// - the harness waits for the run, then launches pstack.comment-sicko with cwd=worktree;
// - the fixture reviewer reads app.txt and returns a structured verdict;
// - the harness writes the review record, runs scripts/writer-gate.mjs, and verifies
//   the source tree changes only when the gate passes.
//
// P3_FLOW_BLOCK=1 makes the reviewer return a blocking finding and asserts that the
// gate refuses to apply the patch.
//
// This is not a live external-model run and does not claim automatic reviewer launch.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const gatePath = resolve(root, 'scripts/writer-gate.mjs');
const piRoot = process.env.PI_PSTACK_PI_ROOT;
const subRoot = process.env.PI_SUBAGENTS_ROOT || resolve(homedir(), '.pi/agent/npm/node_modules/pi-subagents');
const block = process.env.P3_FLOW_BLOCK === '1';
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed pi-coding-agent package root');

const directory = await mkdtemp(resolve(tmpdir(), 'pstack-p3-writer-flow-'));
const agentDir = resolve(directory, 'agent');
const cwd = resolve(directory, 'consumer');
const worktreeBase = resolve(directory, 'worktrees');
const installDir = resolve(directory, 'package');
const subagentTempRoot = resolve(directory, 'subagents-temp');
const reviewPath = resolve(directory, 'review.json');
const receiptPath = resolve(directory, 'receipt.json');
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_SUBAGENTS_TEMP_ROOT = subagentTempRoot;
process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = piRoot;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;

const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));

const requests = [];
const childRequests = [];
const results = [];
const errors = [];
let session;
let writerLaunched = false;
let reviewerLaunched = false;
let writerRun = null;
let flowBase = null;
let flowPatch = null;
let flowPatchText = '';
let reviewerOutput = null;
let wakeCount = 0;
const WAKE_PATTERN = /Inspect subagent updates above|Background task completed/;

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
function criterionIds(input) {
  const text = promptText(input);
  const ids = [...text.matchAll(/criterion-\d+/g)].map(match => match[0]);
  return ids.length ? [...new Set(ids)] : ['criterion-1'];
}
function acceptanceReport(input) {
  return {
    criteriaSatisfied: criterionIds(input).map(id => ({ id, status: 'satisfied', evidence: 'fixture writer changed app.txt' })),
    changedFiles: ['app.txt'],
    testsAddedOrUpdated: [],
    commandsRun: [{ command: 'read app.txt', result: 'passed', summary: 'fixture writer read the baseline file' }],
    validationOutput: ['P3_FLOW_WRITER_DONE'],
    residualRisks: ['synthetic fixture only'],
    noStagedFiles: true,
    diffSummary: 'changes app.txt from ORIGINAL to PATCHED',
    reviewFindings: ['no blockers (fixture writer)'],
    manualNotes: 'fixture writer for the P3 flow check',
  };
}
function sse(response, model, delta, finishReason) {
  const base = { id: 'fixture', object: 'chat.completion.chunk', created: 1, model };
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n');
  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
}
function calls(list) {
  return {
    role: 'assistant',
    tool_calls: list.map((call, index) => ({ index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })),
  };
}

function parentCalls(input, userText) {
  const lastUserIndex = input.messages.findLastIndex(message => message.role === 'user');
  const toolResultsAfterUser = input.messages.slice(lastUserIndex + 1).filter(message => message.role === 'tool');
  if (WAKE_PATTERN.test(userText)) return null;
  if (userText.includes('P3_FLOW_WRITE') && !writerLaunched) {
    writerLaunched = true;
    return [{
      name: 'subagent',
      args: {
        agent: 'pstack.poteto-agent',
        task: 'P3_FLOW_WRITE: change app.txt from ORIGINAL to PATCHED. The fixture provider scripts the steps. Report blockers in the final output.',
        async: true,
        worktree: true,
        options: {
          context: 'fresh',
          timeoutMs: 60000,
          acceptance: {
            level: 'checked',
            criteria: ['Change app.txt from ORIGINAL to PATCHED'],
            evidence: ['changed-files', 'commands-run', 'no-staged-files'],
            review: { required: true, agent: 'pstack.comment-sicko' },
          },
        },
      },
    }];
  }
  if (userText.includes('P3_FLOW_REVIEW') && !reviewerLaunched) {
    assert(flowPatch, 'writer patch must be known before the reviewer launch');
    reviewerLaunched = true;
    return [{
      name: 'subagent',
      args: {
        agent: 'pstack.comment-sicko',
        task: [
          'P3_FLOW_REVIEW',
          `BASE: ${flowBase}`,
          'Review the following writer patch for the requested behavior. You are read-only.',
          'Return a JSON object with verdict "pass" or "block" and a findings array.',
          'PATCH:',
          flowPatchText.slice(0, 12000),
        ].join('\n'),
        cwd,
        async: true,
        options: { context: 'fresh', timeoutMs: 60000 },
      },
    }];
  }
  return null;
}

function childCalls(input) {
  const text = promptText(input);
  if (text.includes('P3_FLOW_WRITE')) {
    const turns = assistantTurnsOf(input);
    if (turns === 0) return [
      { name: 'read', args: { path: 'app.txt' } },
      { name: 'write', args: { path: 'app.txt', content: 'PATCHED\n' } },
    ];
    return 'writer-final';
  }
  if (text.includes('P3_FLOW_REVIEW')) {
    const turns = assistantTurnsOf(input);
    if (turns === 0) return [{ name: 'read', args: { path: 'app.txt' } }];
    return 'reviewer-final';
  }
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
      if (WAKE_PATTERN.test(lastUserText)) wakeCount += 1;
      const outbound = parentCalls(input, lastUserText);
      if (outbound) return sse(response, input.model, calls(outbound), 'tool_calls');
      return sse(response, input.model, { role: 'assistant', content: 'P3_FLOW_PARENT_DONE' }, 'stop');
    }

    childRequests.push(input);
    const outbound = childCalls(input);
    if (Array.isArray(outbound)) return sse(response, input.model, calls(outbound), 'tool_calls');
    if (outbound === 'writer-final') {
      const report = acceptanceReport(input);
      const content = [
        'P3_FLOW_WRITER_DONE',
        '',
        '```acceptance-report',
        JSON.stringify(report, null, 2),
        '```',
      ].join('\n');
      return sse(response, input.model, { role: 'assistant', content }, 'stop');
    }
    if (outbound === 'reviewer-final') {
      const findings = block
        ? [{ severity: 'blocking', issue: 'fixture reviewer rejected the change' }]
        : [{ severity: 'non-blocking', issue: 'fixture reviewer accepted the change' }];
      reviewerOutput = JSON.stringify({ verdict: block ? 'block' : 'pass', findings });
      return sse(response, input.model, { role: 'assistant', content: reviewerOutput }, 'stop');
    }
    return sse(response, input.model, { role: 'assistant', content: 'P3_FLOW_CHILD_UNKNOWN' }, 'stop');
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
async function asyncRuns() {
  const asyncRoot = resolve(subagentTempRoot, 'async-subagent-runs');
  let names = [];
  try { names = await readdir(asyncRoot); } catch { return []; }
  const runs = [];
  for (const name of names) {
    try {
      const status = JSON.parse(await readFile(resolve(asyncRoot, name, 'status.json'), 'utf8'));
      runs.push({ name, status });
    } catch { /* status may still be writing */ }
  }
  return runs;
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

let summary;
try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await mkdir(worktreeBase, { recursive: true });
  await mkdir(resolve(agentDir, 'extensions/subagent'), { recursive: true });

  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }))[0];
  await mkdir(installDir, { recursive: true });
  execFileSync('tar', ['-xzf', resolve(directory, pack.filename), '-C', installDir, '--strip-components=1']);

  await writeFile(resolve(cwd, 'app.txt'), 'ORIGINAL\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd });
  execFileSync('git', ['config', 'user.name', 'fixture'], { cwd });
  execFileSync('git', ['add', 'app.txt'], { cwd });
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
        models: ['parent', 'writer', 'reviewer'].map(id => ({
          id, name: id, reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 2048,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      },
    },
  }));
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({
    version: 1,
    roles: {
      code: { model: 'fixture/writer', thinking: 'low' },
      review: { model: 'fixture/reviewer', thinking: 'high' },
    },
  }));

  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath: resolve(agentDir, 'models.json'), allowModelNetwork: false });
  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: 'never',
    packages: [installDir],
    subagents: { asyncByDefault: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [resolve(subRoot, 'index.js'), resolve(installDir, 'extensions/pstack/index.ts')],
    noContextFiles: true, noPromptTemplates: true, noThemes: true,
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

  await session.prompt('P3_FLOW_WRITE start');
  await waitFor(async () => {
    const runs = await asyncRuns();
    const writer = runs.find(run => run.status?.state === 'complete' && acceptanceOf(run.status));
    if (writer) writerRun = writer;
    return !!writerRun;
  }, 'writer run to finish');
  await session.waitForIdle();

  const writerDir = resolve(subagentTempRoot, 'async-subagent-runs', writerRun.name);
  let handoff;
  await waitFor(async () => {
    try { handoff = JSON.parse(await readFile(resolve(writerDir, 'handoff.json'), 'utf8')); return true; } catch { return false; }
  }, 'writer handoff manifest');
  const writerChild = handoff.groups?.[0]?.children?.[0];
  assert(writerChild?.patch?.path, 'Writer handoff must name its captured patch: ' + JSON.stringify(handoff));
  flowBase = handoff.groups[0].baseCommit;
  flowPatch = writerChild.patch.path;
  flowPatchText = await readFile(flowPatch, 'utf8');
  assert(flowPatchText.includes('PATCHED'), 'Writer patch must change app.txt: ' + flowPatchText);
  assert.equal(writerChild.patch.changed, true);
  assert.equal(handoff.groups[0].cleanup?.tasks?.[0]?.worktreeRemoved, true, 'Async writer worktree is expected to be removed after capture');
  const writerAcceptance = acceptanceOf(writerRun.status);
  assert.equal(writerAcceptance.status, 'review-required', 'Writer must wait for independent review');
  assert.equal(writerAcceptance.evidenceStatus, 'checked', 'Writer evidence must be checked');

  const runsBeforeReview = new Set((await asyncRuns()).map(run => run.name));
  await session.prompt('P3_FLOW_REVIEW run');
  await waitFor(async () => {
    const runs = await asyncRuns();
    return runs.some(run => !runsBeforeReview.has(run.name) && run.status?.state === 'complete');
  }, 'reviewer run to finish');
  await session.waitForIdle();

  const writerRequests = childRequests.filter(request => promptText(request).includes('P3_FLOW_WRITE'));
  const reviewerRequests = childRequests.filter(request => promptText(request).includes('P3_FLOW_REVIEW'));
  assert(reviewerRequests.length >= 2, 'Reviewer must produce provider requests');
  for (const request of reviewerRequests) {
    const tools = (request.tools ?? []).map(tool => tool.function?.name).filter(Boolean);
    assert.deepEqual([...tools].sort(), ['find', 'grep', 'ls', 'read'], 'Reviewer must declare only read-only tools: ' + JSON.stringify(tools));
    assert.equal(request.reasoning_effort, 'high', 'Saved review role thinking must reach the reviewer');
  }
  assert(reviewerOutput, 'Reviewer must return a structured verdict');
  const reviewerVerdict = JSON.parse(reviewerOutput);
  assert.equal(reviewerVerdict.verdict, block ? 'block' : 'pass');
  const reviewerRun = (await asyncRuns()).find(run => !runsBeforeReview.has(run.name) && run.status?.state === 'complete');
  assert(reviewerRun, 'Reviewer run must be recorded');

  const review = {
    version: 1,
    verdict: reviewerVerdict.verdict,
    baseCommit: flowBase,
    patchSha256: createHash('sha256').update(flowPatchText).digest('hex'),
    reviewer: {
      runId: reviewerRun.status.runId ?? reviewerRun.name,
      model: reviewerRequests[0].model,
      tools: ['find', 'grep', 'ls', 'read'],
    },
    findings: reviewerVerdict.findings,
    reviewedAt: new Date().toISOString(),
  };
  await writeFile(reviewPath, JSON.stringify(review, null, 2) + '\n');

  const gateArgs = [
    '--repo', cwd,
    '--patch', flowPatch,
    '--review', reviewPath,
    '--check', `${process.execPath} -e "process.exit(0)"`,
    '--receipt', receiptPath,
  ];
  if (!block) gateArgs.push('--apply');
  const gate = spawnSync(process.execPath, [gatePath, ...gateArgs], { encoding: 'utf8' });
  const gateOutput = JSON.parse(gate.stdout);
  const sourceAfter = await readFile(resolve(cwd, 'app.txt'), 'utf8');
  const headAfter = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

  if (block) {
    assert.equal(gate.status, 1, 'Gate must reject a blocking review: ' + gate.stdout + gate.stderr);
    assert.ok(['review-verdict', 'review-blockers'].includes(gateOutput.code), 'Blocking review must be rejected: ' + gate.stdout);
    assert.equal(sourceAfter, 'ORIGINAL\n', 'Blocked gate must not change the source');
  } else {
    assert.equal(gate.status, 0, 'Gate must pass a clean review: ' + gate.stdout + gate.stderr);
    assert.equal(gateOutput.status, 'passed');
    assert.equal(gateOutput.applied, true);
    assert.equal(sourceAfter, 'PATCHED\n', 'Gate must apply the reviewed patch');
  }
  assert.equal(headAfter, baselineHead, 'Gate must not commit in the source fixture');
  assert.equal(errors.length, 0, JSON.stringify(errors));

  summary = {
    status: 'passed',
    validationLayer: 'real installed Pi host + pi-subagents extension + real writer/reviewer child sessions + local fixture provider + writer gate',
    blocked: block,
    fixture: { baselineHead, sourceRepo: cwd, worktreeBaseDir: worktreeBase },
    writer: {
      agent: 'pstack.poteto-agent',
      worktreeRemoved: handoff.groups[0].cleanup.tasks[0].worktreeRemoved,
      patch: flowPatch,
      patchSha256: review.patchSha256,
      baseCommit: flowBase,
      acceptanceStatus: writerAcceptance.status,
      evidenceStatus: writerAcceptance.evidenceStatus,
      model: writerRequests[0]?.model ?? 'fixture/writer',
    },
    reviewer: {
      agent: 'pstack.comment-sicko',
      runId: review.reviewer.runId,
      model: review.reviewer.model,
      tools: review.reviewer.tools,
      verdict: reviewerVerdict.verdict,
      findings: reviewerVerdict.findings,
      requestCount: reviewerRequests.length,
    },
    gate: {
      status: gateOutput.status,
      code: gateOutput.code,
      applied: gateOutput.applied ?? false,
      sourceAfter,
      headUnchanged: headAfter === baselineHead,
      receipt: receiptPath,
    },
    completionNotices: wakeCount,
  };
  console.log(JSON.stringify(summary));
} catch (error) {
  const runs = await asyncRuns().catch(() => []);
  console.error(JSON.stringify({
    debug: {
      parentRequests: requests.length,
      childRequests: childRequests.length,
      childModels: childRequests.map(request => request.model),
      runs: runs.map(run => ({ name: run.name, state: run.status?.state, error: run.status?.error, keys: Object.keys(run.status ?? {}).slice(0, 20) })),
      lastResults: results.slice(-3).map(result => ({ tool: result.toolName, isError: !!result.isError, text: messageText(result).slice(0, 300) })),
      reviewerOutput,
      errors: errors.map(error => { try { return JSON.stringify(error); } catch { return String(error); } }),
    },
  }));
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  if (process.env.P3_FLOW_KEEP !== '1') await rm(directory, { recursive: true, force: true });
  else console.error(JSON.stringify({ kept: directory }));
}
process.exit(0);
