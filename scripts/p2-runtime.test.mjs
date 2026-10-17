import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { MODE_ENTRY, modeFromBranch, modeGuidance, parseConfig, validateChoices } from '../extensions/pstack/runtime.mjs';
import { configPaths, loadConfig, updateConfig } from '../extensions/pstack/config.mjs';

const modeEntry = enabled => ({ type: 'custom', customType: MODE_ENTRY, data: { version: 1, enabled } });
test('mode follows only the supplied branch, defaults off and rejects unknown versions', () => {
  assert.deepEqual(modeFromBranch([]), { enabled: false, explicit: false });
  assert.equal(modeFromBranch([modeEntry(true)]).enabled, true);
  assert.equal(modeFromBranch([modeEntry(true), modeEntry(false)]).enabled, false);
  assert.equal(modeFromBranch([modeEntry(true)]).enabled, true);
  assert.throws(() => modeFromBranch([{ ...modeEntry(true), data: { version: 2, enabled: true } }]), /Unsupported/);
  assert.equal(modeFromBranch([{ ...modeEntry(true), data: { version: 2 } }, modeEntry(false)]).enabled, false, 'off recovers from an older incompatible entry');
  assert.equal(modeGuidance({ explicit: false }, '/skill', {}), undefined);
  assert.match(modeGuidance({ enabled: false, explicit: true }, '/skill', {}), /OFF/);
});
test('strict schema and exact model/thinking reject bad choices without substitution', () => {
  const m = { provider: 'test', id: 'a/b', reasoning: true };
  const good = parseConfig({ version: 1, roles: { code: { model: 'test/a/b', thinking: 'high' } } });
  validateChoices(good.roles, [m], m, () => ['off', 'high']);
  for (const bad of [{ version: 2, roles: {} }, { version: 1, roles: { unknown: { model: 'inherit' } } }, { version: 1, roles: { code: { model: 'fuzzy' } } }, { version: 1, roles: {}, extra: true }]) assert.throws(() => parseConfig(bad));
  assert.throws(() => validateChoices({ code: { model: 'test/missing' } }, [m], m, () => ['high']), /not available/);
  assert.throws(() => validateChoices({ code: { model: 'inherit', thinking: 'max' } }, [m], m, () => ['high']), /unsupported/);
});
test('configuration merges per role only for trusted projects, and writes atomically and idempotently', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'pstack-config-test-'));
  try {
    const paths = configPaths(resolve(dir, 'agent'), resolve(dir, 'project'), '.custom-pi');
    assert.equal(paths.project, resolve(dir, 'project/.custom-pi/pstack.json'), 'Project path follows the host config directory');
    const user = { version: 1, roles: { code: { model: 'test/a' }, review: { model: 'inherit' } } };
    assert.equal(await updateConfig(paths.user, () => user), true);
    const before = await stat(paths.user);
    assert.equal(await updateConfig(paths.user, () => user), false);
    assert.equal((await stat(paths.user)).mtimeMs, before.mtimeMs);
    await updateConfig(paths.project, () => ({ version: 1, roles: { code: { model: 'test/b' } } }));
    assert.equal((await loadConfig(paths, true)).roles.code.model, 'test/b');
    assert.equal((await loadConfig(paths, true)).roles.review.model, 'inherit');
    assert.equal((await loadConfig(paths, false)).roles.code.model, 'test/a');
    await writeFile(paths.project, '{broken');
    assert.equal((await loadConfig(paths, false)).roles.code.model, 'test/a');
    await assert.rejects(loadConfig(paths, true), /pstack.json/);
    await writeFile(paths.user + '.lock', 'busy');
    await assert.rejects(updateConfig(paths.user, () => user), /being edited/);
    assert.deepEqual(JSON.parse(await readFile(paths.user, 'utf8')), user);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
