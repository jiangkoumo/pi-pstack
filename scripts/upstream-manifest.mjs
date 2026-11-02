#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_MANIFEST_REL = 'docs/upstream-manifest.json';

export function normalizeLf(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  return Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
}

export function sha256Lf(input) {
  return createHash('sha256').update(normalizeLf(input)).digest('hex');
}

async function readJson(root, relPath) {
  return JSON.parse(await readFile(resolve(root, relPath), 'utf8'));
}

/**
 * Collect the repository paths that must match upstream verbatim (after CRLF->LF):
 * 1. Every archived upstream snapshot file in `docs/source-files.json` (`upstream/<path>`).
 * 2. Every `verbatim` resource in `docs/port-map.json` (`skills/statechart/scripts/**` and `skills/statechart/references/render.md`).
 * Port-adapted files (`override` or `inherit-body`, managed under `adapters/pi`) are intentionally excluded.
 */
export async function collectExpectedManifestMappings(root = DEFAULT_ROOT) {
  const [sources, map] = await Promise.all([
    readJson(root, 'docs/source-files.json'),
    readJson(root, 'docs/port-map.json'),
  ]);
  assert.equal(map.commit, sources.commit, `commit mismatch between port-map (${map.commit}) and source-files (${sources.commit})`);

  const adaptedDestinations = new Set();
  for (const entry of [...(map.entries ?? []), ...(map.preparedResources ?? []), ...(map.nativeResources ?? [])]) {
    if (!entry.destination) continue;
    if (entry.adaptation?.strategy !== 'verbatim') {
      adaptedDestinations.add(entry.destination);
    }
  }

  const mappings = new Map();
  for (const entry of sources.files ?? []) {
    const repoPath = posix.normalize(`upstream/${entry.path}`);
    mappings.set(repoPath, entry.path);
  }
  for (const resource of (map.preparedResources ?? []).filter(entry => entry.adaptation?.strategy === 'verbatim')) {
    const repoPath = posix.normalize(resource.destination);
    assert(!adaptedDestinations.has(repoPath), `Adapted resource must not be in upstream manifest: ${repoPath}`);
    mappings.set(repoPath, resource.source);
  }

  return {
    commit: sources.commit,
    mappings,
    adaptedDestinations,
  };
}

