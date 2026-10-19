#!/usr/bin/env node
/**
 * P3 live read-only review: two different real models review a known, small,
 * authorized scope of this repository through the packaged pstack extension and
 * pi-subagents.
 *
 * Evidence layers (never conflated in the output):
 *   - reviewed content   : real repository files (scope.realProject) plus one
 *                          clearly labelled synthetic control file.
 *   - parent session     : local deterministic SSE fixture; it only emits the
 *                          `subagent` tool call, so no paid parent inference.
 *   - child reviewer     : real external models through the operator's local
 *                          `magpie` provider, copied into a temporary agent dir.
 *                          Exactly one review session per configured model.
 *   - transport evidence : a recording pass-through proxy in front of the real
 *                          provider records the model id, thinking effort and
 *                          declared tools of every child request. It forwards the
 *                          response unmodified; the script does not verify how the
 *                          local gateway routes internally.
 *
 * Usage:
 *   PI_PSTACK_PI_ROOT=<pi package root> node scripts/check-p3-live-review.mjs --dry-run
 *   PI_PSTACK_PI_ROOT=<pi package root> node scripts/check-p3-live-review.mjs --out <dir>
 *
 * --dry-run only validates inputs and prints the plan; it makes no model call.
 * --out writes redacted evidence artifacts (summary + per-round transcript).
 * A missing catalog/gateway exits non-zero with `status: "blocked"`; it never
 * switches provider or fabricates a result.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureDir = resolve(root, 'scripts/fixtures/p3-live-review');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const selfTest = argv.includes('--self-test');
const outIndex = argv.indexOf('--out');
const outDir = outIndex === -1 ? null : resolve(argv[outIndex + 1]);
const READ_ONLY_TOOLS = ['find', 'grep', 'ls', 'read'];
const CREDENTIAL_PATH = /(^|\/)\.pi(\/|$)|(^|\/)auth\.json$|(^|\/)\.env(\.|$)|(^|\/)id_(rsa|ed25519)$|\.lock$/;

function emit(status, payload, code) {
  console.log(JSON.stringify({ status, ...payload }, null, 2));
  process.exit(code);
}
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 16);

const scope = JSON.parse(await readFile(resolve(fixtureDir, 'scope.json'), 'utf8'));
const briefTemplate = await readFile(resolve(fixtureDir, 'brief.md'), 'utf8');
const realFiles = scope.realProject.files;
const controlFiles = scope.syntheticControl.files;
const limits = scope.limits ?? { maxTurnsPerReview: 12, sessionTimeoutMs: 240000 };
const rounds = scope.rounds;

if (rounds.length !== 2) emit('blocked', { reason: 'scope.json must define exactly two review rounds' }, 1);
if (new Set(rounds.map(r => r.model)).size !== rounds.length) emit('blocked', { reason: 'the two rounds must use different models; duplicate models are not a multi-model run' }, 1);

for (const file of [...realFiles, ...controlFiles]) {
  const absolute = resolve(root, file);
  assert(absolute.startsWith(root + sep), 'scope path escapes the repository: ' + file);
  await readFile(absolute);
}
const scopeBefore = { files: {}, git: execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }) };
for (const file of [...realFiles, ...controlFiles]) scopeBefore.files[file] = await hash(resolve(root, file));

const renderedBrief = round => briefTemplate
  .replaceAll('{{ROUND}}', round.id)
  .replaceAll('{{REAL_FILES}}', realFiles.map(f => `- ${f}`).join('\n'))
  .replaceAll('{{CONTROL_FILES}}', controlFiles.map(f => `- ${f}`).join('\n'));

function renderPromptLabels(brief) {
  // The brief must name every authorized file; a reviewer that only sees a vague
  // scope cannot produce verifiable `path:line` findings.
  for (const file of [...realFiles, ...controlFiles]) assert(brief.includes(file), 'brief must name ' + file);
}

const modelsPath = process.env.PI_PSTACK_LIVE_MODELS || resolve(homedir(), '.pi/agent/models.json');
let catalog;
if (selfTest) {
  // Deterministic plumbing rehearsal: identical harness, stub upstream, no external call.
  // Results from this mode are never live-review evidence.
  catalog = {
    providers: {
      [rounds[0].model.split('/')[0]]: {
        api: 'openai-completions',
        baseUrl: 'http://127.0.0.1:9/v1',
        apiKey: 'self-test-stub-only',
        models: rounds.map(round => ({ id: round.model.split('/').slice(1).join('/'), reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 4096 }))
      }
    }
  };
} else {
  try {
    catalog = JSON.parse(await readFile(modelsPath, 'utf8'));
  } catch (error) {
    emit('blocked', {
      reason: 'local Pi model catalog is unreadable; this harness never invents a model list',
      catalogPath: modelsPath.replace(homedir(), '~'),
      error: String(error.message ?? error)
    }, 1);
  }
}

const selections = rounds.map(round => {
  const [providerName, ...rest] = round.model.split('/');
  const id = rest.join('/');
  const provider = catalog.providers?.[providerName];
  if (!provider) emit('blocked', { reason: `provider ${providerName} is not configured in the local catalog`, round: round.id, model: round.model }, 1);
  const entry = (provider.models ?? []).find(model => model.id === id);
  if (!entry) emit('blocked', {
    reason: 'configured model is not in the local catalog; no substitute is selected',
    round: round.id,
    model: round.model,
    available: (provider.models ?? []).map(model => `${providerName}/${model.id}`)
  }, 1);
  // A model entry can override the provider api. Honour that override: the recorder
  // only parses and forwards the OpenAI chat-completions wire format, so an
  // Anthropic/Responses model must be reported, never silently rewritten.
  const effectiveApi = entry.api ?? provider.api;
  if (effectiveApi !== 'openai-completions') emit('blocked', {
    reason: 'recording pass-through only supports the openai-completions wire format; this model declares a different one, so pick an openai-completions sibling in the same model family',
    round: round.id,
    provider: providerName,
    providerApi: provider.api,
    modelApi: entry.api ?? null,
    modelBaseUrlOverride: entry.baseUrl ?? null
  }, 1);
  // Pi's ModelRuntime resolves a model-level baseUrl ahead of the provider baseUrl.
  // The temporary catalog therefore must never carry one: any model could reach the
  // local gateway directly and bypass the recorder, leaving that round without wire
  // evidence. Deep-copy the entry, drop every endpoint-shaped field, and keep the
  // removal list as evidence.
  const templated = structuredClone(entry);
  const neutralized = Object.keys(templated).filter(key => /^(base_?url|api_?base|url|endpoint|host|origin)$/i.test(key));
  for (const key of neutralized) delete templated[key];
  return { round, providerName, provider, id, entry, effectiveApi, templated, neutralized };
});

if (new Set(selections.map(s => s.providerName)).size !== 1) emit('blocked', {
  reason: 'both rounds must use the same local provider so one recording upstream is unambiguous',
  providers: selections.map(s => s.providerName)
}, 1);
const provider = selections[0].provider;
const upstreamBase = provider.baseUrl.replace(/\/$/, '');
let upstreamOrigin = new URL(upstreamBase).origin;
let upstreamPath = new URL(upstreamBase).pathname.replace(/\/$/, '');

for (const selection of selections) renderPromptLabels(renderedBrief(selection.round));

const plan = {
  mode: selfTest ? 'self-test (stub upstream, no external inference)' : 'live (real provider inference for the two reviewers)',
  validationLayer: selfTest
    ? 'self-test: identical packaging/extension/subagent plumbing with a local stub upstream; NOT live review evidence'
    : 'real packaged extension + pi-subagents + real provider inference for the child reviewer; deterministic local fixture for the parent session only',
  catalogPath: selfTest ? 'synthetic self-test catalog' : modelsPath.replace(homedir(), '~'),
  provider: { name: selections[0].providerName, api: provider.api, baseUrlOrigin: upstreamOrigin },
  rounds: selections.map(s => ({ round: s.round.id, model: s.round.model, thinking: s.round.thinking ?? null, thinkingModel: s.entry.reasoning === true, effectiveApi: s.effectiveApi, neutralizedModelEntryFields: s.neutralized })),
  realProjectFiles: realFiles,
  syntheticControlFiles: controlFiles,
  limits,
  budget: 'two review sessions total, one per model; no retry and no provider substitution'
};
if (dryRun) emit('dry-run', { plan }, 0);

// --- catalog reachability (read-only probe, no inference) -------------------
if (!selfTest) try {
  const probe = await fetch(`${upstreamBase}/models`, { signal: AbortSignal.timeout(8000) });
  assert.equal(probe.status, 200);
  const body = await probe.json();
  const ids = new Set((body.data ?? []).map(model => model.id));
  for (const selection of selections) {
    if (!ids.has(selection.id)) emit('blocked', { reason: 'provider does not list the configured model', model: selection.round.model, listed: [...ids].filter(id => id.includes(selection.id.split('/')[0])) }, 1);
  }
} catch (error) {
  emit('blocked', { reason: 'local provider is unreachable; no review was attempted and no fallback provider was tried', providerOrigin: upstreamOrigin, error: String(error.message ?? error) }, 1);
}

const piRoot = process.env.PI_PSTACK_PI_ROOT;
const subRoot = process.env.PI_SUBAGENTS_ROOT || resolve(homedir(), '.pi/agent/npm/node_modules/pi-subagents');
if (!piRoot) emit('blocked', { reason: 'set PI_PSTACK_PI_ROOT to the installed Pi coding agent package root' }, 1);

const directory = await mkdtemp(resolve(tmpdir(), 'pstack-p3-live-'));
const agentDir = resolve(directory, 'agent');
const consumer = resolve(directory, 'consumer');
process.env.PI_CODING_AGENT_DIR = agentDir;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;

// Deterministic stub upstream for --self-test: two read calls, then a report that
// carries the seeded control anchors and the requested json block.
const stub = selfTest ? createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  const messages = input.messages ?? [];
  const lastUser = messages.findLastIndex(message => message.role === 'user');
  const settled = messages.slice(lastUser + 1).filter(message => message.role === 'tool').length;
  const roundId = roundState.id;
  const reads = [realFiles[0], realFiles[1], controlFiles[0]].filter(Boolean);
  let calls;
  let content;
  if (settled < reads.length) {
    calls = [{ name: 'read', args: { path: reads[settled] } }];
  } else {
    content = [
      `P3 self-test review report for round ${roundId}.`,
      'Control smells: DO NOT REMOVE banner, eslint-disable suppression, keep for rollback dead code, IMPORTANT justification, TODO: refactor later.',
      'Real scope: no comment-hygiene defect invented in self-test mode.',
      '',
      '```json',
      JSON.stringify({ round: roundId, filesRead: reads, findings: [{ part: 'control', file: controlFiles[0], line: 3, summary: 'self-test stub finding' }], skipped: realFiles }),
      '```'
    ].join('\n');
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'p3-live-stub', object: 'chat.completion.chunk', created: 1, model: input.model };
  const delta = calls
    ? { role: 'assistant', tool_calls: calls.map((call, index) => ({ index, id: `stub_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }
    : { role: 'assistant', content };
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: calls ? 'tool_calls' : 'stop' }] })}\n\n`);
  response.end('data: [DONE]\n\n');
}) : null;
if (stub) {
  await new Promise(accept => stub.listen(0, '127.0.0.1', accept));
  upstreamOrigin = `http://127.0.0.1:${stub.address().port}`;
  upstreamPath = '/v1';
}

const failures = [];
const roundEvidence = [];
const redacted = value => {
  if (Array.isArray(value)) return value.map(redacted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/apikey|authorization|^auth$|secret|token|headers/i.test(key))
      .map(([key, inner]) => [key, redacted(inner)]));
  }
  return value;
};
async function persist(name, value) {
  if (!outDir) return;
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, name), JSON.stringify(redacted(value), null, 2) + '\n');
}

// --- recording pass-through in front of the real provider -------------------
const recorded = [];
const gatewayErrors = [];
const roundState = { id: null };
const recorder = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  let input;
  try { input = JSON.parse(body); } catch {
    gatewayErrors.push({ round: roundState.id, reason: 'non-JSON child request' });
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'p3 live review recorder rejected a non-JSON request' } }));
    return;
  }
  const turn = recorded.filter(entry => entry.round === roundState.id).length + 1;
  const entry = {
    round: roundState.id,
    turn,
    model: typeof input.model === 'string' ? input.model : null,
    reasoningEffort: input.reasoning_effort ?? input.reasoning?.effort ?? null,
    stream: input.stream ?? null,
    messageCount: Array.isArray(input.messages) ? input.messages.length : 0,
    tools: (input.tools ?? []).map(tool => tool.function?.name).filter(Boolean),
    toolCalls: [],
    status: null,
    errorSnippet: null
  };
  for (const message of input.messages ?? []) {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      let args = null;
      try { args = JSON.parse(call.function?.arguments ?? 'null'); } catch { args = { unparsed: String(call.function?.arguments).slice(0, 120) }; }
      entry.toolCalls.push({ name: call.function?.name ?? null, args });
    }
  }
  recorded.push(entry);
  if (turn > limits.maxTurnsPerReview) {
    entry.status = 429;
    entry.errorSnippet = 'turn budget exhausted';
    response.writeHead(429, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'p3 live review turn budget exhausted', type: 'rate_limit_error' } }));
    return;
  }
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (['host', 'content-length', 'connection', 'accept-encoding', 'transfer-encoding'].includes(key.toLowerCase())) continue;
    if (typeof value === 'string') headers[key] = value;
  }
  headers['content-type'] = 'application/json';
  headers['accept-encoding'] = 'identity';
  const target = upstreamOrigin + upstreamPath + request.url.replace(/^\/v1/, '');
  try {
    const upstream = await fetch(target, { method: 'POST', headers, body });
    entry.status = upstream.status;
    if (upstream.status !== 200) {
      const text = await upstream.text();
      entry.errorSnippet = text.slice(0, 400);
      response.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      response.end(text);
      return;
    }
    response.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (upstream.body) for await (const chunk of Readable.fromWeb(upstream.body)) response.write(chunk);
    response.end();
  } catch (error) {
    entry.status = 'transport-error';
    entry.errorSnippet = String(error.message ?? error).slice(0, 400);
    gatewayErrors.push({ round: roundState.id, turn, reason: entry.errorSnippet });
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'p3 live review recorder could not reach the configured provider' } }));
  }
});

// --- deterministic parent fixture (no external inference) -------------------
const parentCalls = [];
const fixture = { brief: '', roundId: null };
const parentServer = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  let input;
  try { input = JSON.parse(body); } catch { response.writeHead(400); response.end('{}'); return; }
  const isParent = (input.tools ?? []).some(tool => tool.function?.name === 'subagent');
  const taskMessage = (input.messages ?? []).findLast(message => message.role === 'user');
  const text = typeof taskMessage?.content === 'string' ? taskMessage.content : JSON.stringify(taskMessage?.content ?? '');
  const afterUser = taskMessage ? (input.messages ?? []).slice(input.messages.lastIndexOf(taskMessage) + 1).filter(message => message.role === 'tool') : [];
  let calls;
  if (isParent && taskMessage && afterUser.length === 0) {
    calls = [{
      name: 'subagent',
      args: {
        agent: 'pstack.comment-sicko',
        task: fixture.brief,
        async: false,
        options: { context: 'fresh', timeoutMs: limits.sessionTimeoutMs, artifacts: false }
      }
    }];
    parentCalls.push({ round: fixture.roundId, prompt: text, args: calls[0].args });
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'p3-live-parent', object: 'chat.completion.chunk', created: 1, model: input.model };
  const delta = calls
    ? { role: 'assistant', tool_calls: calls.map((call, index) => ({ index, id: `call_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }
    : { role: 'assistant', content: `P3_LIVE_DONE ${fixture.roundId}` };
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: calls ? 'tool_calls' : 'stop' }] })}\n\n`);
  response.end('data: [DONE]\n\n');
});

let session;
const serve = server => new Promise(accept => server.listen(0, '127.0.0.1', accept));
await serve(recorder);
await serve(parentServer);

try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(consumer, { recursive: true });
  const installDir = resolve(consumer, '.pi/npm/node_modules/pi-pstack');
  await mkdir(installDir, { recursive: true });
  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }))[0];
  execFileSync('tar', ['-xzf', resolve(directory, pack.filename), '-C', installDir, '--strip-components=1']);
  const installedAgents = execFileSync('node', ['-e', 'process.stdout.write(require("fs").readdirSync(process.argv[1]).join(","))', resolve(installDir, 'agents')], { encoding: 'utf8' });
  assert.match(installedAgents, /comment-sicko\.md/);

  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({ packages: [installDir], subagents: { asyncByDefault: false }, retry: { enabled: false } }), { mode: 0o600 });
  const models = {
    providers: {
      fixture: { baseUrl: `http://127.0.0.1:${parentServer.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-parent-only', models: [{ id: 'parent', name: 'parent', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] },
      [selections[0].providerName]: {
        ...provider,
        baseUrl: `http://127.0.0.1:${recorder.address().port}/v1`,
        models: selections.map(selection => selection.templated)
      }
    }
  };
  // Invariant: only the provider block may name an endpoint (the recorder). No model
  // entry may carry a URL of any kind, because it would win over the provider baseUrl.
  const tempProvider = models.providers[selections[0].providerName];
  const leakedEndpoints = [];
  const scanEndpoints = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((inner, index) => scanEndpoints(inner, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (/^(base_?url|api_?base|url|endpoint|host|origin)$/i.test(key)) leakedEndpoints.push(`${path}.${key}`);
        scanEndpoints(inner, `${path}.${key}`);
      }
      return;
    }
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) leakedEndpoints.push(`${path} = url`);
  };
  tempProvider.models.forEach((entry, index) => scanEndpoints(entry, `models[${index}]`));
  assert.deepEqual(leakedEndpoints, [], 'no model entry in the temporary catalog may name an endpoint; it would bypass the recorder');
  const tempModelsPath = resolve(agentDir, 'models.json');
  await writeFile(tempModelsPath, JSON.stringify(models), { mode: 0o600 });

  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));
  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, 'auth.json'), modelsPath: tempModelsPath, allowModelNetwork: false });
  for (const selection of selections) assert(runtime.getModel(selection.providerName, selection.id), `temporary catalog must expose ${selection.round.model}`);
  const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', packages: [installDir], subagents: { asyncByDefault: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [resolve(subRoot, 'index.js'), resolve(installDir, 'extensions/pstack/index.ts')],
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);

  const model = runtime.getModel('fixture', 'parent');
  assert(model, 'parent fixture model must resolve');
  const errors = [];
  const toolResults = [];
  ({ session } = await createAgentSession({ cwd: root, agentDir, modelRuntime: runtime, model, settingsManager, resourceLoader: loader, sessionManager: SessionManager.inMemory(root) }));
  await session.bindExtensions({ mode: 'rpc', onError: error => errors.push(error) });
  session.setActiveToolsByName([...session.getActiveToolNames(), 'subagent']);
  assert(session.getActiveToolNames().includes('subagent'), 'host must expose the subagent tool');
  const unsubscribe = session.subscribe(event => {
    if (event.type === 'message_end' && event.message.role === 'toolResult') toolResults.push(event.message);
  });

  for (const selection of selections) {
    const round = selection.round;
    roundState.id = round.id;
    fixture.roundId = round.id;
    fixture.brief = renderedBrief(round);
    await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: { review: { model: round.model, ...(round.thinking ? { thinking: round.thinking } : {}) } } }), { mode: 0o600 });

    const resultStart = toolResults.length;
    const errorStart = errors.length;
    const startedAt = Date.now();
    const timer = setTimeout(() => { void session.abort().catch(() => {}); }, limits.sessionTimeoutMs);
    try {
      await session.prompt(`Run P3_LIVE_${round.id}`);
    } catch (error) {
      failures.push(`round ${round.id}: parent prompt failed: ${String(error.message ?? error)}`);
    } finally {
      clearTimeout(timer);
    }
    const wallMs = Date.now() - startedAt;
    const requests = recorded.filter(entry => entry.round === round.id);
    const roundResults = toolResults.slice(resultStart);
    const roundErrors = errors.slice(errorStart);
    const resultMessage = roundResults.at(-1);
    const detail = resultMessage?.details?.results?.[0];
    const text = String(detail?.finalOutput ?? (resultMessage?.content ?? []).map(part => part.text ?? '').join('\n') ?? '');
    const observedModelRaw = detail?.model ?? null;
    const observedModel = stripThinking(observedModelRaw);
    const structured = extractJsonBlock(text);
    const anchors = scope.syntheticControl.seededAnchors.filter(anchor => text.toLowerCase().includes(anchor.toLowerCase()));
    const allCalls = requests.flatMap(entry => entry.toolCalls);
    const childSession = await harvestChildSession(detail?.sessionFile, round.id);
    const transcriptCalls = childSession.calls;
    const uniqueCalls = [...new Map([...allCalls, ...transcriptCalls].map(call => [JSON.stringify(call), call])).values()];
    const wireCapture = requests.length ? 'recorded' : 'missing';
    const paths = uniqueCalls.map(call => call.args?.path).filter(value => typeof value === 'string');
    const escaped = paths.filter(value => {
      const rel = relative(root, resolve(root, value));
      return isAbsolute(rel) || rel.startsWith('..');
    });
    const credentialReads = paths.filter(value => CREDENTIAL_PATH.test(value.replaceAll('\\', '/')));
    const realScopedReads = uniqueCalls.filter(call => realFiles.some(file => String(call.args?.path ?? '').replaceAll('./', '') === file));
    const annotation = {
      round: round.id,
      model: round.model,
      thinking: round.thinking ?? null,
      observedModel,
      observedModelRaw,
      wireCapture,
      wallMs,
      parentPrompt: `Run P3_LIVE_${round.id}`,
      childArgs: redacted(parentCalls.filter(call => call.round === round.id).map(call => call.args)),
      requests: requests.map(entry => ({ turn: entry.turn, model: entry.model, reasoningEffort: entry.reasoningEffort, stream: entry.stream, tools: entry.tools, status: entry.status, toolCalls: entry.toolCalls.length })),
      toolCalls: uniqueCalls,
      toolCallSources: { recordingProxy: allCalls.length, childSession: transcriptCalls.length },
      childSession: { model: childSession.model, thinking: childSession.thinking, entries: childSession.entries, sha256: childSession.sha256, evidencePath: childSession.evidencePath, error: childSession.error },
      usage: detail?.usage ?? null,
      exitCode: detail?.exitCode ?? null,
      error: detail?.error ?? null,
      structured: structured ?? null,
      structuredParsed: Boolean(structured),
      controlAnchorsFound: anchors,
      controlAnchorsExpected: scope.syntheticControl.seededAnchors,
      reviewText: text
    };
    roundEvidence.push(annotation);

    // --- mechanical evidence checks (content correctness is the lead agent's job)
    if (detail?.exitCode !== 0) failures.push(`round ${round.id}: child did not complete (exitCode ${detail?.exitCode}, error: ${detail?.error ?? 'none'})`);
    if (roundErrors.length) failures.push(`round ${round.id}: host reported errors ${JSON.stringify(roundErrors.map(error => (error && typeof error === 'object' ? (error.message ?? error.code ?? Object.keys(error)) : String(error))))}`);
    if (!requests.length) failures.push(`round ${round.id}: the child never traversed the recording proxy, so its wire model id, thinking effort and tool allowlist are not captured for this round; provider-configuration isolation is unproven`);
    if (observedModel !== round.model) failures.push(`round ${round.id}: observed child model ${JSON.stringify(observedModel)} != configured ${round.model}`);
    if (!transcriptCalls.length) failures.push(`round ${round.id}: the child session log yielded no tool calls (${childSession.error ?? 'no calls recorded'}); read-only enforcement cannot be shown for this round`);
    if (childSession.model && childSession.model !== round.model) failures.push(`round ${round.id}: child session model ${JSON.stringify(childSession.model)} != configured ${round.model}`);
    if (round.thinking && childSession.thinking && childSession.thinking !== round.thinking) failures.push(`round ${round.id}: child session thinking ${JSON.stringify(childSession.thinking)} != ${round.thinking}`);
    for (const entry of requests) {
      if (stripThinking(entry.model) !== selection.id) failures.push(`round ${round.id}: turn ${entry.turn} requested model ${JSON.stringify(entry.model)}, expected ${selection.id}`);
      const tools = [...entry.tools].sort();
      if (JSON.stringify(tools) !== JSON.stringify(READ_ONLY_TOOLS)) failures.push(`round ${round.id}: turn ${entry.turn} declared tools ${JSON.stringify(tools)} instead of ${JSON.stringify(READ_ONLY_TOOLS)}`);
      if (round.thinking && entry.reasoningEffort !== round.thinking) failures.push(`round ${round.id}: turn ${entry.turn} reasoning effort ${JSON.stringify(entry.reasoningEffort)} != ${round.thinking}`);
      if (entry.status !== 200) failures.push(`round ${round.id}: turn ${entry.turn} provider status ${JSON.stringify(entry.status)} ${entry.errorSnippet ?? ''}`);
      for (const call of entry.toolCalls) {
        if (!READ_ONLY_TOOLS.includes(String(call.name))) failures.push(`round ${round.id}: forbidden tool ${JSON.stringify(call.name)} attempted`);
      }
    }
    if (escaped.length) failures.push(`round ${round.id}: tool paths escaped the repository: ${JSON.stringify(escaped)}`);
    if (credentialReads.length) failures.push(`round ${round.id}: reviewer touched credential-shaped paths: ${JSON.stringify(credentialReads)}`);
    if (!realScopedReads.length) failures.push(`round ${round.id}: reviewer never read an authorized real project file; findings would not be about project code`);
    if (anchors.length < 2) failures.push(`round ${round.id}: reviewer reported only ${anchors.length} seeded control anchors; the synthetic control did not confirm it read the given files`);
    if (!structured) failures.push(`round ${round.id}: reviewer did not emit the requested json block, so findings cannot be cited mechanically (raw text is kept for the lead agent)`);
    if (gatewayErrors.some(entry => entry.round === round.id)) failures.push(`round ${round.id}: recorder transport errors ${JSON.stringify(gatewayErrors.filter(entry => entry.round === round.id))}`);
    if (parentCalls.filter(call => call.round === round.id).length !== 1) failures.push(`round ${round.id}: expected exactly one parent delegation`);
    if (parentCalls.some(call => call.args && Object.hasOwn(call.args, 'model'))) failures.push(`round ${round.id}: parent passed an explicit model; the run would not prove role configuration`);

    await persist(`round-${round.id}.json`, annotation);
    if (process.env.PI_PSTACK_LIVE_DEBUG) await persist(`debug-detail-${round.id}.json`, detail ?? {});
    await persist(`round-${round.id}.md`, `# P3 live review round ${round.id}\n\nmodel: ${round.model}${round.thinking ? `:${round.thinking}` : ''}\nobserved: ${observedModelRaw}\nrequests: ${requests.length}\nstructured: ${Boolean(structured)}\n\n---\n\n${text}\n`);
  }
  unsubscribe();
  session.dispose();
  session = undefined;

  // --- repository untouched --------------------------------------------------
  for (const file of [...realFiles, ...controlFiles]) {
    const current = await hash(resolve(root, file));
    if (current !== scopeBefore.files[file]) failures.push(`reviewed file changed during the run: ${file}`);
  }
  const gitAfter = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  const outRel = outDir && outDir.startsWith(root + sep) ? relative(root, outDir) + sep : null;
  const normalize = text => text.split('\n').filter(Boolean)
    .filter(line => !(outRel && line.slice(3).startsWith(outRel)))
    .join('\n');
  if (normalize(gitAfter) !== normalize(scopeBefore.git)) failures.push('git status changed during the review run outside the evidence directory');

  const summary = {
    validationLayer: plan.validationLayer,
    harness: { script: 'scripts/check-p3-live-review.mjs', scriptSha256: await hash(fileURLToPath(import.meta.url)), mode: selfTest ? 'self-test' : 'live' },
    providerIsolation: {
      mechanism: 'the temporary models.json points the provider baseUrl at the recorder and carries no model-level baseUrl (endpoint-shaped entry fields are stripped and asserted away), so a child cannot resolve an endpoint that bypasses the recorder',
      neutralizedModelEntryFields: Object.fromEntries(selections.map(selection => [selection.round.model, selection.neutralized])),
      effectiveApi: Object.fromEntries(selections.map(selection => [selection.round.model, selection.effectiveApi]))
    },
    startedScopes: {
      realProject: { label: scope.realProject.label, files: realFiles, hashes: scopeBefore.files },
      syntheticControl: { label: scope.syntheticControl.label, files: controlFiles, seededAnchors: scope.syntheticControl.seededAnchors, note: 'control results only show the reviewer read the labelled fixture; they are not project findings' }
    },
    provider: plan.provider,
    rounds: roundEvidence.map(annotation => ({
      round: annotation.round,
      model: annotation.model,
      thinking: annotation.thinking,
      observedModel: annotation.observedModel,
      wireCapture: annotation.wireCapture,
      toolCallSources: annotation.toolCallSources,
      childSession: annotation.childSession,
      requests: annotation.requests.length,
      wallMs: annotation.wallMs,
      declaredTools: [...new Set(annotation.requests.flatMap(entry => entry.tools))].sort(),
      controlAnchorsFound: annotation.controlAnchorsFound,
      structuredParsed: annotation.structuredParsed,
      findings: annotation.structured?.findings ?? null,
      reviewTextPath: outDir ? `round-${annotation.round}.md` : null
    })),
    readOnly: { toolsDeclared: READ_ONLY_TOOLS, forbiddenToolAttempts: roundEvidence.flatMap(annotation => annotation.toolCalls.filter(call => !READ_ONLY_TOOLS.includes(String(call.name)))).length, repositoryUnchanged: !failures.some(failure => /changed during the run|escaped the repository|credential-shaped/.test(failure)) },
    outerProviderIdentity: 'verified: the exact provider/model id the packaged role configuration produced is what the child requested, and the local gateway served 200; the gateway\'s internal vendor routing is not verified here',
    redaction: 'provider apiKey is copied only into the temporary agent dir with mode 0600 and never written to evidence; only ids, tool names and review text are persisted',
    failures
  };
  await persist('summary.json', summary);
  await cleanup();
  if (failures.length) emit('failed', { summary }, 1);
  emit(selfTest ? 'self-test-passed' : 'passed', { summary }, 0);
} finally {
  await cleanup();
}

async function cleanup() {
  if (cleanup.done) return;
  cleanup.done = true;
  session?.dispose();
  for (const server of [parentServer, recorder, stub].filter(Boolean)) {
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
  }
  await rm(directory, { recursive: true, force: true });
}

async function harvestChildSession(sessionFile, roundId) {
  if (!sessionFile) return { calls: [], entries: 0, model: null, thinking: null, sha256: null, evidencePath: null, error: 'child session file was not reported by the run' };
  let text;
  try {
    text = await readFile(sessionFile, 'utf8');
  } catch (error) {
    return { calls: [], entries: 0, model: null, thinking: null, sha256: null, evidencePath: null, error: 'child session file unreadable: ' + String(error.message ?? error) };
  }
  const lines = text.split('\n').filter(Boolean);
  const calls = [];
  let model = null;
  let thinking = null;
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === 'model_change') model = `${entry.provider}/${entry.modelId}`;
    if (entry.type === 'thinking_level_change') thinking = entry.thinkingLevel ?? null;
    const message = entry.message;
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part?.type === 'toolCall') calls.push({ name: part.name ?? null, args: part.arguments ?? null, source: 'childSession' });
    }
  }
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  let evidencePath = null;
  if (outDir) {
    evidencePath = `round-${roundId}-child-session.jsonl`;
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, evidencePath), text);
  }
  return { calls, entries: lines.length, model, thinking, sha256: digest, evidencePath, error: null };
}

function stripThinking(model) {
  return typeof model === 'string' ? model.replace(/:(off|minimal|low|medium|high|xhigh|max)$/, '') : model;
}

function extractJsonBlock(text) {
  const fenced = [...String(text).matchAll(/```json\s*\n([\s\S]*?)```/g)].at(-1);
  const candidate = fenced ? fenced[1] : null;
  if (!candidate) return null;
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
