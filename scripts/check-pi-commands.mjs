import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed Pi package root');
const agentDir = await mkdtemp(resolve(tmpdir(), 'pi-pstack-command-check-'));
const child = spawn(process.execPath, [resolve(piRoot, 'dist/cli.js'), '--mode', 'rpc', '--no-session', '--no-extensions', '--no-mcp', '--no-context-files', '--no-prompt-templates', '--offline', '-e', root], {
  cwd: agentDir,
  env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = '';
let diagnostics = '';
let response;
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 10000);
child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-1000); });
child.stdout.on('data', chunk => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).replace(/\r$/, '');
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      const record = JSON.parse(line);
      if (record.type === 'response' && record.id === 'commands') {
        response = record;
        child.stdin.end();
      }
    } catch { diagnostics += '\nUnexpected non-JSON protocol output'; }
  }
});
child.stdin.on('error', () => {});
const exit = new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => resolveExit({ code, signal }));
});
child.stdin.write(JSON.stringify({ id: 'commands', type: 'get_commands' }) + '\n');
try {
  const result = await exit;
  assert(!timedOut, 'Pi RPC startup timed out');
  assert.equal(result.code, 0, diagnostics);
  assert.equal(response?.success, true, diagnostics);
  const commands = response.data.commands;
  const own = commands.filter(command => command.sourceInfo?.path?.startsWith(resolve(root, 'skills') + '/'));
  assert.equal(own.length, 11, 'All manifest skills appear in actual Pi commands');
  const upstreamSkillCommands = commands.filter(command => command.sourceInfo?.path?.startsWith(resolve(root, 'upstream') + '/'));
  assert.equal(upstreamSkillCommands.length, 0, 'Archived upstream originals must not register commands');
  assert(own.some(command => command.name === 'skill:poteto-mode'));
  assert(own.some(command => command.name === 'skill:correct'));
  console.log(JSON.stringify({ status: 'passed', manifestSkillCommands: own.length, upstreamSkillCommands: upstreamSkillCommands.length, processExit: result.code, modelRequests: 0 }));
} finally {
  clearTimeout(timeout);
  await rm(agentDir, { recursive: true, force: true });
}