function resolveUpstreamSha(fromDir, shaArg) {
  const resolved = execFileSync('git', ['-C', fromDir, 'rev-parse', `${shaArg}^{commit}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const head = execFileSync('git', ['-C', fromDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  assert(
    head === resolved,
    `Upstream checkout at ${fromDir} is at ${head}, expected ${resolved} (from --sha ${shaArg})`,
  );
  return resolved;
}

export async function generateUpstreamManifest({
  root = DEFAULT_ROOT,
  fromDir,
  sha,
  outPath = resolve(root, DEFAULT_MANIFEST_REL),
} = {}) {
  assert(fromDir, 'Missing required --from <upstream-dir>');
  assert(sha, 'Missing required --sha <SHA>');
  const resolvedFrom = resolve(fromDir);
  const upstreamSha = resolveUpstreamSha(resolvedFrom, sha);
  const { commit, mappings } = await collectExpectedManifestMappings(root);
  assert.equal(
    upstreamSha,
    commit,
    `Requested --sha ${upstreamSha} does not match docs/source-files.json commit ${commit}`,
  );

  const sortedRepoPaths = [...mappings.keys()].sort();
  const files = {};
  for (const repoPath of sortedRepoPaths) {
    const upstreamRel = mappings.get(repoPath);
    const bytes = await readFile(resolve(resolvedFrom, upstreamRel));
    files[repoPath] = sha256Lf(bytes);
  }

  const manifest = { upstreamSha, files };
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

export async function verifyUpstreamManifest(root = DEFAULT_ROOT, options = {}) {
  const manifestPath = options.manifestPath ?? resolve(root, DEFAULT_MANIFEST_REL);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { commit, mappings, adaptedDestinations } = await collectExpectedManifestMappings(root);
  const mismatches = [];

  if (manifest.upstreamSha !== commit) {
    mismatches.push(
      `upstreamSha: mismatch (expected ${commit}, actual ${manifest.upstreamSha ?? '<missing>'})`,
    );
  }

  const manifestFiles = manifest.files ?? {};
  for (const repoPath of Object.keys(manifestFiles)) {
    if (adaptedDestinations.has(repoPath)) {
      mismatches.push(
        `${repoPath}: port-adapted file must not be in upstream-manifest.json`,
      );
    } else if (!mappings.has(repoPath)) {
      mismatches.push(
        `${repoPath}: unexpected path in upstream-manifest.json (not in source-files.json or verbatim preparedResources)`,
      );
    }
  }

  for (const repoPath of [...mappings.keys()].sort()) {
    const expectedHash = manifestFiles[repoPath];
    if (!expectedHash) {
      mismatches.push(`${repoPath}: missing from upstream-manifest.json (expected sha256 entry, actual <missing>)`);
      continue;
    }
    let bytes;
    try {
      bytes = await readFile(resolve(root, repoPath));
    } catch (error) {
      if (error.code === 'ENOENT') {
        mismatches.push(`${repoPath}: file missing on disk (expected ${expectedHash}, actual <missing>)`);
        continue;
      }
      throw error;
    }
    const actualHash = sha256Lf(bytes);
    if (actualHash !== expectedHash) {
      mismatches.push(`${repoPath}: sha256 mismatch (expected ${expectedHash}, actual ${actualHash})`);
    }
  }

  return {
    ok: mismatches.length === 0,
    upstreamSha: manifest.upstreamSha,
    checked: Object.keys(manifestFiles).length,
    mismatches,
  };
}

export async function assertUpstreamManifest(root = DEFAULT_ROOT, options = {}) {
  const result = await verifyUpstreamManifest(root, options);
  assert.equal(
    result.ok,
    true,
    `Upstream sha256 manifest verification failed:\n${result.mismatches.join('\n')}`,
  );
  return result;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/upstream-manifest.mjs --from <upstream-dir> --sha <SHA> [--root <repo-root>] [--out <manifest-path>]',
    '  node scripts/upstream-manifest.mjs --check [--root <repo-root>] [--manifest <manifest-path>]',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  let mode = null;
  let fromDir = null;
  let sha = null;
  let root = DEFAULT_ROOT;
  let manifestPath = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      mode = 'check';
    } else if (arg === '--from') {
      fromDir = argv[++i];
    } else if (arg === '--sha') {
      sha = argv[++i];
    } else if (arg === '--root') {
      root = resolve(argv[++i]);
    } else if (arg === '--out' || arg === '--manifest') {
      manifestPath = resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return 0;
    } else {
      console.error(`upstream-manifest: unknown argument ${arg}\n${usage()}`);
      return 2;
    }
  }

  if (mode === 'check') {
    const result = await verifyUpstreamManifest(root, {
      manifestPath: manifestPath ?? resolve(root, DEFAULT_MANIFEST_REL),
    });
    if (!result.ok) {
      for (const mismatch of result.mismatches) {
        console.error(`upstream-manifest: FAIL ${mismatch}`);
      }
      return 1;
    }
    console.log(JSON.stringify({ status: 'passed', upstreamSha: result.upstreamSha, checked: result.checked }));
    return 0;
  }

  if (fromDir && sha) {
    const outPath = manifestPath ?? resolve(root, DEFAULT_MANIFEST_REL);
    const manifest = await generateUpstreamManifest({ root, fromDir, sha, outPath });
    console.log(JSON.stringify({
      status: 'generated',
      upstreamSha: manifest.upstreamSha,
      files: Object.keys(manifest.files).length,
      manifest: outPath,
    }));
    return 0;
  }

  console.error(usage());
  return 2;
}

if (process.argv[1] && pathToFileURL(realpathSync(resolve(process.argv[1]))).href === import.meta.url) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message ?? error);
    process.exitCode = 1;
  }
}
