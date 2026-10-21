import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { resolveSubagentModel } from "../extensions/pstack/runtime.mjs";

// 1. Isolate user configuration to fixture directory
const root = fileURLToPath(new URL("..", import.meta.url));
const installedAgentDir = getAgentDir();
process.env.PI_CODING_AGENT_DIR = resolve(root, "scripts/fixtures/subagents/user");
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;

const candidates = [
  process.env.PI_SUBAGENTS_ROOT,
  resolve(installedAgentDir, "npm/node_modules/pi-subagents"),
  resolve(root, "node_modules/pi-subagents")
].filter(Boolean);

let moduleRoot = null;
for (const c of candidates) {
  if (existsSync(c)) {
    moduleRoot = c;
    break;
  }
}

if (!moduleRoot) {
  console.log(JSON.stringify({ status: "skipped", check: "module probe", reason: "pi-subagents not installed", candidates }));
  process.exit(process.argv.includes("--allow-skip") ? 0 : 1);
}

import { readFile } from "node:fs/promises";
import { parseRoleAgent } from "../extensions/pstack/role-agents.mjs";

const { resolvePiLaunchToolPlan } = await import(pathToFileURL(resolve(moduleRoot, "src/runs/shared/child-tool-plan.js")));

const agentsDir = resolve(root, "agents");
const sickoDef = parseRoleAgent(await readFile(resolve(agentsDir, "comment-sicko.md"), "utf8"), "pstack.comment-sicko", agentsDir);
const potetoDef = parseRoleAgent(await readFile(resolve(agentsDir, "poteto-agent.md"), "utf8"), "pstack.poteto-agent", agentsDir);

const sicko = { ...sickoDef, name: "pstack.comment-sicko" };
const poteto = { ...potetoDef, name: "pstack.poteto-agent" };

// 2. Test tool plan for comment-sicko: strict read-only allowlist
// This probe checks planner output, not child execution.
const sickoPlan = resolvePiLaunchToolPlan({
  ...sicko,
  agentName: sicko.name
});

assert.equal(sickoPlan.explicitToolAllowlist, true, "Read-only agent must enforce explicit tool allowlist");
assert.equal(sickoPlan.disableAmbientExtensions, false, "Read-only agent must not disable ambient extensions");
assert.deepEqual(sickoPlan.effectiveToolAllowlist.sort(), ["find", "git_read", "grep", "ls", "read"], "Tool plan must strictly contain only read-only tools");

// Verify planner output only; actual tool denial is exercised by check-p3-host.mjs.
for (const forbidden of ["edit", "write", "bash", "subagent"]) {
  assert(!sickoPlan.effectiveToolAllowlist.includes(forbidden), `Tool plan leaked forbidden tool: ${forbidden}`);
}

// 3. Test tool plan for poteto-agent: writer agent
const potetoPlan = resolvePiLaunchToolPlan({
  ...poteto,
  agentName: poteto.name
});

assert.equal(potetoPlan.explicitToolAllowlist, true, "Writer agent must declare tools");
assert.equal(potetoPlan.disableAmbientExtensions, false, "Writer agent must not disable ambient extensions");
assert.deepEqual(potetoPlan.effectiveToolAllowlist.sort(), ["bash", "edit", "find", "grep", "ls", "read", "write"]);

// 4. Test role to model dispatching via resolveSubagentModel
const mockCatalog = [
  { provider: "magpie", id: "opendesign/deepseek-v4.1-flash", reasoning: true },
  { provider: "deepseek", id: "deepseek-flash", reasoning: true }
];
const supportedLevels = m => ["off", "low", "high"];

// Test review role mapping and exact dispatch
const configuredRoles = {
  review: { model: "magpie/opendesign/deepseek-v4.1-flash", thinking: "high" },
  code: { model: "deepseek/deepseek-flash" }
};

const sickoModelResolution = resolveSubagentModel(sicko.name, configuredRoles, mockCatalog, null, supportedLevels);
assert.equal(sickoModelResolution.role, "review");
assert.equal(sickoModelResolution.model, "magpie/opendesign/deepseek-v4.1-flash:high");

const potetoModelResolution = resolveSubagentModel(poteto.name, configuredRoles, mockCatalog, null, supportedLevels);
assert.equal(potetoModelResolution.role, "code");
assert.equal(potetoModelResolution.model, "deepseek/deepseek-flash");
assert(!/:(off|minimal|low|medium|high|xhigh|max)$/.test(potetoModelResolution.model), "Unconfigured thinking must not append a suffix");

// Test unavailable model error without fallback
const badRoles = { review: { model: "magpie/unavailable-model" } };
assert.throws(() => {
  resolveSubagentModel(sicko.name, badRoles, mockCatalog, null, supportedLevels);
}, /is not available in catalog; cannot launch subagent without configured model/);

console.log(JSON.stringify({
  status: "passed",
  validationLayer: "pure planner and mock catalog; no child started",
  readonlyPlan: {
    agent: sicko.name,
    effectiveTools: sickoPlan.effectiveToolAllowlist,
    ambientExtensionsDisabled: sickoPlan.disableAmbientExtensions,
    writeToolsDenied: ["edit", "write", "bash", "subagent"]
  },
  modelDispatch: {
    sickoResolution: sickoModelResolution,
    potetoResolution: potetoModelResolution,
    rejectionVerified: true
  }
}));
