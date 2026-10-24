import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
assert(piRoot);
const agentDir = await mkdtemp(resolve(tmpdir(), 'pstack-cli-test-'));
async function execute(args, input) {
  const child = spawn(process.execPath, [resolve(piRoot, 'dist/cli.js'), '--no-extensions', '--no-mcp', '--no-context-files', '--no-prompt-templates', '--offline', '--no-approve', '-e', root, ...args], { cwd: agentDir, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; if (input && stdout.includes('active session branch') && stdout.includes('"type":"response"')) child.stdin.end(); });
  child.stderr.on('data', c => { stderr += c; });
  let timeout;
  const exited = new Promise((accept, reject) => { child.once('error', reject); child.once('close', code => accept(code)); timeout = setTimeout(() => child.kill('SIGTERM'), 10000); });
  if (input) child.stdin.write(input);
  else child.stdin.end();
  const code = await exited;
  clearTimeout(timeout);
  return { code, stdout, stderr };
}
try {
  const json = await execute(['--mode', 'json', '--print', '--no-session', '/poteto status']);
  assert.equal(json.code, 0, json.stderr);
  const entries = json.stdout.split('\n').filter(Boolean).map(s => JSON.parse(s));
  assert(entries.some(e => JSON.stringify(e).includes('active session branch')), 'JSON command status is visible');
  assert(!entries.some(e => e.type === 'agent_start'), 'Status must not request inference');
  const text = await execute(['--print', '--no-session', '/poteto status']);
  assert.equal(text.code, 0, text.stderr);
  assert(text.stderr.includes('active session branch'), 'Print command status is visible on stderr without corrupting stdout');
  const rpc = await execute(['--mode', 'rpc', '--no-session'], JSON.stringify({ id: 'status', type: 'prompt', message: '/poteto status' }) + '\n');
  assert.equal(rpc.code, 0, rpc.stderr);
  assert(rpc.stdout.includes('active session branch'), 'RPC command status is visible');
  const rpcEntries = rpc.stdout.split('\n').filter(Boolean).map(s => JSON.parse(s));
  assert(!rpcEntries.some(e => e.type === 'agent_start'), 'RPC status must not start an agent run');
  console.log(JSON.stringify({ status: 'passed', modes: ['json', 'print', 'rpc'], noAgentStartObserved: ['json', 'rpc'], printCheck: 'command visibility only' }));
} finally { await rm(agentDir, { recursive: true, force: true }); }
