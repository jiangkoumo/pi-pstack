import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = resolve(root, 'adapters/pi/statechart/entry.mjs');
const tools = resolve(root, 'adapters/pi/statechart/tlc-tools.mjs');

// Exercise exactly the resources a clean checkout and the published package contain.
const defaultSourceRoot = resolve(root, 'skills/statechart');

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

test('worker process inherits hook and blocks mise invocation', async () => {
  const bin = await fakeMise();
  const dir = await mkdtemp(join(tmpdir(), 'statechart-worker-'));
  try {
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      PSTACK_STATECHART_SOURCE_ROOT: defaultSourceRoot,
      TLA2TOOLS: '',
      TLA2TOOLS_JAR: '',
      JAVA: '',
    };
    delete env.TLA2TOOLS;
    delete env.TLA2TOOLS_JAR;
    delete env.JAVA;

    const out = join(dir, 'out');
    const r = spawnSync(process.execPath, [
      entry,
      resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.tla'),
      '--config', resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.cfg'),
      '--view', resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.view.mjs'),
      '--out', out,
    ], { cwd: dir, env, encoding: 'utf8', timeout: 30_000 });

    assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /Cannot find a configured TLC jar/);
    assert.match(r.stderr, /Pi never installs mise, TLC, or Java automatically/);
    assert.doesNotMatch(r.stderr, /mise ran with/, 'worker must not invoke mise');
  } finally {
    await rm(bin, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test('entry.mjs prints usage on --help and -h', () => {
  for (const flag of ['--help', '-h']) {
    const r = spawnSync(process.execPath, [entry, flag], { cwd: root, encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Usage: node <package>\/adapters\/pi\/statechart\/entry\.mjs SPEC\.tla/);
    assert.match(r.stdout, /Writes report\.md, tlc\.out, and chart\.mmd/);
    assert.match(r.stdout, /Pi never installs mise, TLC, or Java automatically/);
    assert.match(r.stdout, /Render Mermaid separately as SVG with Pele 1\.9\.0; --png is unavailable/);
  }
});

test('entry.mjs rejects removed commands and legacy options with clear migration guidance', () => {
  const rejected = [
    ['from-spec', 'CoverGap.tla'],
    ['from-chart', 'CoverGap.mmd'],
    ['render', 'CoverGap.mmd'],
    ['CoverGap.tla', '--cover'],
    ['CoverGap.tla', '--fixed=fix.tla'],
    ['CoverGap.tla', '--against=against.tla'],
    ['CoverGap.tla', '--png'],
  ];

  for (const args of rejected) {
    const r = spawnSync(process.execPath, [entry, ...args], { cwd: root, encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 2, `expected exit code 2 for args: ${args.join(' ')}`);
    assert.match(r.stderr, /Statechart CLI changed: from-spec\/from-chart and --cover\/--fixed\/--against\/--png were removed/);
    assert.match(r.stderr, /Use SPEC\.tla --config FILE --view FILE --out DIR/);
    assert.match(r.stderr, /summary\.json is replaced by report\.md and tlc\.out/);
    assert.match(r.stderr, /Render chart\.mmd separately as SVG/);
  }
});

test('hook enforces fail-closed protection when upstream run.ts changes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'fail-closed-'));
  try {
    const scriptsDir = join(temp, 'scripts');
    await mkdir(scriptsDir, { recursive: true });
    if (defaultSourceRoot && existsSync(join(defaultSourceRoot, 'scripts'))) {
      cpSync(join(defaultSourceRoot, 'scripts'), scriptsDir, { recursive: true });
    }
    // Deliberately alter run.ts so resolver string split length !== 2
    await writeFile(join(scriptsDir, 'run.ts'), '// upstream modified findTlc signature\nexport async function runChild() {}\n');

    const r = spawnSync(process.execPath, [
      entry,
      resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.tla'),
    ], {
      cwd: temp,
      env: { ...process.env, PSTACK_STATECHART_SOURCE_ROOT: temp },
      encoding: 'utf8',
      timeout: 10_000,
    });

    assert.equal(r.status, 1, `status: ${r.status}, stderr: ${r.stderr}`);
    assert.match(r.stderr, /AssertionError.*Statechart adapter no longer matches the pinned run.ts; refusing to execute/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('CoverGap runs with real TLC 1.8.0 and generates report, tlc.out, and chart.mmd', async (t) => {
  const jar = process.env.TLA2TOOLS || process.env.TLA2TOOLS_JAR;

  if (!jar) {
    t.skip('No TLC 1.8.0 jar configured or found');
    return;
  }

  const dir = await mkdtemp(join(tmpdir(), 'statechart-covergap-'));
  try {
    const out = join(dir, 'out');
    const env = {
      ...process.env,
      TLA2TOOLS: jar,
      JAVA: process.env.JAVA,
      PSTACK_STATECHART_SOURCE_ROOT: defaultSourceRoot,
    };

    const r = spawnSync(process.execPath, [
      entry,
      resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.tla'),
      '--config', resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.cfg'),
      '--view', resolve(root, 'scripts/fixtures/statechart-sync/CoverGap.view.mjs'),
      '--out', out,
    ], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 });

    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const report = await readFile(join(out, 'report.md'), 'utf8');
    assert.match(report, /# CoverGap/);
    assert.match(report, /TLC reached 4 states and 4 steps/);
    assert.match(report, /StatesKnown/);

    const chart = await readFile(join(out, 'chart.mmd'), 'utf8');
    assert.match(chart, /title: "Cover gap"/);
    assert.match(chart, /s0: queued/);
    assert.match(chart, /s1: review/);
    assert.match(chart, /s2: done/);
    assert.match(chart, /s3: waiting/);
    assert.match(chart, /s3 --> s2: Approve/);

    const tlcOut = await readFile(join(out, 'tlc.out'), 'utf8');
    assert.match(tlcOut, /No error has been found/);
    assert.match(tlcOut, /4 distinct states found/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Pele 1.9.0 renders chart.mmd to themeable SVG', async (t) => {
  const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'statechart/pele-1.9.0');
  const peleDist = join(cacheDir, 'node_modules/pele/dist/pele.js');
  if (!existsSync(peleDist)) {
    t.skip('Pele 1.9.0 not in cache');
    return;
  }

  const { render } = await import(pathToFileURL(peleDist).href);
  const sampleMmd = [
    '---',
    'title: "Cover gap"',
    '---',
    'stateDiagram-v2',
    '  s0: queued',
    '  s1: review',
    '  s2: done',
    '  s3: waiting',
    '  [*] --> s0',
    '  s0 --> s1: Start',
    '  s1 --> s2: Direct',
    '  s1 --> s3: Ask',
    '  s3 --> s2: Approve',
  ].join('\n');

  const { svg } = render(sampleMmd, { limit: 1_000_000, outputLimit: 8_000_000, maxEdges: 10_000 });
  assert.ok(svg.startsWith('<svg'), 'SVG must start with <svg');
  assert.ok(svg.includes('class="pele pele-state"'), 'SVG must include pele classes');
  assert.ok(svg.includes('s0') && svg.includes('s1') && svg.includes('s2') && svg.includes('s3'), 'SVG must include states');
});

test('adapter keeps the pinned upstream scripts byte-identical', async () => {
  const map = JSON.parse(await readFile(resolve(root, 'docs/port-map.json'), 'utf8'));
  for (const resource of map.preparedResources.filter(entry => entry.adaptation.strategy === 'verbatim')) {
    assert.deepEqual(await readFile(resolve(root, resource.destination)), await readFile(resolve(root, 'upstream', resource.source)), resource.destination);
  }
});
