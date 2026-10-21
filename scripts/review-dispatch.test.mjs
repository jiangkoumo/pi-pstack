import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runReviewDiffFixture, findSubagentsRoot } from './check-review-diff.mjs';

test('real parallel pstack reviewers read the supplied diff, reject mutation and return lead evidence', { timeout: 90000 }, async (t) => {
  if (!findSubagentsRoot()) {
    t.skip('pi-subagents not found in environment');
    return;
  }
  const result = await runReviewDiffFixture();
  assert.equal(result.status, 'passed');
  assert.equal(result.passed, 5);
  assert.equal(result.failed, 0);
  assert.equal(result.childRequests, 12);
});
