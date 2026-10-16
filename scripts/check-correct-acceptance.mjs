import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// Synthetic Git history tests constraint replay; actual project review history is
// covered separately by check-published-links.mjs.
const repo = await mkdtemp(resolve(tmpdir(), 'pi-pstack-correct-'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const node = (file, ...args) => {
  const stdio = ['ignore', 'pipe', 'pipe'];
  try {
    return { code: 0, out: execFileSync(process.execPath, [file, ...args], { cwd: repo, encoding: 'utf8', stdio }).trim(), err: '' };
  } catch (error) {
    return { code: error.status ?? 1, out: String(error.stdout ?? '').trim(), err: String(error.stderr ?? '').trim() };
  }
};
const commit = message => {
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', '--short', 'HEAD').trim();
};

const cartSource = `export function cartSubtotal(unitPrice, quantity) {
  return unitPrice * quantity;
}
`;
const quoteSource = `export function quoteSubtotal(unitPrice, quantity) {
  return unitPrice * quantity;
}
`;
const probe = (file, expression) => {
  const { code, out } = node('-e', `import('./src/${file}').then(m => console.log(JSON.stringify(${expression})))`);
  assert.equal(code, 0, 'probe failed for ' + file);
  return JSON.parse(out);
};

try {
await mkdir(resolve(repo, 'src'));
git('init', '-q');
git('config', 'user.email', 'fixture@example.invalid');
git('config', 'user.name', 'Fixture');

await writeFile(resolve(repo, 'src/cart.mjs'), cartSource);
const first = commit('feat: cart subtotal');
const firstBad = probe('cart.mjs', 'm.cartSubtotal(100, -1)');

await writeFile(resolve(repo, 'src/quote.mjs'), quoteSource);
const second = commit('feat: quote subtotal');
const secondBad = probe('quote.mjs', 'm.quoteSubtotal(100, 1.5)');

const mistakeCommits = git('log', '--oneline').trim().split('\n').length;
assert.equal(mistakeCommits, 2, 'Synthetic history must contain exactly two mistake commits');
assert.equal(firstBad, -100);
assert.equal(secondBad, 150);

const check = `import assert from 'node:assert/strict';
import { cartSubtotal } from './src/cart.mjs';
import { quoteSubtotal } from './src/quote.mjs';
for (const subtotal of [cartSubtotal, quoteSubtotal]) {
  for (const quantity of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => subtotal(100, quantity), RangeError, 'Reject invalid quantity through every public caller');
  }
  assert.equal(subtotal(100, 2), 200);
}
console.log('quantity contract holds for both callers');
`;
await writeFile(resolve(repo, 'check-quantity.mjs'), check);
const failingCommit = commit('test: quantity contract for both callers');
const beforeFix = node('check-quantity.mjs');
assert.notEqual(beforeFix.code, 0, 'The new check must fail on the pre-fix tree that holds both historical mistakes');
assert.match(beforeFix.out + beforeFix.err, /Reject invalid quantity/, 'Failure must name the contract, not an unrelated error');

const shared = `export function subtotal(unitPrice, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a nonnegative safe integer; use subtotal');
  }
  return unitPrice * quantity;
}
`;
await writeFile(resolve(repo, 'src/subtotal.mjs'), shared);
await writeFile(resolve(repo, 'src/cart.mjs'), `import { subtotal } from './subtotal.mjs';\n\nexport function cartSubtotal(unitPrice, quantity) {\n  return subtotal(unitPrice, quantity);\n}\n`);
await writeFile(resolve(repo, 'src/quote.mjs'), `import { subtotal } from './subtotal.mjs';\n\nexport function quoteSubtotal(unitPrice, quantity) {\n  return subtotal(unitPrice, quantity);\n}\n`);
const fixed = commit('fix: one validated subtotal entry for every caller');
const afterFix = node('check-quantity.mjs');
assert.equal(afterFix.code, 0, 'The same check must pass after the structural fix');

// The historical inputs still reach the same public callers and are now rejected.
for (const [file, expression] of [['cart.mjs', 'm.cartSubtotal(100, -1)'], ['quote.mjs', 'm.quoteSubtotal(100, 1.5)']]) {
  const replay = node('-e', `import('./src/${file}').then(m => { try { console.log(JSON.stringify(${expression})); process.exit(0); } catch (error) { console.log(error.constructor.name); process.exit(2); } })`);
  assert.equal(replay.code, 2, 'Historical bad input must be rejected: ' + file + ' ' + expression);
  assert.equal(replay.out, 'RangeError');
}

// The mistake class is still readable from history rather than only from the fix.
const missedValidation = git('log', '-p', '--format=%h', '--', 'src/cart.mjs').split('\n').filter(line => line.startsWith('+') && /return unitPrice \* quantity/.test(line)).length;
assert.equal(missedValidation, 1, 'The first commit must still show the unvalidated implementation');

console.log(JSON.stringify({
  status: 'passed',
  history: { firstCommit: first, secondCommit: second, failingCheckCommit: failingCommit, fixCommit: fixed },
  syntheticHistory: true,
  mistakeCommits,
  historicalBadResults: { cartSubtotal_100_minus1: firstBad, quoteSubtotal_100_1_point_5: secondBad },
  checkBeforeFix: { exitCode: beforeFix.code, message: (beforeFix.out + '\n' + beforeFix.err).split('\n').find(line => /Reject invalid quantity/.test(line)) },
  checkAfterFix: { exitCode: afterFix.code, message: afterFix.out },
  replayRejectsHistoricalInputs: true,
}));

} finally {
  await rm(repo, { recursive: true, force: true });
}
