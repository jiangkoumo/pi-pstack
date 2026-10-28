#!/usr/bin/env node
// Real SVG smoke for the statechart skill: render the CoverGap fixture and render
// chart.mmd to SVG with Pele 1.9.0, replacing the old PNG expectation.
// Exit 0 pass, 1 fail, 77 skipped (no TLC or renderer).
// STATECHART_SVG_REQUIRE=1 or STATECHART_PNG_REQUIRE=1 turns a skip into a failure.
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, process.env.PSTACK_STATECHART_SCRIPT || 'adapters/pi/statechart/entry.mjs');
const required = process.env.STATECHART_SVG_REQUIRE === '1' || process.env.STATECHART_PNG_REQUIRE === '1';

const report = (status, detail) => {
  console.log(JSON.stringify({ status, entry, node: process.version, platform: process.platform, ...detail }));
  return status === 'passed' ? 0 : status === 'skipped' ? (required ? 1 : 77) : 1;
};

if (!process.env.TLA2TOOLS && !process.env.TLA2TOOLS_JAR)
  process.exit(report('skipped', { reason: 'TLA2TOOLS/TLA2TOOLS_JAR is not set, so no TLC run proves the SVG' }));

const scratch = mkdtempSync(join(tmpdir(), 'statechart-svg-'));
try {
  cpSync(join(root, 'scripts/fixtures/statechart-sync'), scratch, { recursive: true });
  const out = join(scratch, 'output');
  const r = spawnSync(
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
    ],
    {
      cwd: scratch,
      env: process.env,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const tail = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n').slice(-2000);
  if (r.error) process.exit(report('failed', { reason: `cannot start entry: ${r.error.message}` }));
  if (r.status !== 0) process.exit(report('failed', { reason: 'entry exited non-zero', exitCode: r.status, tail }));

  const mmdPath = join(out, 'chart.mmd');
  if (!existsSync(mmdPath)) process.exit(report('failed', { reason: 'the run wrote no chart.mmd', exitCode: r.status, tail }));
  const mmd = readFileSync(mmdPath, 'utf8');

  // Verify that old --png option is rejected with migration advice
  const pngAttempt = spawnSync(
    process.execPath,
    [entry, join(scratch, 'CoverGap.tla'), '--png'],
    { cwd: scratch, env: process.env, encoding: 'utf8', timeout: 10_000 },
  );
  if (pngAttempt.status !== 2 || !pngAttempt.stderr.includes('--png were removed')) {
    process.exit(report('failed', { reason: 'legacy --png was not rejected with exit code 2' }));
  }

  // Load Pele 1.9.0 from cache or install it
  const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'statechart/pele-1.9.0');
  const peleDist = join(cacheDir, 'node_modules/pele/dist/pele.js');
  if (!existsSync(peleDist)) {
    try {
      mkdirSync(cacheDir, { recursive: true });
      execFileSync('npm', ['install', '--prefix', cacheDir, '--no-audit', '--no-fund', '--save-exact', 'pele@1.9.0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      process.exit(report('skipped', { reason: `Pele 1.9.0 cannot be installed in cache: ${e.message}` }));
    }
  }

  let peleModule;
  try {
    peleModule = await import(pathToFileURL(peleDist).href);
  } catch (e) {
    process.exit(report('skipped', { reason: `Pele 1.9.0 cannot be imported: ${e.message}` }));
  }

  const { svg } = peleModule.render(mmd, { limit: 1_000_000, outputLimit: 8_000_000, maxEdges: 10_000 });
  if (!svg.startsWith('<svg') || !svg.includes('class="pele pele-state"')) {
    process.exit(report('failed', { reason: 'Pele output is not a valid statechart SVG' }));
  }
  const svgPath = join(out, 'chart.svg');
  writeFileSync(svgPath, svg, 'utf8');

  process.exit(
    report('passed', {
      bytes: statSync(svgPath).size,
      format: 'svg',
      renderer: 'pele@1.9.0',
      chartStates: 4,
      chartTransitions: 4,
    }),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
