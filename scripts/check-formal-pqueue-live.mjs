// Manual live acceptance. Operates only on a caller-provided isolated p-queue clone.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent';
import { disposeTestSession, withTimeout } from './test-session-lifecycle.mjs';
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const cwd = resolve(process.argv[2]);
assert(cwd.startsWith('/tmp/pi-pstack-stage-b-pqueue'), 'Use the isolated acceptance clone');
const operatorDir = getAgentDir();
const credentials = JSON.parse(await readFile(resolve(operatorDir, 'auth.json'), 'utf8'));
const runtime = await ModelRuntime.create({ modelsPath: resolve(operatorDir, 'models.json'), credentials: {
  read: async id => credentials[id], list: async () => Object.entries(credentials).map(([providerId, c]) => ({ providerId, type: c.type })),
  modify: async () => { throw Error('Read-only credentials'); }, delete: async () => { throw Error('Read-only credentials'); },
}, allowModelNetwork: false });
const model = runtime.getModel('magpie', 'opendesign/deepseek-v4.1-flash');
assert(model);
const agentDir = resolve(cwd, '.acceptance-agent');
await mkdir(agentDir, { recursive: true });
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'always', retry: { enabled: false }, compaction: { enabled: false } });
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, additionalExtensionPaths: [packageRoot], additionalSkillPaths: [resolve(packageRoot, 'skills/create-formal-verification-skill')], noContextFiles: true, noPromptTemplates: true, noThemes: true });
await loader.reload();
assert.deepEqual(loader.getExtensions().errors, []);
let session;
const evidence = [];
try {
  const manager = SessionManager.create(cwd, resolve(agentDir, 'sessions'));
  ({session} = await createAgentSession({ cwd, agentDir, settingsManager, modelRuntime: runtime, model, resourceLoader: loader, sessionManager: manager, tools: ['read', 'grep', 'find', 'ls', 'write', 'edit', 'bash'] }));
  await session.bindExtensions({ mode: 'rpc', onError: e => evidence.push({error:String(e)}) });
  session.subscribe(event => {
    if (event.type === 'tool_execution_start') evidence.push({type:event.type,tool:event.toolName,args:event.args});
    if (event.type === 'tool_execution_end') evidence.push({type:event.type,tool:event.toolName,isError:event.isError,result:event.result});
  });
  await withTimeout(session.prompt(`/skill:create-formal-verification-skill Work in this isolated p-queue 10.0.0 clone at fixed commit 7f272ab5ff2254c0dc2537b7977e88ede1cd55e8. Generate and actually execute a project-local verify skill. Inspect the concurrency start boundary in source/index.ts, especially job() versus the active event and pending-slot reservation; prioritize the public contract that reentrant active listeners must not start more than the fixed concurrency limit. Use TLA+ for bounded interleavings and an executable check of REAL source, not just a hand model. TLC is installed via TLA2TOOLS_JAR; verification_exec is available: command=tlc, spec/config repository-relative, options [-cleanup,-noGenerateSpecTE,-noGenerateSpecTEBin]. Shell is also allowed in this isolated clone. Do not install/download anything, commit, push, or edit outside this clone. Do not change product behavior permanently. Generated skill MUST be .pi/skills/verify-queue-concurrency/SKILL.md, with real commands, coverage/sync commit/bounds. First run a deliberately broken real-code mutation and show failure; before handoff follow the generated skill on another discarded real-code change, see failure, restore exact bytes and see passing. Keep a reproducible acceptance receipt with actual commands and exits under verification/. If anything cannot complete, say draft/blocked and why. Do not ask a product question that source inspection resolves. Finish autonomously within the bounded run.\nFile tools contract: read/grep/find/ls for contents, edit/write for mutations. bash only executes programs/tests/Git, never shell cat/rg/sed or scripts to read/write file content. No global Pi config.`), 8 * 60_000, 'formal p-queue acceptance');
  const report={model:`${model.provider}/${model.id}`,session:manager.getSessionFile(),reply:session.getLastAssistantText(),evidence};
  await writeFile(resolve(cwd,'formal-live-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({session:report.session,reply:report.reply,toolCalls:evidence.filter(x=>x.type==='tool_execution_start').length}));
} finally {
  if(session?.isStreaming) await session.abort();
  await disposeTestSession(session);
  if(previousAgentDir===undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR=previousAgentDir;
}
