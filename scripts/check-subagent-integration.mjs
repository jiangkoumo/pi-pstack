import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";

const [moduleRoot, fixtureRoot] = process.argv.slice(2);
assert(moduleRoot && fixtureRoot, "Usage: node scripts/check-subagent-integration.mjs <pi-subagents-root> <fixture-root>");
assert.equal(process.env.PI_CODING_AGENT_DIR, fixtureRoot + "/user", "Use the isolated fixture user configuration");
const { discoverAgents } = await import(pathToFileURL(moduleRoot + "/src/agents/agents.js"));
const { registerRuntimeAgentEventListener } = await import(pathToFileURL(moduleRoot + "/src/agents/runtime-agent-events.js"));
const { registerAgentViaEvents } = await import(pathToFileURL(moduleRoot + "/src/api/agents.js"));
const { listRuntimeAgentConfigs } = await import(pathToFileURL(moduleRoot + "/src/agents/runtime-agent-registry.js"));
const options = { globalNpmRoot: null };
const discovered = discoverAgents(fixtureRoot + "/project", "both", undefined, options);
const worker = discovered.agents.find(a => a.name === "pstack.poteto-agent");
const reviewer = discovered.agents.find(a => a.name === "pstack.comment-sicko");
assert(worker && reviewer, "Manifest must discover both namespaced package agents");
assert.equal(worker.source, "package");
assert.equal(worker.defaultAsync, true);
assert.equal(worker.inheritProjectContext, true);
assert.equal(worker.inheritGlobalContext, false);
assert.equal(worker.acceptanceRole, "writer");
assert.equal(reviewer.acceptanceRole, "read-only");
assert.deepEqual(reviewer.tools, ["read", "grep", "find", "ls"]);
assert.deepEqual(reviewer.extensions, []);
assert.equal(worker.model, undefined, "Do not pin an upstream Cursor model");
assert.equal(discovered.agentDiagnostics?.length ?? 0, 0);
const overridden = discoverAgents(fixtureRoot + "/override-project", "both", undefined, options);
assert.equal(overridden.agents.find(a => a.name === reviewer.name)?.description, "Project override reader");
const untrusted = discoverAgents(fixtureRoot + "/project", "both", undefined, { ...options, projectTrusted: false });
assert.equal(untrusted.agents.some(a => a.name.startsWith("pstack.")), false, "Untrusted project package must not load");
const bus = new EventEmitter();
const pi = {
  on() {},
  registerTool() {},
  events: {
    on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); },
    emit(name, payload) { bus.emit(name, payload); },
  },
};
const definition = { description: "Registration probe", systemPrompt: "Read-only probe; do not launch.", tools: ["read"] };
assert.throws(() => registerAgentViaEvents({ pi, name: "pstack-probe-runtime", definition }), /not installed, not ready/);
const detach = registerRuntimeAgentEventListener(pi);
const registration = registerAgentViaEvents({ pi, name: "pstack-probe-runtime", definition });
assert.equal(listRuntimeAgentConfigs(pi).length, 1);
assert.throws(() => registerAgentViaEvents({ pi, name: "pstack-probe-runtime", definition }), /collid/);
registration.dispose();
registration.dispose();
assert.equal(listRuntimeAgentConfigs(pi).length, 0);
detach();
console.log(JSON.stringify({ status: "passed", packageAgents: [worker.name, reviewer.name], checks: ["manifest discovery", "frontmatter parsing", "project overrides", "project trust", "event registration", "collision rejection", "idempotent dispose", "missing owner error"], childLaunched: false, liveExtensionHost: false }));
