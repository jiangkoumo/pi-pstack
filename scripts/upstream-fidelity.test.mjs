import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFidelity } from './check-upstream-fidelity.mjs';

const map = { entries: [
  { source: 'pstack/skills/ported/SKILL.md', disposition: 'ported' },
  { source: 'pstack/skills/substitute/SKILL.md', disposition: 'substitute' },
] };
const row = (file, kept, upstream = 100, extra = {}) => ({ file, kept, upstream, subst: 0, missing: false, ...extra });

test('a high overall score cannot hide one port below 70%, even if allowlisted', () => {
  const verdict = evaluateFidelity([
    row('skills/ported/SKILL.md', 69),
    row('skills/large/SKILL.md', 1000, 1000),
  ], map);
  assert.ok(verdict.overall > 0.85);
  assert.match(verdict.errors.join('\n'), /ported.*< 70%/);
});

test('overall 94% and per-file 70% boundaries use exact counts', () => {
  assert.deepEqual(evaluateFidelity([row('skills/ported/SKILL.md', 70), row('skills/other/SKILL.md', 400, 400)], map).errors, []);
  assert.match(evaluateFidelity([row('skills/ported/SKILL.md', 939, 1000)], map).errors[0], /< 94%/);
  assert.deepEqual(evaluateFidelity([row('skills/ported/SKILL.md', 940, 1000)], map).errors, []);
  assert.match(evaluateFidelity([row('skills/ported/SKILL.md', 4229, 4501)], map).errors[0], /< 94%/);
});

test('missing ported files fail while substitute files still count in overall', () => {
  const verdict = evaluateFidelity([
    row('skills/ported/SKILL.md', 0, 10, { missing: true }),
    row('skills/substitute/SKILL.md', 0, 10, { missing: true }),
  ], map);
  assert.equal(verdict.errors.length, 2);
  assert.match(verdict.errors[1], /Missing ported/);
  assert.match(evaluateFidelity([row('skills/other/SKILL.md', 100)], map).errors[0], /Missing fidelity result/);
});
