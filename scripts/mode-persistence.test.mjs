import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sessionModeStatePath } from '../extensions/pstack/mode-state.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const piCli = resolve(root, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
const MODE_ON = /Persistent poteto-mode is ON for this user request/;

function runPi(args, { agentDir, cwd }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [piCli, ...args], {
      cwd,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`pi ${args.join(' ')} timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 120000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr });
    });
  });
}

function systemText(request) {
  return request.messages
    .filter(message => message.role === 'system' || message.role === 'developer')
    .map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
    .join('\n');
}

async function fixture(t) {
  assert.ok(existsSync(piCli), `missing Pi CLI bundle at ${piCli}; run npm install`);
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-mode-persistence-'));
  const agentDir = resolve(directory, 'agent');
  const cwd = resolve(directory, 'workspace');
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    const base = { id: 'pstack-mode-persistence', object: 'chat.completion.chunk', created: 1, model: 'fixture' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'fixture response' }, finish_reason: null }] }) + '\n\n');
    response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  const port = server.address().port;
  await writeFile(resolve(agentDir, 'models.json'), JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: 'openai-completions',
        apiKey: 'test-only',
        models: [{
          id: 'model', name: 'Fixture', reasoning: false, input: ['text'],
          contextWindow: 64000, maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }],
      },
    },
  }));

  t.after(async () => {
    await new Promise(done => server.close(done));
    await rm(directory, { recursive: true, force: true });
  });

  const run = args => runPi(['-ne', '-e', root, '--offline', ...args], { agentDir, cwd });
  const promptAndSystem = async (sessionId, prompt) => {
    const before = requests.length;
    const result = await run(['-p', '--session-id', sessionId, '--model', 'fixture/model', prompt]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    const created = requests.slice(before);
    assert.equal(created.length, 1, `expected one provider request for ${sessionId}, got ${created.length}`);
    return systemText(created[0]);
  };
  return { directory, agentDir, cwd, requests, run, promptAndSystem };
}

test('mode on set with only --session-id is restored by a separate process', async t => {
  const { agentDir, run, promptAndSystem, requests } = await fixture(t);
  const sessionId = 'session-a';

  const activation = await run(['-p', '--session-id', sessionId, '/poteto-mode on']);
  assert.equal(activation.code, 0, activation.stderr);

  const statePath = sessionModeStatePath(agentDir, sessionId);
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { version: 1, enabled: true });

  const status = await run(['-p', '--session-id', sessionId, '/poteto-mode status']);
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stderr, /"persistent": true/);
  assert.match(status.stderr, /"enabled": true/);
  assert.equal(requests.length, 0, 'Immediate status must report persistence without a model turn');

  // A new process only knows the session id; Pi has not necessarily written the
  // transcript yet, so this must come from the id-keyed state file.
  const system = await promptAndSystem(sessionId, 'what mode are you in?');
  assert.match(system, MODE_ON);
});

test('sessions with different ids stay isolated and unactivated sessions stay off', async t => {
  const { agentDir, run, promptAndSystem } = await fixture(t);
  const active = 'session-active';
  const inactive = 'session-inactive';

  const activation = await run(['-p', '--session-id', active, '/poteto-mode on']);
  assert.equal(activation.code, 0, activation.stderr);

  assert.match(await promptAndSystem(active, 'enabled session'), MODE_ON);
  const inactiveSystem = await promptAndSystem(inactive, 'never enabled session');
  assert.doesNotMatch(inactiveSystem, MODE_ON);

  const stateFiles = await readdir(resolve(agentDir, 'pstack-sessions'));
  assert.deepEqual(stateFiles.sort(), [`${active}.json`]);
});

test('session id state paths cannot escape the pstack-sessions directory', () => {
  const agentDir = resolve('/tmp', 'pstack-agent');
  assert.equal(sessionModeStatePath(agentDir, 'plain-id_1.2'), resolve(agentDir, 'pstack-sessions', 'plain-id_1.2.json'));
  for (const sessionId of ['../escape', 'a/b', 'a\\b']) {
    const path = sessionModeStatePath(agentDir, sessionId);
    assert.equal(resolve(path, '..'), resolve(agentDir, 'pstack-sessions'), `${sessionId} escaped the state directory`);
  }
  assert.throws(() => sessionModeStatePath(agentDir, ''), /non-empty string/);
});
