#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function evaluateFidelity(results, map) {
  const errors = [];
  const byPath = new Map(results.map(row => [row.file, row]));
  let kept = 0;
  let upstream = 0;
  for (const row of results) {
    kept += row.kept;
    upstream += row.upstream - row.subst;
  }
  const overall = kept / Math.max(upstream, 1);
  if (overall < 0.94) errors.push(`Overall fidelity ${(overall * 100).toFixed(4)}% < 94%`);
  const ports = [
    ...map.entries.filter(entry => entry.disposition === 'ported'),
    ...(map.preparedResources ?? []),
  ];
  for (const entry of ports) {
    if (!entry.source.endsWith('.md')) continue;
    const path = entry.source.replace(/^pstack\//, '');
    const row = byPath.get(path);
    if (!row) {
      errors.push(`Missing fidelity result for ported Markdown: ${path}`);
      continue;
    }
    if (row.missing) errors.push(`Missing ported file: ${path}`);
    else {
      const share = row.kept / Math.max(row.upstream - row.subst, 1);
      if (share < 0.70) errors.push(`${path}: ${(share * 100).toFixed(2)}% < 70%`);
    }
  }
  return { overall, kept, upstream, errors };
}

async function main() {
  const directory = await mkdtemp(resolve(tmpdir(), 'pstack-fidelity-'));
  try {
    const jsonPath = resolve(directory, 'report.json');
    const reportPath = resolve(root, 'docs/fidelity.md');
    const result = spawnSync('python3', [
      resolve(root, 'tools/upstream-fidelity.py'), root,
      '--out', reportPath, '--json', jsonPath,
      '--min-overall', '0.94', '--flag-kept', '0.70',
      '--allow', resolve(root, 'docs/fidelity-allow.txt'),
    ], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
    if (result.error) throw result.error;
    const rows = JSON.parse(await readFile(jsonPath, 'utf8'));
    const map = JSON.parse(await readFile(resolve(root, 'docs/port-map.json'), 'utf8'));
    const verdict = evaluateFidelity(rows, map);
    console.log(JSON.stringify({ status: result.status === 0 && !verdict.errors.length ? 'passed' : 'failed', files: rows.length, ...verdict }));
    if (result.status !== 0) process.stderr.write(result.stderr);
    if (verdict.errors.length) console.error(verdict.errors.join('\n'));
    if (result.status !== 0 || verdict.errors.length) process.exitCode = 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
