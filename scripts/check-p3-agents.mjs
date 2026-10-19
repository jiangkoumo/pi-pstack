import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// Redirect Pi settings; package scope intentionally excludes user/project agents.
const root = fileURLToPath(new URL("..", import.meta.url));
process.env.PI_CODING_AGENT_DIR = resolve(root, "scripts/fixtures/subagents/user");
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;

const candidates = [
  process.env.PI_SUBAGENTS_ROOT,
  resolve(homedir(), ".pi/agent/npm/node_modules/pi-subagents"),
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

const { discoverAgents } = await import(pathToFileURL(resolve(moduleRoot, "src/agents/agents.js")));

const discovered = discoverAgents(root, "package", undefined, { globalNpmRoot: null });
assert.equal(discovered.agentDiagnostics?.length ?? 0, 0, "Discovered agents produced diagnostics: " + JSON.stringify(discovered.agentDiagnostics));

const sicko = discovered.agents.find(a => a.name === "pstack.comment-sicko");
assert(sicko, "Must discover pstack.comment-sicko from package");
assert.equal(sicko.source, "package");
assert.equal(sicko.packageName, "pstack");
assert.equal(sicko.localName, "comment-sicko");
assert.equal(sicko.acceptanceRole, "read-only");
assert.deepEqual(sicko.tools, ["read", "grep", "find", "ls"]);
assert.deepEqual(sicko.extensions, []);
assert.deepEqual(sicko.excludeTools, ["contact_supervisor"]);
assert.equal(sicko.defaultAsync, true);
assert.equal(sicko.inheritProjectContext, true);
assert.equal(sicko.inheritGlobalContext, false);
assert.equal(sicko.inheritSkills, false);
for (const forbidden of ["edit", "write", "bash", "subagent"]) {
  assert(!sicko.tools.includes(forbidden), "Forbidden tool granted to read-only agent: " + forbidden);
}

const poteto = discovered.agents.find(a => a.name === "pstack.poteto-agent");
assert(poteto, "Must discover pstack.poteto-agent from package");
assert.equal(poteto.source, "package");
assert.equal(poteto.packageName, "pstack");
assert.equal(poteto.localName, "poteto-agent");
assert.equal(poteto.acceptanceRole, "writer");
assert.deepEqual(poteto.tools, ["read", "edit", "write", "grep", "find", "ls", "bash"]);
assert.equal(poteto.extensions, undefined, "writer must not declare extensions");
assert.equal(poteto.defaultAsync, true);
assert.equal(poteto.inheritProjectContext, true);
assert.equal(poteto.inheritGlobalContext, false);
assert.equal(poteto.inheritSkills, false);

assert.deepEqual(discovered.agents.filter(a => a.packageSourceRoot && resolve(a.packageSourceRoot) === resolve(root)).map(a => a.name).sort(), ["pstack.comment-sicko", "pstack.poteto-agent"]);

console.log(JSON.stringify({
  status: "passed",
  discoveredCount: discovered.agents.length,
  agents: [
    { name: sicko.name, role: sicko.acceptanceRole, tools: sicko.tools },
    { name: poteto.name, role: poteto.acceptanceRole, tools: poteto.tools }
  ]
}));
