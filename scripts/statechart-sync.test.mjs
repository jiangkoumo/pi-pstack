import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, process.env.PSTACK_STATECHART_SCRIPT || 'adapters/pi/statechart/entry.mjs');
const rawNote = 'PSTACK_STATECHART_SCRIPT=skills/statechart/scripts/statechart.mjs reproduces the pre-fix failure';

const hasEntry = { skip: existsSync(entry) ? false : `no statechart entry at ${entry}; ${rawNote}` };
const hasTlc = { skip: process.env.TLA2TOOLS || process.env.TLA2TOOLS_JAR ? false : 'set TLA2TOOLS or TLA2TOOLS_JAR to the 1.8.0 tla2tools.jar' };
const needs = hasEntry.skip ? hasEntry : hasTlc;

function runFixture(t, flags = []) {
  const scratch = mkdtempSync(join(tmpdir(), 'statechart-sync-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  cpSync(join(root, 'scripts/fixtures/statechart-sync'), scratch, { recursive: true });
  const out = join(scratch, 'output');
  const result = spawnSync(
    process.execPath,
    [
      entry,
      join(scratch, 'CoverGap.tla'),
      '--config',
      join(scratch, 'CoverGap.cfg'),
      '--view',
      join(scratch, 'CoverGap.view.mjs'),
      '--out',
      out,
      ...flags,
    ],
    {
      cwd: scratch,
      env: {
        ...process.env,
        PSTACK_STATECHART_SOURCE_ROOT: process.env.PSTACK_STATECHART_SOURCE_ROOT || '/tmp/pi-pstack-01534-source/pstack/skills/statechart',
      },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return {
    report: readFileSync(join(out, 'report.md'), 'utf8'),
    chart: readFileSync(join(out, 'chart.mmd'), 'utf8'),
    tlc: readFileSync(join(out, 'tlc.out'), 'utf8'),
    output: `${result.stdout}\n${result.stderr}`,
  };
}

test('CoverGap runs with TLC and view module, generating report, tlc.out, and chart.mmd', needs, (t) => {
  const { report, chart, tlc, output } = runFixture(t);
  assert.match(tlc, /No error has been found/);
  assert.match(tlc, /4 distinct states found/);
  assert.match(output, /StatesKnown/);
  assert.match(report, /TLC reached 4 states and 4 steps/);
  assert.match(report, /StatesKnown/);
  assert.match(chart, /title: "Cover gap"/);
  assert.match(chart, /s0: queued/);
  assert.match(chart, /s1: review/);
  assert.match(chart, /s2: done/);
  assert.match(chart, /s3: waiting/);
  assert.match(chart, /s3 --> s2: Approve/);
  assert.equal([...chart.matchAll(/^ {2}s\d+ --> s\d+:/gm)].length, 4);
});

test('legacy options like --cover and from-spec are rejected with migration guidance', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'statechart-sync-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  cpSync(join(root, 'scripts/fixtures/statechart-sync'), scratch, { recursive: true });
  const out = join(scratch, 'output');
  const coverResult = spawnSync(
    process.execPath,
    [entry, join(scratch, 'CoverGap.tla'), '--cover', '--out', out],
    { cwd: scratch, env: process.env, encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(coverResult.status, 2);
  assert.match(coverResult.stderr, /Statechart CLI changed: from-spec\/from-chart and --cover\/--fixed\/--against\/--png were removed/);

  const fromSpecResult = spawnSync(
    process.execPath,
    [entry, 'from-spec', join(scratch, 'CoverGap.tla')],
    { cwd: scratch, env: process.env, encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(fromSpecResult.status, 2);
  assert.match(fromSpecResult.stderr, /Statechart CLI changed/);
});
