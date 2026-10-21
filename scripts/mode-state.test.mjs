import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { loadModeState, saveModeState } from '../extensions/pstack/mode-state.mjs';

const moduleUrl = new URL('../extensions/pstack/mode-state.mjs', import.meta.url).href;
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pstack-mode-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, path: join(dir, 'nested', 'mode.json') };
}

test('missing state starts off without creating a file', t => {
  const { dir, path } = fixture(t);
  assert.deepEqual(loadModeState(path), { version: 1, enabled: false });
  assert.deepEqual(readdirSync(dir), []);
});

test('activation is on disk before any chat or session entry exists', t => {
  const { path } = fixture(t);
  assert.deepEqual(saveModeState(path, { version: 1, enabled: true }), { version: 1, enabled: true });
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { version: 1, enabled: true });
  const restored = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { loadModeState } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(loadModeState(process.argv[1])));`, path], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(restored), { version: 1, enabled: true });
});

test('each load rereads the authoritative file, including off and deletion', t => {
  const { dir, path } = fixture(t);
  saveModeState(path, { version: 1, enabled: true });
  const first = loadModeState(path);
  first.enabled = false;
  assert.equal(loadModeState(path).enabled, true);
  writeFileSync(path, JSON.stringify({ version: 1, enabled: false }));
  assert.equal(loadModeState(path).enabled, false);
  rmSync(path);
  assert.equal(loadModeState(path).enabled, false);
  assert.deepEqual(readdirSync(join(dir, 'nested')), []);
});

test('invalid JSON and schemas fail explicitly with the source path', t => {
  const { dir, path } = fixture(t);
  mkdirSync(join(dir, 'nested'));
  for (const raw of ['{', 'null', '[]', '{}', '{"version":2,"enabled":true}', '{"version":1,"enabled":"on"}', '{"version":1,"enabled":true,"extra":0}']) {
    writeFileSync(path, raw);
    assert.throws(() => loadModeState(path), error => error.message.includes(path) && /invalid mode state/i.test(error.message));
  }
});

test('invalid saves preserve the last valid state and leave no temporary files', t => {
  const { dir, path } = fixture(t);
  saveModeState(path, { version: 1, enabled: true });
  for (const value of [undefined, null, [], {}, { version: 1, enabled: 1 }, { version: 2, enabled: false }, { version: 1, enabled: false, extra: true }]) {
    assert.throws(() => saveModeState(path, value), /invalid mode state/i);
    assert.equal(loadModeState(path).enabled, true);
  }
  assert.deepEqual(readdirSync(join(dir, 'nested')), ['mode.json']);
});

test('filesystem errors propagate and failed replacement cleans its temporary file', t => {
  const { dir, path } = fixture(t);
  mkdirSync(path, { recursive: true });
  assert.throws(() => loadModeState(path), error => error.code === 'EISDIR');
  assert.throws(() => saveModeState(path, { version: 1, enabled: true }));
  assert.deepEqual(readdirSync(join(dir, 'nested')), ['mode.json']);
});

test('independent readers only see complete old or new snapshots during replacement', async t => {
  const { dir, path } = fixture(t);
  saveModeState(path, { version: 1, enabled: false });
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { loadModeState } from ${JSON.stringify(moduleUrl)};
    process.stdout.write('ready');
    for (let i = 0; i < 10000; i++) {
      const state = loadModeState(process.argv[1]);
      if (state.version !== 1 || typeof state.enabled !== 'boolean') process.exit(2);
    }
  `, path], { stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  await once(child.stdout, 'data');
  for (let i = 0; i < 100; i++) saveModeState(path, { version: 1, enabled: i % 2 === 1 });
  const [code, signal] = await closed;
  assert.equal(code, 0, stderr);
  assert.equal(signal, null);
  assert.equal(loadModeState(path).enabled, true);
  assert.deepEqual(readdirSync(join(dir, 'nested')), ['mode.json']);
});
