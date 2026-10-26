#!/usr/bin/env node
// Real PNG smoke for the statechart skill: render the CoverGap fixture with --png and check that
// the file is a PNG with sane dimensions. Exit 0 pass, 1 fail, 77 skipped (no TLC or renderer).
// STATECHART_PNG_REQUIRE=1 turns a skip into a failure, for CI matrix jobs that must prove the run.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, process.env.PSTACK_STATECHART_SCRIPT || 'adapters/pi/statechart/entry.mjs');
const required = process.env.STATECHART_PNG_REQUIRE === '1';

const report = (status, detail) => {
  console.log(JSON.stringify({ status, entry, node: process.version, platform: process.platform, ...detail }));
  return status === 'passed' ? 0 : status === 'skipped' ? (required ? 1 : 77) : 1;
};

if (!process.env.TLA2TOOLS && !process.env.TLA2TOOLS_JAR)
  process.exit(report('skipped', { reason: 'TLA2TOOLS/TLA2TOOLS_JAR is not set, so no TLC run proves the PNG' }));

const scratch = mkdtempSync(join(tmpdir(), 'statechart-png-'));
try {
  cpSync(join(root, 'scripts/fixtures/statechart-sync'), scratch, { recursive: true });
  const out = join(scratch, 'output');
  const r = spawnSync(
    process.execPath,
    [entry, 'from-spec', join(scratch, 'CoverGap.tla'), '--out', out, '--title', 'Cover gap', '--png'],
    { cwd: scratch, env: process.env, encoding: 'utf8', timeout: 600_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const tail = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n').slice(-2000);
  if (r.error) process.exit(report('failed', { reason: `cannot start entry: ${r.error.message}` }));
  const png = join(out, 'chart.png');
  let buf;
  try {
    buf = readFileSync(png);
  } catch {
    const noRenderer = /could not render|PNG unavailable|pele|resvg|ECONNREFUSED|ENOTFOUND|npm install/i.test(tail);
    process.exit(
      report(noRenderer ? 'skipped' : 'failed', {
        reason: noRenderer ? 'the PNG renderer is unavailable' : 'the run wrote no chart.png',
        exitCode: r.status,
        tail,
      }),
    );
  }
  const magic = [...buf.subarray(0, 8)];
  const signature = '89504e470d0a1a0a';
  const hex = Buffer.from(magic).toString('hex');
  if (hex !== signature) process.exit(report('failed', { reason: `not a PNG: ${hex}`, exitCode: r.status }));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!(width > 100 && height > 100))
    process.exit(report('failed', { reason: `PNG is too small: ${width}x${height}`, exitCode: r.status }));
  if (r.status !== 0)
    process.exit(report('failed', { reason: 'the command exited non-zero after writing the PNG', exitCode: r.status, tail }));
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  if (summary.chartStates !== 4 || summary.chartTransitions !== 4)
    process.exit(
      report('failed', {
        reason: 'the rendered chart does not match the 4 states and 4 transitions of the fixture',
        chartStates: summary.chartStates,
        chartTransitions: summary.chartTransitions,
      }),
    );
  process.exit(
    report('passed', {
      bytes: statSync(png).size,
      width,
      height,
      chartStates: summary.chartStates,
      chartTransitions: summary.chartTransitions,
    }),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
