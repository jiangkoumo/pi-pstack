#!/usr/bin/env node
/**
 * Real Codebase End-to-End Simulation Test for pi-pstack
 *
 * Simulates a real software project workflow using the ported pstack package:
 * 1. Initialize a realistic repository with TypeScript business logic and failing tests
 * 2. Load the pi-pstack package via Pi 1.3.0 SDK in an isolated environment
 * 3. Activate /poteto-mode on
 * 4. Execute /loop run with a real shell stop predicate (node --test)
 * 5. Verify the loop automatically iterates and halts upon test success (predicate-satisfied)
 * 6. Execute mechanical review gate on the generated change
 * 7. Confirm final repository invariants and test exit codes
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed Pi package root');

const {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  ModelRuntime,
} = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));

const tempDirectory = await mkdtemp(resolve(tmpdir(), 'pstack-real-sim-'));
const agentDir = resolve(tempDirectory, 'agent');
const repoDir = resolve(tempDirectory, 'real-repo');
const sessionDir = resolve(tempDirectory, 'sessions');

function git(args, cwd = repoDir) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

let turnStep = 0;
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'real-sim', object: 'chat.completion.chunk', created: 1, model: 'fixture' };

  turnStep++;
  if (turnStep === 1) {
    // Turn 1: Model investigates but test is still failing
    response.write('data: ' + JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Investigating ledger calculation bug. Need to fix division precision.' }, finish_reason: null }]
    }) + '\n\n');
  } else if (turnStep === 2) {
    // Turn 2: Simulate model applying the fix to calculator.js
    const fixedCode = `
export function calculateTax(amount, rate) {
  // Fixed precision calculation
  return Math.round(amount * rate * 100) / 100;
}
export function splitTotal(total, parts) {
  const base = Math.floor((total / parts) * 100) / 100;
  const remainder = Math.round((total - base * parts) * 100) / 100;
  const result = new Array(parts).fill(base);
  result[0] = Math.round((result[0] + remainder) * 100) / 100;
  return result;
}
`;
    await writeFile(resolve(repoDir, 'src/calculator.js'), fixedCode.trim() + '\n');

    response.write('data: ' + JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Applied precision fix to calculateTax and splitTotal.' }, finish_reason: null }]
    }) + '\n\n');
  } else {
    response.write('data: ' + JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Done.' }, finish_reason: null }]
    }) + '\n\n');
  }

  response.write('data: ' + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
  response.end('data: [DONE]\n\n');
});

await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const port = server.address().port;

try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(resolve(repoDir, 'src'), { recursive: true });
  await mkdir(resolve(repoDir, 'test'), { recursive: true });

  // 1. Setup realistic business repository
  git(['init', '-q']);
  git(['config', 'user.email', 'engineer@company.example']);
  git(['config', 'user.name', 'Staff Engineer']);

  // Buggy implementation
  const buggyCode = `
export function calculateTax(amount, rate) {
  // Buggy: floating point drift
  return amount * rate;
}
export function splitTotal(total, parts) {
  return new Array(parts).fill(total / parts);
}
`;
  await writeFile(resolve(repoDir, 'src/calculator.js'), buggyCode.trim() + '\n');

  // Realistic strict test suite
  const testCode = `
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTax, splitTotal } from '../src/calculator.js';

test('calculateTax handles floating rounding accurately', () => {
  // 10.05 * 0.07 in float is 0.7035000000000001
  assert.equal(calculateTax(10.05, 0.07), 0.70);
});

test('splitTotal guarantees exact penny sum without loss', () => {
  const parts = splitTotal(100.00, 3);
  const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
  assert.equal(sum, 100.00);
});
`;
  await writeFile(resolve(repoDir, 'test/calculator.test.mjs'), testCode.trim() + '\n');
  await writeFile(resolve(repoDir, 'package.json'), JSON.stringify({ name: 'ledger-app', type: 'module' }));

  git(['add', '.']);
  git(['commit', '-m', 'feat: initial ledger calculation module with buggy precision']);
  const baselineCommit = git(['rev-parse', 'HEAD']);

  // Verify baseline test fails
  let initialTestPass = true;
  try {
    execFileSync('node', ['--test', 'test/calculator.test.mjs'], { cwd: repoDir, stdio: 'ignore' });
  } catch {
    initialTestPass = false;
  }
  assert.equal(initialTestPass, false, 'Baseline test must fail before loop execution');
  console.log('✓ Baseline: Real test suite fails as expected');

  // 2. Setup Pi host environment
  const modelsPath = resolve(agentDir, 'models.json');
  await writeFile(modelsPath, JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: 'openai-completions',
        apiKey: 'test-only',
        models: [{
          id: 'model',
          name: 'Simulation Model',
          reasoning: false,
          input: ['text'],
          contextWindow: 64000,
          maxTokens: 1024,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }]
      }
    }
  }));

  const runtime = await ModelRuntime.create({
    authPath: resolve(agentDir, 'auth.json'),
    modelsPath,
    allowModelNetwork: false,
  });
  const model = runtime.getModel('fixture', 'model');
  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: 'always',
    compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1024 },
    retry: { enabled: false }
  });

  const loader = new DefaultResourceLoader({
    cwd: repoDir,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [root],
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true
  });
  await loader.reload();
  assert.equal(loader.getExtensions().errors.length, 0);

  const manager = SessionManager.create(repoDir, sessionDir);
  const { session } = await createAgentSession({
    cwd: repoDir,
    agentDir,
    settingsManager,
    modelRuntime: runtime,
    model,
    resourceLoader: loader,
    sessionManager: manager,
    tools: [],
    sessionStartEvent: { type: 'session_start', reason: 'startup' }
  });
  await session.bindExtensions({ mode: 'rpc', onError: e => { throw e; } });

  // 3. Test /poteto-mode activation
  await session.prompt('/poteto-mode on');
  const modeEntry = manager.getBranch().filter(e => e.customType === 'pstack.mode.v1').at(-1)?.data;
  assert.equal(modeEntry?.enabled, true, 'Mode entry on active branch must be enabled');
  console.log('✓ Poteto-mode activated with persistent branch entry');

  // 4. Run /loop against the real repository test predicate
  const loopCommand = '/loop run --max-turns 4 --until "node --test test/calculator.test.mjs" fix precision calculation in calculator.js';
  console.log(`✓ Running /loop command: ${loopCommand}`);
  await session.prompt(loopCommand);
  await session.waitForIdle();

  // 5. Verify loop halted upon predicate satisfaction
  const branch = manager.getBranch();
  const loopEntries = branch.filter(e => e.type === 'custom' && e.customType === 'pstack.loop.v1');
  assert(loopEntries.length >= 2, 'Loop must generate state entries');
  const finalState = loopEntries.at(-1).data;

  assert.equal(finalState.status, 'completed', 'Final loop status must be completed');
  assert.equal(finalState.reason, 'predicate-satisfied', 'Halt reason must be predicate-satisfied');
  assert.equal(finalState.turn, 2, 'Must solve the problem in 2 turns');
  assert.equal(finalState.lastPredicateResult?.exitCode, 0, 'Predicate exit code must be 0');
  console.log('✓ Loop successfully converged: predicate exit code 0 achieved in 2 turns');

  // 6. Verify real test suite now passes in the repository
  const testOutput = execFileSync('node', ['--test', 'test/calculator.test.mjs'], { cwd: repoDir, encoding: 'utf8' });
  assert(testOutput.includes('pass 2'), 'All 2 tests in test suite must pass');
  console.log('✓ Verification: Real repo test suite passes cleanly');

  // 7. Mechanical Review Gate Integration
  // Extract the patch accurately using cached binary diff
  git(['add', 'src/calculator.js']);
  const patch = execFileSync('git', ['diff', '--cached', '--binary', 'HEAD'], { cwd: repoDir, encoding: 'utf8' });
  assert(patch.includes('Math.round'), 'Patch must contain the precision fix');
  const patchPath = resolve(tempDirectory, 'fix.patch');
  await writeFile(patchPath, patch);

  // Reset working tree to clean baseline HEAD to prove gate safely validates and applies it
  git(['reset', '--hard', 'HEAD']);
  assert.equal(git(['status', '--porcelain']), '', 'Repository must be clean before gate apply');

  // Compute sha256 of patch
  const crypto = await import('node:crypto');
  const patchSha256 = crypto.createHash('sha256').update(patch).digest('hex');

  // Simulate an independent review from pstack.comment-sicko
  const reviewFile = resolve(tempDirectory, 'review.json');
  await writeFile(reviewFile, JSON.stringify({
    version: 1,
    verdict: 'pass',
    baseCommit: baselineCommit,
    patchSha256,
    reviewer: {
      runId: 'independent-review-01',
      model: 'opendesign/deepseek-v4.1-flash:high',
      tools: ['find', 'grep', 'ls', 'read']
    },
    findings: [
      { severity: 'info', issue: 'Precision rounding conforms to standard monetary accounting practices.' }
    ]
  }, null, 2));

  // Run the mechanical writer gate with --apply
  const gateScript = resolve(root, 'scripts/writer-gate.mjs');
  const gateResult = JSON.parse(execFileSync('node', [
    gateScript,
    '--repo', repoDir,
    '--patch', patchPath,
    '--review', reviewFile,
    '--check', 'node --test test/calculator.test.mjs',
    '--apply'
  ], { encoding: 'utf8' }));

  assert.equal(gateResult.status, 'passed', 'Writer gate must pass review and check verification');
  assert.equal(gateResult.applied, true, 'Patch must be applied to working directory');
  assert.equal(gateResult.check.exitCode, 0, 'Verification check command must exit with 0');
  console.log('✓ Mechanical Review Gate: Approved with independent review and check validation');

  console.log(JSON.stringify({
    status: 'passed',
    scenario: 'real-codebase-e2e-simulation',
    repo: 'ledger-app',
    iterations: 2,
    predicate: 'node --test test/calculator.test.mjs',
    gateStatus: 'approved',
    finalInvariants: 'all tests passing, clean commit-ready patch generated'
  }, null, 2));

} finally {
  server.close();
  await rm(tempDirectory, { recursive: true, force: true });
}
