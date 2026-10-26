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

// The adapter is the default entry. Until it exists the regression is reported as skipped, so the
// old CLI reproduces the failure without breaking unrelated `npm test` runs.
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
      'from-spec',
      join(scratch, 'CoverGap.tla'),
      '--out',
      out,
      '--title',
      'Cover gap',
      ...flags,
    ],
    {
      cwd: scratch,
      env: process.env,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return {
    summary: JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')),
    chart: readFileSync(join(out, 'chart.mmd'), 'utf8'),
    tlc: readFileSync(join(out, 'tlc/CoverGap.out'), 'utf8'),
    output: `${result.stdout}\n${result.stderr}`,
  };
}

test('CoverGap keeps all 4 model transitions by default even with readerActions', needs, (t) => {
  const { summary, chart, tlc, output } = runFixture(t);
  assert.match(tlc, /No error has been found/);
  assert.match(tlc, /4 distinct states found/);
  assert.match(output, /StatesKnown holds\./);
  assert.equal(summary.modelStates, 4);
  assert.equal(summary.modelTransitions, 4);
  assert.equal(summary.chartStates, 4);
  assert.equal(summary.chartTransitions, 4, 'readerActions must not silently enable --cover');
  assert.match(output, /Chart: 4 states and 4 transitions/);
  assert.equal(summary.cover, undefined, 'only an explicit --cover may report cover');
  assert.match(chart, /^\s+s3 --> s0\s*:/m, 'waiting -> done must stay in the overview');
  assert.match(chart, /you approve the decision/);
  assert.equal([...chart.matchAll(/^\s+s\d+ --> s\d+\s*:/gm)].length, 4);
});

test('--cover is explicit and reports left-out transitions with upstream cover fields', needs, (t) => {
  const { summary, chart, output } = runFixture(t, ['--cover']);
  assert.equal(summary.chartStates, 4);
  assert.equal(summary.chartTransitions, 3);
  assert.doesNotMatch(chart, /^\s+s3 --> s0\s*:/m);
  assert.deepEqual(Object.keys(summary.cover).sort(), [
    'drawn',
    'leftOutStates',
    'leftOutTransitions',
    'states',
    'transitions',
  ]);
  assert.equal(summary.cover.drawn, true);
  assert.equal(summary.cover.states, 4);
  assert.equal(summary.cover.transitions, 4);
  assert.deepEqual(summary.cover.leftOutStates, []);
  assert.equal(summary.cover.leftOutTransitions.length, 1);
  assert.match(summary.cover.leftOutTransitions[0], /waiting --> done: you approve the decision/);
  assert.match(
    output,
    /--cover leaves out 0 of 4 states and 1 of 4 transitions/,
    'CLI reports the crop counts, as the upstream statechart.mjs does',
  );
});
