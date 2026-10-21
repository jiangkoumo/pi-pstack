#!/usr/bin/env node
// Local CI-equivalent check: clone the committed HEAD into a temp directory and
// run the same commands as .github/workflows/check.yml.
//
// This proves the workflow commands work from a clean checkout (no untracked
// files or local build state). It is not a GitHub Actions run and does not
// claim runner availability.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('..', import.meta.url));
const workflow = await readFile(resolve(root, '.github/workflows/check.yml'), 'utf8');
assert(workflow.includes('npm test'), 'Workflow must run npm test');
assert(workflow.includes('npm ci --include=dev'), 'Workflow must install locked devDependencies');
assert(workflow.includes('npm run check:generate'), 'Workflow must run npm run check:generate');
assert(workflow.includes('node-version: "22"'), 'Workflow must pin Node 22');

const directory = await mkdtemp(resolve(tmpdir(), 'pstack-ci-local-'));
const checkout = resolve(directory, 'checkout');
const agentDir = resolve(directory, 'agent');
const env = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  npm_config_cache: process.env.npm_config_cache || resolve(directory, 'npm-cache'),
};

function run(command, args, cwd = checkout) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

let summary;
try {
  run('git', ['clone', '-q', '--no-hardlinks', root, checkout], directory);
  const status = run('git', ['status', '--porcelain']);
  assert.equal(status.trim(), '', 'Clean clone must have no working-tree changes');
  const head = run('git', ['rev-parse', 'HEAD']).trim();

  const checks = [];
  const installAndTestStarted = performance.now();
  run('npm', ['ci', '--include=dev']);
  const testOutput = run('npm', ['test']);
  const installAndTestDurationMs = Math.round(performance.now() - installAndTestStarted);
  assert(installAndTestDurationMs < 180000, `npm ci && npm test exceeded 180s: ${installAndTestDurationMs}ms`);
  const totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  for (const match of testOutput.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm)) totals[match[1]] += Number(match[2]);
  checks.push({ command: 'npm ci --include=dev && npm test', status: 'passed', durationMs: installAndTestDurationMs, ...totals });
  for (const [label, args] of [
    ['npm run check:generate', ['run', 'check:generate']],
    ['npm run check:fidelity', ['run', 'check:fidelity']],
  ]) {
    const started = Date.now();
    const output = run('npm', args);
    checks.push({ command: label, status: 'passed', durationMs: Date.now() - started, tail: output.trim().split('\n').slice(-3) });
  }

  summary = {
    status: 'passed',
    validationLayer: 'local CI-equivalent: git clone of committed HEAD + workflow commands; no GitHub runner',
    commit: head,
    workspace: 'committed files only; clone git status clean',
    checks,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
