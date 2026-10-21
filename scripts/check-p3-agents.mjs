import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// Redirect Pi settings; package scope intentionally excludes user/project agents.
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
import { ROLE_AGENTS, parseRoleAgent, createRoleAgentController } from "../extensions/pstack/role-agents.mjs";

const agentsDir = resolve(root, "agents");
const parsedAgents = new Map();
for (const [role, name] of Object.entries(ROLE_AGENTS)) {
  const file = resolve(agentsDir, name.slice("pstack.".length) + ".md");
  assert(existsSync(file), "Missing agent definition file: " + file);
  const content = await readFile(file, "utf8");
  const definition = parseRoleAgent(content, name, agentsDir);
  parsedAgents.set(name, { role, name, definition });
}

const sicko = parsedAgents.get("pstack.comment-sicko");
assert(sicko, "Must have pstack.comment-sicko definition");
assert.equal(sicko.definition.acceptanceRole, "read-only");
assert.deepEqual(sicko.definition.tools, ["read", "grep", "find", "ls", "git_read"]);
assert.equal(sicko.definition.extensions, undefined);
assert.deepEqual(sicko.definition.excludeTools, ["contact_supervisor"]);
assert.equal(sicko.definition.defaultAsync, true);
assert.equal(sicko.definition.inheritProjectContext, true);
assert.equal(sicko.definition.inheritGlobalContext, false);
assert.equal(sicko.definition.inheritSkills, false);
for (const forbidden of ["edit", "write", "bash", "subagent"]) {
  assert(!sicko.definition.tools.includes(forbidden), "Forbidden tool granted to read-only agent: " + forbidden);
}

const poteto = parsedAgents.get("pstack.poteto-agent");
assert(poteto, "Must have pstack.poteto-agent definition");
assert.equal(poteto.definition.acceptanceRole, "writer");
assert.deepEqual(poteto.definition.tools, ["read", "edit", "write", "grep", "find", "ls", "bash"]);
assert.equal(poteto.definition.extensions, undefined, "writer must not declare extensions");
assert.equal(poteto.definition.defaultAsync, true);
assert.equal(poteto.definition.inheritProjectContext, true);
assert.equal(poteto.definition.inheritGlobalContext, false);
assert.equal(poteto.definition.inheritSkills, false);

const verifier = parsedAgents.get("pstack.verifier");
const prose = parsedAgents.get("pstack.prose-writer");
assert(verifier && prose, "Pi-specific role agents must be present");
assert.deepEqual(verifier.definition.tools, ["read", "grep", "find", "ls"]);
assert.equal(verifier.definition.extensions, undefined);
assert.deepEqual(prose.definition.tools, ["read", "edit", "write", "grep", "find", "ls"]);

// Verify dynamic registration through controller
const registered = [];
const mockPi = {
  events: {
    emit(event, request) {
      if (event === "pi-subagents:runtime-agent-register:v1") {
        registered.push(request.name);
        request.result = { ok: true, registration: { dispose() {} } };
      }
    }
  }
};
const controller = createRoleAgentController(mockPi, agentsDir);
await controller.refresh({}, [{ provider: "test", id: "m" }], null, () => ["off"]);
assert.deepEqual(registered.sort(), Object.values(ROLE_AGENTS).sort());

console.log(JSON.stringify({
  status: "passed",
  discoveredCount: parsedAgents.size,
  agents: [
    { name: sicko.name, role: sicko.definition.acceptanceRole, tools: sicko.definition.tools },
    { name: poteto.name, role: poteto.definition.acceptanceRole, tools: poteto.definition.tools }
  ]
}));
