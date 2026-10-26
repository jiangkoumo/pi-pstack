import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tools = resolve(root, 'adapters/pi/statechart/tlc-tools.mjs');

function findWith(env) {
  const script = `import { findTlc } from ${JSON.stringify(new URL('file://' + tools).href)}; try { console.log(JSON.stringify(findTlc())); } catch (e) { console.error(e.message); process.exitCode = 1; }`;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 60_000,
  });
}

async function fakeMise() {
  const bin = await mkdtemp(join(tmpdir(), 'statechart-no-mise-'));
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'mise'), '#!/bin/sh\necho "mise ran with $*" >&2\nexit 97\n', { mode: 0o755 });
  return bin;
}

test('Pi adapter never installs TLC through mise and explains how to install it', async () => {
  const bin = await fakeMise();
  try {
    const r = findWith({ TLA2TOOLS: undefined, TLA2TOOLS_JAR: undefined, JAVA: undefined, PATH: bin + ':' + (process.env.PATH ?? '') });
    assert.equal(r.status, 1, r.stdout);
    assert.doesNotMatch(r.stderr, /mise ran with/);
    assert.match(r.stderr, /Pi never installs mise, TLC, or Java automatically/);
    assert.match(r.stderr, /TLA2TOOLS/);
  } finally { await rm(bin, { recursive: true, force: true }); }
});

test('Pi adapter uses one absolute configured jar and refuses conflicts or relative paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'statechart-adapter-'));
  try {
    const jar = join(dir, 'tla2tools.jar');
    await writeFile(jar, 'not really a jar');
    const conflict = findWith({ TLA2TOOLS: jar, TLA2TOOLS_JAR: join(dir, 'other.jar'), JAVA: undefined });
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /Conflicting TLA2TOOLS and TLA2TOOLS_JAR paths/);
    const relative = findWith({ TLA2TOOLS: 'tla2tools.jar', TLA2TOOLS_JAR: undefined, JAVA: undefined });
    assert.equal(relative.status, 1);
    assert.match(relative.stderr, /absolute path/);
    const ok = findWith({ TLA2TOOLS: jar, TLA2TOOLS_JAR: undefined, JAVA: '/bin/sh' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).jar, await realpath(jar));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('adapter keeps the pinned upstream scripts byte-identical', async () => {
  const map = JSON.parse(await readFile(resolve(root, 'docs/port-map.json'), 'utf8'));
  for (const resource of map.preparedResources.filter(entry => entry.adaptation.strategy === 'verbatim')) {
    assert.deepEqual(await readFile(resolve(root, resource.destination)), await readFile(resolve(root, 'upstream', resource.source)), resource.destination);
  }
});
