#!/usr/bin/env node
/**
 * P3 background subagent harness: real detached runner, read-only isolation, ambient
 * extension suppression and background lifecycle returns.
 *
 * What is real here:
 * - the package under test is npm-packed and extracted into a consumer project,
 * - Pi 1.3.0 SDK, the installed pi-subagents extension and the package agents load,
 * - `subagent({ async: true })` starts pi-subagents' detached runner (a separate OS
 *   process), and the child session talks to a deterministic local provider,
 * - assertions read actual provider requests, run artifacts, the ambient marker file,
 *   the delivered completion payload and the workspace files.
 *
 * What is synthetic: the provider, the ambient fixture extension and the task text.
 * No external model, credential or production data is used.
 *
 * Usage:
 *   PI_PSTACK_PI_ROOT=/path/to/@earendil-works/pi-coding-agent node scripts/check-p3-background.mjs
 *   PI_PSTACK_KEEP_BACKGROUND_FIXTURE=1 ...   # keep the fixture directory for inspection
 *
 * Negative control (must be rejected, exit code 0 means the harness detected it):
 *   PI_PSTACK_BACKGROUND_RED_CASE=writer ...
 *   Runs the read-only contract against pstack.poteto-agent. A passing red run exits 0
 *   with status "red-case-detected"; if the contract is somehow satisfied it exits 1
 *   with RED_CASE_NOT_DETECTED.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
const subRoot = process.env.PI_SUBAGENTS_ROOT || resolve(homedir(), ".pi/agent/npm/node_modules/pi-subagents");
assert(piRoot, "Set PI_PSTACK_PI_ROOT to the installed Pi 1.3.0 package root");
assert(existsSync(resolve(subRoot, "index.js")), `pi-subagents not found at ${subRoot}`);

const directory = await mkdtemp(resolve(tmpdir(), "pstack-p3-background-"));
const agentDir = resolve(directory, "agent");
const cwd = resolve(directory, "consumer");
const markerPath = resolve(directory, "ambient-marker.jsonl");
const tempRoot = resolve(directory, "subagent-temp");
const asyncRoot = resolve(tempRoot, "async-subagent-runs");
const resultsRoot = resolve(tempRoot, "async-subagent-results");
const parentSessionDir = resolve(directory, "parent-sessions");
const ambientDir = resolve(root, "scripts/fixtures/p3-background/ambient-extension");

process.env.PI_CODING_AGENT_DIR = agentDir;
// Keep every async artifact inside the disposable fixture directory.
process.env.PI_SUBAGENTS_TEMP_ROOT = tempRoot;
// The detached runner resolves the host Pi package from this override when the
// harness process argv is not a Pi entrypoint.
process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = piRoot;
process.env.P3_BACKGROUND_MARKER = markerPath;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;
delete process.env.PI_SUBAGENT_PI_BINARY;

const targets = ["ordinary.txt", "ignored.txt", "untracked.txt"];
const readonlyTools = ["find", "grep", "ls", "read"];
const writerTools = ["bash", "edit", "find", "grep", "ls", "read", "write"];
// Negative control: run the read-only contract against the writer agent. The harness
// must reject it (declared tools and workspace files), proving the checks are not vacuous.
const redCase = process.env.PI_PSTACK_BACKGROUND_RED_CASE === "writer";
const readonlyAgentName = redCase ? "pstack.poteto-agent" : "pstack.comment-sicko";

// ------------------------------------------------------------------ state
const parentRequests = [];
const childRequests = [];
const toolResults = [];
const errors = [];
let session;
const spawnedRunnerPids = new Set();
const childBlockedResponses = [];
let childContacted = () => new Promise(() => {});
let activeScenario = null;

const textOf = (message) => {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => (part?.type === "text" ? part.text : "")).join("");
  return "";
};

function lastTask(input) {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];
    if (message?.role !== "user") continue;
    const text = textOf(message);
    if (text.includes("P3_BG_")) return { index, text };
  }
  return { index: -1, text: "" };
}

const toolMessagesAfter = (input, index) => input.messages.slice(index + 1).filter(message => message?.role === "tool");
const parentStage = input => toolMessagesAfter(input, lastTask(input).index).length;
const childStage = input => toolMessagesAfter(input, 0).length;

const parseRunId = (text) => /Async[^\[]*\[([^\]\s]+)\]/.exec(String(text ?? ""))?.[1];

function scenarioFor(name) {
  const gate = () => {
    let open;
    const promise = new Promise(accept => { open = accept; });
    return { promise, open };
  };
  const childGate = gate();
  activeScenario = {
    name,
    childGate,
    runId: undefined,
    launchText: "",
    stopText: "",
    statusText: "",
    waitText: "",
  };
  childContacted = () => childGate.promise;
  return activeScenario;
}

const launchArgs = (agent, task, extra = {}) => ({
  agent,
  task,
  async: true,
  ...extra,
  options: { context: "fresh", artifacts: false, ...(extra.options ?? {}) },
});

// ------------------------------------------------------------------ provider
const done = (input, base) => {
  const text = "P3_BG_CHILD_DONE";
  base.response.writeHead(200, { "Content-Type": "text/event-stream" });
  base.response.write(`data: ${JSON.stringify({ ...base.chunk, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\n`);
  base.response.write(`data: ${JSON.stringify({ ...base.chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  base.response.end("data: [DONE]\n\n");
};

const callsResponse = (response, chunk, calls) => {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const delta = {
    role: "assistant",
    tool_calls: calls.map((call, index) => ({
      index,
      id: `call_${index}_${Math.random().toString(16).slice(2, 8)}`,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    })),
  };
  response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
  response.end("data: [DONE]\n\n");
};

const textResponse = (response, chunk, text) => {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  response.end("data: [DONE]\n\n");
};

const server = createServer(async (request, response) => {
  let body = "";
  for await (const part of request) body += part;
  let input;
  try {
    input = JSON.parse(body);
  } catch {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "fixture: invalid request body" } }));
    return;
  }
  const chunk = { id: "fixture", object: "chat.completion.chunk", created: 1, model: input.model };
  const isParent = Boolean(input.tools?.some(tool => tool.function?.name === "subagent"));

  if (!isParent) {
    childRequests.push(input);
    if (activeScenario) activeScenario.childGate.open();
    if (activeScenario?.name === "readonly") {
      if (childStage(input) === 0) {
        callsResponse(response, chunk, targets.flatMap(path => [
          { name: "write", args: { path, content: "CORRUPTED-BY-BACKGROUND-READONLY-CHILD" } },
          { name: "edit", args: { path, oldText: "ORIGINAL", newText: "CORRUPTED-BY-BACKGROUND-READONLY-CHILD" } },
          { name: "bash", args: { command: `printf 'CORRUPTED-BY-BACKGROUND-BASH' > ${path}` } },
          { name: "ambient_write", args: { path, content: "CORRUPTED-BY-AMBIENT-EXTENSION" } },
        ]));
        return;
      }
      done(input, { response, chunk });
      return;
    }
    if (activeScenario?.name === "writer_control") {
      if (childStage(input) === 0) {
        callsResponse(response, chunk, [{ name: "write", args: { path: "control.txt", content: "WRITTEN-BY-BACKGROUND-WRITER" } }]);
        return;
      }
      done(input, { response, chunk });
      return;
    }
    // cancel / timeout / crash keep the child request open.
    childBlockedResponses.push(response);
    return;
  }

  parentRequests.push(input);
  const task = lastTask(input);
  const stage = parentStage(input);
  const name = (/P3_BG_([A-Za-z_]+)/.exec(task.text)?.[1] ?? "").toLowerCase();
  const scenario = activeScenario;

  if (!scenario || name !== scenario.name) {
    textResponse(response, chunk, `P3_BG_UNEXPECTED ${name} vs ${scenario?.name}`);
    return;
  }

  const lastToolText = () => textOf(toolMessagesAfter(input, task.index).at(-1));

  if (scenario.name === "readonly" || scenario.name === "writer_control") {
    if (stage === 0) {
      const agent = scenario.name === "readonly" ? readonlyAgentName : "pstack.poteto-agent";
      callsResponse(response, chunk, [{ name: "subagent", args: launchArgs(agent, `P3_BG_${scenario.name.toUpperCase()}: inspect this synthetic workspace and report blockers in your final output.`, { options: { timeoutMs: 120000 } }) }]);
      return;
    }
    if (stage === 1) {
      scenario.launchText = lastToolText();
      scenario.runId = parseRunId(scenario.launchText);
      callsResponse(response, chunk, [{ name: "bg_wait", args: { id: scenario.runId, timeoutMs: 60000 } }]);
      return;
    }
    scenario.waitText = lastToolText();
    textResponse(response, chunk, `P3_BG_${scenario.name.toUpperCase()}_DONE`);
    return;
  }

  if (scenario.name === "cancel") {
    if (stage === 0) {
      callsResponse(response, chunk, [{ name: "subagent", args: launchArgs("pstack.comment-sicko", "P3_BG_CANCEL: block until the parent stops this run.", { options: { timeoutMs: 120000 } }) }]);
      return;
    }
    if (stage === 1) {
      scenario.launchText = lastToolText();
      scenario.runId = parseRunId(scenario.launchText);
      await childContacted();
      callsResponse(response, chunk, [{ name: "subagent", args: { action: "status", id: scenario.runId } }]);
      return;
    }
    if (stage === 2) {
      scenario.statusText = lastToolText();
      callsResponse(response, chunk, [{ name: "subagent", args: { action: "stop", id: scenario.runId } }]);
      return;
    }
    if (stage === 3) {
      scenario.stopText = lastToolText();
      callsResponse(response, chunk, [{ name: "bg_wait", args: { id: scenario.runId, timeoutMs: 30000 } }]);
      return;
    }
    scenario.waitText = lastToolText();
    textResponse(response, chunk, "P3_BG_CANCEL_DONE");
    return;
  }

  if (scenario.name === "timeout") {
    if (stage === 0) {
      callsResponse(response, chunk, [{ name: "subagent", args: launchArgs("pstack.comment-sicko", "P3_BG_TIMEOUT: block until the run deadline expires.", { options: { timeoutMs: 2000 } }) }]);
      return;
    }
    if (stage === 1) {
      scenario.launchText = lastToolText();
      scenario.runId = parseRunId(scenario.launchText);
      callsResponse(response, chunk, [{ name: "bg_wait", args: { id: scenario.runId, timeoutMs: 40000 } }]);
      return;
    }
    scenario.waitText = lastToolText();
    textResponse(response, chunk, "P3_BG_TIMEOUT_DONE");
    return;
  }

  if (scenario.name === "crash") {
    if (stage === 0) {
      callsResponse(response, chunk, [{ name: "subagent", args: launchArgs("pstack.comment-sicko", "P3_BG_CRASH: block until the runner process is killed.", { options: { timeoutMs: 120000 } }) }]);
      return;
    }
    if (stage === 1) {
      scenario.launchText = lastToolText();
      scenario.runId = parseRunId(scenario.launchText);
      await childContacted();
      callsResponse(response, chunk, [{ name: "bg_wait", args: { id: scenario.runId, timeoutMs: 30000 } }]);
      return;
    }
    scenario.waitText = lastToolText();
    textResponse(response, chunk, "P3_BG_CRASH_DONE");
    return;
  }

  textResponse(response, chunk, `P3_BG_UNHANDLED_${stage}`);
});

await new Promise(accept => server.listen(0, "127.0.0.1", accept));
const providerUrl = `http://127.0.0.1:${server.address().port}/v1`;

// ------------------------------------------------------------------ fixtures
const markerLines = async () => {
  try {
    return (await readFile(markerPath, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
};

const runDirs = async () => {
  try {
    return (await readdir(asyncRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
      .map(entry => resolve(asyncRoot, entry.name));
  } catch {
    return [];
  }
};

const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
};

const runArtifacts = async (runId) => {
  for (const dir of await runDirs()) {
    const status = await readJson(resolve(dir, "status.json"));
    if (status?.runId !== runId) continue;
    const events = (await readFile(resolve(dir, "events.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const completion = await readJson(resolve(resultsRoot, "completion-replay", `${runId}.json`));
    const archived = await readJson(resolve(resultsRoot, "output-archives", `${runId}.json`));
    return { dir, status, events, completion, archived };
  }
  return undefined;
};

const waitFor = async (label, predicate, timeoutMs = 30000, intervalMs = 50) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(accept => setTimeout(accept, intervalMs));
  }
};

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

const recordRunner = async (runId) => {
  const artifacts = await waitFor(`run ${runId} status`, async () => {
    const found = await runArtifacts(runId);
    return found?.status?.pid ? found : undefined;
  });
  if (Number.isInteger(artifacts.status.pid)) spawnedRunnerPids.add(artifacts.status.pid);
  return artifacts;
};

const cleanupRunnerPids = async () => {
  for (const pid of spawnedRunnerPids) {
    if (alive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Verified below.
      }
    }
  }
  for (const pid of spawnedRunnerPids) {
    if (alive(pid)) await waitFor(`runner ${pid} exit`, () => !alive(pid), 10000);
  }
};

const guard = setTimeout(() => {
  console.error("HARNESS_TIMEOUT: background harness exceeded its guard");
  void cleanupRunnerPids().finally(() => process.exit(2));
}, 300000);
guard.unref?.();

const evidence = { scenarios: {} };
let failed = false;

try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await mkdir(tempRoot, { recursive: true });
  await mkdir(parentSessionDir, { recursive: true });
  await writeFile(markerPath, "");

  // Real package tarball consumed into the consumer project.
  const installDir = resolve(cwd, ".pi/npm/node_modules/pi-pstack");
  await mkdir(installDir, { recursive: true });
  const pack = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], { cwd: root, encoding: "utf8" }))[0];
  execFileSync("tar", ["-xzf", resolve(directory, pack.filename), "-C", installDir, "--strip-components=1"]);

  // Tracked / gitignored / untracked workspace targets.
  await writeFile(resolve(cwd, ".gitignore"), "ignored.txt\n");
  for (const name of targets) await writeFile(resolve(cwd, name), "ORIGINAL");
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["add", "ordinary.txt", ".gitignore"], { cwd });

  await writeFile(resolve(agentDir, "settings.json"), JSON.stringify({
    packages: [installDir, ambientDir],
    subagents: { asyncByDefault: false },
    retry: { enabled: false },
  }));
  const modelsPath = resolve(agentDir, "models.json");
  await writeFile(modelsPath, JSON.stringify({
    providers: {
      fixture: {
        baseUrl: providerUrl,
        api: "openai-completions",
        apiKey: "fixture-only",
        models: ["parent", "review", "writer"].map(id => ({
          id,
          name: id,
          reasoning: true,
          input: ["text"],
          contextWindow: 64000,
          maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      },
    },
  }));
  await writeFile(resolve(agentDir, "pstack.json"), JSON.stringify({
    version: 1,
    roles: { review: { model: "fixture/review", thinking: "high" }, code: { model: "fixture/writer" } },
  }));

  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(pathToFileURL(resolve(piRoot, "dist/index.js")));
  const runtime = await ModelRuntime.create({ authPath: resolve(agentDir, "auth.json"), modelsPath, allowModelNetwork: false });
  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: "never",
    packages: [installDir, ambientDir],
    subagents: { asyncByDefault: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [
      resolve(subRoot, "index.js"),
      resolve(installDir, "extensions/pstack/index.ts"),
      resolve(ambientDir, "index.ts"),
    ],
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  ({ session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model: runtime.getModel("fixture", "parent"),
    settingsManager,
    resourceLoader: loader,
    sessionManager: SessionManager.create(cwd, parentSessionDir),
  }));
  await session.bindExtensions({ mode: "rpc", onError: error => errors.push(error) });
  session.setActiveToolsByName([...session.getActiveToolNames(), "subagent", "bg_wait"]);
  assert(session.getActiveToolNames().includes("subagent"), "Host must expose subagent: " + JSON.stringify(session.getAllTools?.().map(tool => tool.name)));
  assert(session.getActiveToolNames().includes("bg_wait"), "Host must expose bg_wait");
  assert(session.getActiveToolNames().includes("ambient_write"), "Harness parent must load the ambient fixture extension");
  session.subscribe(event => {
    if (event.type === "message_end" && event.message.role === "toolResult") toolResults.push(event.message);
  });

  const baselineMarkers = await markerLines();
  assert.equal(baselineMarkers.length, 1, "Parent session must load the ambient extension exactly once: " + JSON.stringify(baselineMarkers));
  assert.equal(baselineMarkers[0].pid, process.pid);

  const prompt = async (scenario) => {
    const before = parentRequests.length;
    const beforeTools = toolResults.length;
    await session.prompt(`Run P3_BG_${scenario.name}`);
    const parentCalls = parentRequests.slice(before);
    return { parentCalls, newToolResults: toolResults.slice(beforeTools) };
  };

  // ------------------------------------------------------ readonly background
  {
    const beforeChildren = childRequests.length;
    const scenario = scenarioFor("readonly");
    const run = await prompt(scenario);
    assert(scenario.runId, "Parent must receive an async run id: " + JSON.stringify(run.newToolResults.map(textOf)));
    assert.equal(run.newToolResults.filter(result => result.toolName === "subagent").length, 1);
    assert(!run.newToolResults.some(result => result.toolName === "subagent" && result.isError), "Async launch must not fail: " + JSON.stringify(run.newToolResults.map(textOf)));
    assert(/Async: pstack\./.test(scenario.launchText), "Async launch must report a detached single-agent run: " + scenario.launchText);

    if (redCase) {
      await recordRunner(scenario.runId);
      const corrupted = [];
      for (const name of targets) {
        const content = await readFile(resolve(cwd, name), "utf8");
        if (content !== "ORIGINAL") corrupted.push({ name, content: content.slice(0, 60) });
      }
      assert.equal(corrupted.length, 0, "RED_CASE_FILE_WRITE_DETECTED " + JSON.stringify(corrupted));
      const leaked = childRequests.slice(beforeChildren)[0]?.tools.map(tool => tool.function.name).sort() ?? [];
      assert.deepEqual(leaked, readonlyTools, "RED_CASE_TOOL_LEAK_DETECTED " + JSON.stringify(leaked));
      throw new Error("RED_CASE_NOT_DETECTED: writer-based read-only run satisfied the read-only contract");
    }

    const artifacts = await recordRunner(scenario.runId);
    assert.equal(artifacts.status.state, "complete");
    assert.notEqual(artifacts.status.pid, process.pid, "Background run must execute outside the harness process");
    assert.equal(artifacts.status.launchResolvedExtensions.disableAmbientExtensions, true);
    assert.equal(await realpath(artifacts.status.cwd), await realpath(cwd), "Background child must run in the parent working directory");
    assert.equal(alive(artifacts.status.pid), false, "Detached runner must have exited after completion");

    const readonlyChildren = childRequests.slice(beforeChildren);
    assert.equal(readonlyChildren.length, 2, "Read-only child must make exactly its tool-call and final turns: " + readonlyChildren.length);
    const declared = readonlyChildren[0].tools.map(tool => tool.function.name).sort();
    assert.deepEqual(declared, readonlyTools, "Read-only background child must only receive the read-only allowlist");
    assert.equal(readonlyChildren[0].model, "review");
    assert.equal(readonlyChildren[0].reasoning_effort, "high");
    const denied = readonlyChildren.at(-1).messages.filter(message => message.role === "tool");
    assert.equal(denied.length, targets.length * 4, "Each write/edit/bash/ambient_write attempt must return a tool result");
    assert(denied.every(message => /not found|not available|unknown tool|no such tool/i.test(textOf(message))), "Every write attempt must be rejected: " + JSON.stringify(denied.map(message => textOf(message).slice(0, 100))));
    for (const name of targets) assert.equal(await readFile(resolve(cwd, name), "utf8"), "ORIGINAL", `${name} must keep its original content`);

    const markers = await markerLines();
    assert.equal(markers.length, 1, "Read-only runner must not load ambient extensions: " + JSON.stringify(markers));
    assert.equal(markers[0].pid, process.pid);
    assert.equal(artifacts.completion?.completion?.success, true, "Background result must be delivered as success");
    assert.equal(artifacts.completion?.completion?.results?.[0]?.model, "fixture/review:high");
    assert(/Async: pstack\.comment-sicko/.test(scenario.launchText));
    assert(!/still running|timed out/i.test(scenario.waitText), "bg_wait must return the finished run: " + scenario.waitText.slice(0, 400));

    evidence.scenarios.readonly = {
      runId: scenario.runId,
      runnerPid: artifacts.status.pid,
      runnerExited: !alive(artifacts.status.pid),
      declaredTools: declared,
      childModel: `${readonlyChildren[0].model}:${readonlyChildren[0].reasoning_effort}`,
      childRequests: readonlyChildren.length,
      deniedAttempts: denied.length,
      disabledAmbient: artifacts.status.launchResolvedExtensions.disableAmbientExtensions,
      ambientMarkerPids: markers.map(entry => entry.pid),
      deliveredModel: artifacts.completion?.completion?.results?.[0]?.model,
      preserved: targets,
    };
  }

  // The lifecycle scenarios below are skipped by the writer red-case run.
  if (!redCase) {
  // ------------------- writer control: ambient load + write detection control
  {
    const before = childRequests.length;
    const scenario = scenarioFor("writer_control");
    const run = await prompt(scenario);
    assert(scenario.runId);
    assert(!run.newToolResults.some(result => result.toolName === "subagent" && result.isError), JSON.stringify(run.newToolResults.map(textOf)));
    const artifacts = await recordRunner(scenario.runId);
    assert.equal(artifacts.status.state, "complete");
    assert.equal(alive(artifacts.status.pid), false, "Writer runner must have exited after completion");
    const writerChild = childRequests.slice(before);
    assert(writerChild.length > 0, "Writer background child must contact the fixture provider");
    const declared = writerChild[0].tools.map(tool => tool.function.name).sort();
    for (const tool of writerTools) assert(declared.includes(tool), `Writer child must declare ${tool}: ${JSON.stringify(declared)}`);
    assert(!declared.includes("ambient_write"), "Ambient tool must stay outside the writer allowlist");
    assert.equal(artifacts.status.launchResolvedExtensions.disableAmbientExtensions, false);
    const markers = await markerLines();
    assert.equal(markers.length, 2, "Writer runner must load ambient extensions: " + JSON.stringify(markers));
    assert.equal(markers[1].pid, artifacts.status.pid, "Ambient load must come from the detached writer runner");
    assert.equal(markers[1].asyncRunner, "1");
    assert.equal(artifacts.completion?.completion?.success, true);
    // Detection control: the same write probe that the read-only run must survive
    // really does change a file when the child owns the write tool.
    assert.equal(await readFile(resolve(cwd, "control.txt"), "utf8"), "WRITTEN-BY-BACKGROUND-WRITER", "Writer control must prove the write probe reaches the workspace");
    for (const name of targets) assert.equal(await readFile(resolve(cwd, name), "utf8"), "ORIGINAL", `${name} must stay unchanged by the writer control`);

    evidence.scenarios.writer_control = {
      runId: scenario.runId,
      runnerPid: artifacts.status.pid,
      declaredTools: declared,
      extraBridgedTools: declared.filter(tool => !writerTools.includes(tool)),
      disabledAmbient: artifacts.status.launchResolvedExtensions.disableAmbientExtensions,
      ambientMarkerPids: markers.map(entry => entry.pid),
      wroteControlFile: true,
    };
  }

  // -------------------------------------------------------- cancel lifecycle
  {
    const scenario = scenarioFor("cancel");
    const run = await prompt(scenario);
    assert(scenario.runId, "Cancel scenario must get a run id: " + JSON.stringify(run.newToolResults.map(textOf)));
    const artifacts = await recordRunner(scenario.runId);
    assert.match(scenario.statusText, /state: running/i, "Status before stop must report a running run: " + scenario.statusText.slice(0, 400));
    assert.match(scenario.stopText, /Stop requested/i, "Stop must be acknowledged: " + scenario.stopText.slice(0, 300));
    const stopped = artifacts.completion?.completion;
    assert(stopped, "Stopped run must still deliver a terminal result: " + scenario.waitText.slice(0, 300));
    assert.equal(stopped.success, false);
    assert.equal(artifacts.status.state, "stopped");
    assert.match(JSON.stringify(stopped), /stop|cancel/i, "Terminal result must report the stop: " + JSON.stringify(stopped).slice(0, 400));
    assert.equal(alive(artifacts.status.pid), false, "Cancelled runner must have exited");
    for (const name of targets) assert.equal(await readFile(resolve(cwd, name), "utf8"), "ORIGINAL");
    evidence.scenarios.cancel = {
      runId: scenario.runId,
      runnerPid: artifacts.status.pid,
      statusBeforeStop: scenario.statusText.slice(0, 200),
      stopAcknowledgement: scenario.stopText.slice(0, 200),
      waitText: scenario.waitText.slice(0, 300),
      terminal: { state: artifacts.status.state, success: stopped.success, error: stopped.results?.[0]?.error ?? stopped.error ?? null, stopped: stopped.results?.[0]?.stopped ?? null },
      runnerExited: !alive(artifacts.status.pid),
    };
  }

  // ------------------------------------------------------- timeout lifecycle
  {
    const scenario = scenarioFor("timeout");
    const run = await prompt(scenario);
    assert(scenario.runId, "Timeout scenario must get a run id: " + JSON.stringify(run.newToolResults.map(textOf)));
    const artifacts = await recordRunner(scenario.runId);
    const completion = artifacts.completion?.completion;
    assert(completion, "Timed-out run must deliver a terminal result: " + scenario.waitText.slice(0, 300));
    assert.equal(completion.success, false);
    assert.match(JSON.stringify(completion), /timed.?out|deadline/i, "Terminal result must report the deadline: " + JSON.stringify(completion).slice(0, 400));
    assert.equal(alive(artifacts.status.pid), false, "Timed-out runner must have exited");
    evidence.scenarios.timeout = {
      runId: scenario.runId,
      runnerPid: artifacts.status.pid,
      waitText: scenario.waitText.slice(0, 300),
      terminal: { state: artifacts.status.state, success: completion.success, timedOut: completion.results?.[0]?.timedOut ?? null, error: completion.results?.[0]?.error ?? completion.error ?? null },
      runnerExited: !alive(artifacts.status.pid),
    };
  }

  // --------------------------------------------------------- crash lifecycle
  {
    const scenario = scenarioFor("crash");
    const beforeChildren = childRequests.length;
    const promptDone = prompt(scenario);
    let killedPid;
    const waiter = (async () => {
      await waitFor("crash child request", () => childRequests.length > beforeChildren);
      const artifacts = await recordRunner(scenario.runId);
      // Let the parent's bg_wait be in flight before the runner dies, so the wait has
      // to observe the loss of its runner rather than a pre-existing result.
      await new Promise(accept => setTimeout(accept, 500));
      killedPid = artifacts.status.pid;
      process.kill(killedPid, "SIGKILL");
    })();
    await promptDone;
    await waiter;
    await waitFor("crashed runner exit", () => !alive(killedPid), 15000);
    const artifacts = await runArtifacts(scenario.runId);
    assert(artifacts, "Crash run must leave its async artifacts");
    assert.equal(alive(killedPid), false, "Killed runner must be gone");
    const completion = artifacts.completion?.completion;
    assert(scenario.waitText.length > 0, "Parent must receive a bg_wait answer after the runner crash");
    assert.match(`${scenario.waitText}\n${JSON.stringify(completion ?? {})}`, /fail|not running|no longer|timed.?out|crash|lost|exit/i, "Crash must be reported as a failure: " + scenario.waitText.slice(0, 400));
    for (const name of targets) assert.equal(await readFile(resolve(cwd, name), "utf8"), "ORIGINAL");
    evidence.scenarios.crash = {
      runId: scenario.runId,
      killedRunnerPid: killedPid,
      waitText: scenario.waitText.slice(0, 400),
      statusState: artifacts.status.state,
      terminal: completion ? { success: completion.success, error: completion.error ?? completion.results?.[0]?.error ?? null } : null,
    };
  }
  } // end of lifecycle scenarios (skipped by the red case)

  assert.equal(errors.length, 0, JSON.stringify(errors));
  const scenarioPids = Object.values(evidence.scenarios).map(entry => entry.runnerPid ?? entry.killedRunnerPid);
  assert.equal(new Set(scenarioPids).size, scenarioPids.length, "Every background run must use its own runner process: " + JSON.stringify(scenarioPids));
  assert(scenarioPids.every(pid => pid !== process.pid && !alive(pid)), "All background runners must be gone: " + JSON.stringify(scenarioPids));
  evidence.runnerPids = scenarioPids;
  console.log(JSON.stringify({
    status: "passed",
    transport: "real Pi 1.3.0 SDK + installed pi-subagents 0.79.0 detached runner + local fixture provider",
    packageConsumption: "npm pack tarball extracted into consumer .pi/npm/node_modules/pi-pstack",
    evidence,
  }, null, 2));
} catch (error) {
  const redDetected = redCase && error?.code === "ERR_ASSERTION" && /RED_CASE_(FILE_WRITE|TOOL_LEAK)_DETECTED/.test(error.message);
  if (redDetected) {
    console.log(JSON.stringify({
      status: "red-case-detected",
      expected: "the read-only contract must reject a writer-capable background child",
      detected: error.message.slice(0, 800),
    }, null, 2));
    failed = false;
  } else {
    failed = true;
    console.error("DEBUG parentRequests:", parentRequests.length, "childRequests:", childRequests.length, "toolResults:", toolResults.length);
    console.error("DEBUG tool results:", JSON.stringify(toolResults.map(result => ({ tool: result.toolName, isError: result.isError, text: textOf(result).slice(0, 300) })), null, 1));
    console.error("DEBUG last assistant:", JSON.stringify(session?.messages?.filter(message => message.role === "assistant").slice(-1), null, 2)?.slice(0, 2000));
    console.error("DEBUG errors:", JSON.stringify(errors)?.slice(0, 2000));
    console.error(error?.stack ?? String(error));
  }
} finally {
  clearTimeout(guard);
  for (const response of childBlockedResponses) {
    try {
      response.destroy();
    } catch {
      // Best effort.
    }
  }
  session?.dispose();
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
  await cleanupRunnerPids();
  if (process.env.PI_PSTACK_KEEP_BACKGROUND_FIXTURE) {
    console.error(`Kept fixture directory: ${directory}`);
  } else {
    // Session disposal can still flush run indexes right after `session.dispose()`.
    // Remove once here and once from the exit handler, which runs after every writer
    // in this process is done.
    await new Promise(accept => setTimeout(accept, 750));
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove fixture directory '${directory}':`, error);
    }
    process.once("exit", () => {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Reporting a leftover path is worse than a silent best-effort retry here.
      }
    });
  }
  process.exitCode = failed ? 1 : 0;
}
