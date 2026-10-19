import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = await mkdtemp(resolve(tmpdir(), 'pi-pstack-link-regression-'));
const run = (script, cwd, args = []) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { exitCode: result.status, output: result.stdout + result.stderr };
};
try {
  for (const path of ['extensions', 'skills', 'agents', 'adapters', 'upstream', 'docs', 'scripts', 'README.md', 'AGENTS.md', 'LICENSE', 'LICENSES', 'THIRD_PARTY_NOTICES.md', 'package.json']) {
    await cp(resolve(root, path), resolve(fixture, path), { recursive: true });
  }
  const original = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const historical = resolve(fixture, 'scripts/check-package.mjs');
  const oldSource = await readFile(resolve(root, 'scripts/fixtures/published-links/historical-check.mjs'), 'utf8');
  // The actual snapshot predates the map schema change; use only its defective
  // publication rule so this regression cannot fail on an unrelated old schema.
  const rule = "assert(included(target) || included(relative(root, file)), 'Published doc links an omitted file: ' + target);";
  assert(oldSource.includes(rule), 'The preserved historical snapshot must contain the actual faulty rule');
  const currentSource = await readFile(resolve(root, 'scripts/check-package.mjs'), 'utf8');
  const defectiveSource = currentSource.replace("assert(included(target), 'Published doc links an omitted file: ' + target);", rule);
  assert.notEqual(defectiveSource, currentSource);

  const rejected = [];
  let falsePass;
  for (const [omission, target] of [['docs/', 'docs/port-status.md'], ['scripts/', 'scripts/check-subagent-integration.mjs']]) {
    const manifest = { ...original, files: original.files.filter(path => path !== omission) };
    await writeFile(resolve(fixture, 'package.json'), JSON.stringify(manifest));
    if (omission === 'scripts/') {
      await writeFile(historical, defectiveSource);
      const oldResult = run(historical, fixture);
      assert.equal(oldResult.exitCode, 0, 'The historical faulty rule must falsely accept the real second omission');
      falsePass = { omitted: omission, exitCode: oldResult.exitCode };
    }
    await writeFile(historical, currentSource);
    const result = run(historical, fixture);
    assert.equal(result.exitCode, 1, 'Each actual omission must fail the same current check');
    assert(result.output.includes('Published doc links an omitted file: ' + target), 'Must fail on the publication contract, not setup');
    rejected.push({ omitted: omission, exitCode: result.exitCode, target });
  }
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify(original));
  const corrected = run(historical, fixture);
  assert.equal(corrected.exitCode, 0, corrected.output);

  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
  const included = new Set(packed.files.map(file => file.path));
  const map = JSON.parse(await readFile(resolve(root, 'docs/port-map.json'), 'utf8'));
  const sources = JSON.parse(await readFile(resolve(root, 'docs/source-files.json'), 'utf8'));
  const rebuildInputs = [map.generator, map.harness, 'docs/port-map.json', 'docs/source-files.json', 'docs/upstream-inventory.json', ...sources.files.map(source => 'upstream/' + source.path), ...map.entries.filter(entry => entry.adaptation?.strategy === 'override').map(entry => entry.adaptation.override)];
  const assertRebuildInputs = paths => {
    for (const path of rebuildInputs) assert(paths.has(path), 'Actual npm tarball omits rebuild input: ' + path);
  };
  assertRebuildInputs(included);
  for (const entry of map.entries) {
    if (entry.disposition === 'ported') {
      assert(included.has(entry.destination), 'Actual npm tarball omits ported output: ' + entry.destination);
    }
  }
  assert(![...included].some(path => path.startsWith('adapters/pi/overrides/') && path.endsWith('.md')), 'Overrides must ship as source templates, not linked Markdown documents');

  // Exercise npm's actual file selection, not a fabricated list of included paths.
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify({ ...original, files: [...original.files, '!adapters/pi/overrides/**'] }));
  const omittedTemplatesPack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
  assert.throws(() => assertRebuildInputs(new Set(omittedTemplatesPack.files.map(file => file.path))), /Actual npm tarball omits rebuild input: adapters\/pi\/overrides\//, 'A real tarball omission must fail rebuild validation');
  let checkedLinks = 0;
  for (const path of included) {
    if (!path.endsWith('.md') || path.startsWith('upstream/') || path.startsWith('scripts/')) continue;
    const content = await readFile(resolve(root, path), 'utf8');
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].split('#')[0];
      if (!href || /^[a-z]+:/i.test(href)) continue;
      const target = relative(root, resolve(dirname(resolve(root, path)), decodeURIComponent(href)));
      assert(included.has(target), 'Actual npm tarball omits linked file: ' + target);
      checkedLinks++;
    }
  }
  console.log(JSON.stringify({ status: 'passed', evidence: 'two actual project review findings', historicalFalsePass: falsePass, rejected, correctedExitCode: corrected.exitCode, packedFiles: included.size, checkedLinks, rebuildInputs: rebuildInputs.length, templateOmissionRejected: true }));
} finally {
  await rm(fixture, { recursive: true, force: true });
}
