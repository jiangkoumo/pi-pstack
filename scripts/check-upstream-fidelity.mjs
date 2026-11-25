#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function evaluateFidelity(results, map, options = {}) {
  const { recordOverall = false } = options;
  const errors = [];
  const notes = [];
  const byPath = new Map(results.map(row => [row.file, row]));
  let kept = 0;
  let upstream = 0;
  for (const row of results) {
    kept += row.kept;
    upstream += row.upstream - row.subst;
  }
  const overall = kept / Math.max(upstream, 1);
  if (overall < 0.94) {
    const message = `Overall fidelity ${(overall * 100).toFixed(4)}% < 94%`;
    // Release and CI record the 0.15.48 overall gap as an accepted limit while still gating every port at 70%.
    if (recordOverall) notes.push(`${message} (recorded only)`);
    else errors.push(message);
  }
  const ports = [
    ...map.entries.filter(entry => entry.disposition === 'ported'),
    ...(map.preparedResources ?? []),
  ];
  let portedChecked = 0;
  let minPorted = null;
  for (const entry of ports) {
    if (!entry.source.endsWith('.md')) continue;
    portedChecked++;
    const path = entry.source.replace(/^pstack\//, '');
    const row = byPath.get(path);
    if (!row) {
      errors.push(`Missing fidelity result for ported Markdown: ${path}`);
      continue;
    }
    if (row.missing) errors.push(`Missing ported file: ${path}`);
    else {
      const share = row.kept / Math.max(row.upstream - row.subst, 1);
      if (!minPorted || share < minPorted.share) minPorted = { file: path, share: Number(share.toFixed(4)) };
      if (share < 0.70) errors.push(`${path}: ${(share * 100).toFixed(2)}% < 70%`);
    }
  }
  if (!recordOverall) return { overall, kept, upstream, errors };
  return { overall, kept, upstream, errors, notes, ported: { checked: portedChecked, min: minPorted } };
}

async function main(argv = process.argv.slice(2)) {
  let recordOverall = false;
  for (const arg of argv) {
    if (arg === '--record-overall') recordOverall = true;
    else {
      console.error(`Unknown option: ${arg}`);
      process.exitCode = 1;
      return;
    }
  }
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-fidelity-'));
  try {
    const jsonPath = resolve(directory, 'report.json');
    const reportPath = resolve(root, 'docs/fidelity.md');
    const result = spawnSync('python3', [
      resolve(root, 'tools/upstream-fidelity.py'), root,
      '--out', reportPath, '--json', jsonPath,
      '--min-overall', recordOverall ? '0' : '0.94', '--flag-kept', '0.70',
      '--allow', resolve(root, 'docs/fidelity-allow.txt'),
    ], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) process.stderr.write(result.stderr);
    let rows;
    try {
      rows = JSON.parse(await readFile(jsonPath, 'utf8'));
    } catch (error) {
      if (result.status !== 0) throw new Error(`upstream-fidelity.py exited with status ${result.status}`);
      throw error;
    }
    const map = JSON.parse(await readFile(resolve(root, 'docs/port-map.json'), 'utf8'));
    const verdict = evaluateFidelity(rows, map, { recordOverall });
    console.log(JSON.stringify({ status: result.status === 0 && !verdict.errors.length ? 'passed' : 'failed', files: rows.length, ...verdict }));
    if (verdict.errors.length) console.error(verdict.errors.join('\n'));
    if (result.status !== 0 || verdict.errors.length) process.exitCode = 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
