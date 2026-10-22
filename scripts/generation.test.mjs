import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const blob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
async function fixture(run) {
  const dir = await mkdtemp(resolve(tmpdir(), 'pstack-generation-'));
  try {
    for (const path of ['scripts', 'docs', 'upstream', 'adapters', 'skills', 'agents']) await cp(resolve(root, path), resolve(dir, path), { recursive: true });
    await run(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
function execute(dir, check = true) {
  const r = spawnSync(process.execPath, [resolve(dir, 'scripts/generate-pi-resources.mjs'), ...(check ? ['--check'] : [])], { cwd: dir, encoding: 'utf8' });
  assert.ifError(r.error);
  return { code: r.status, output: r.stdout + r.stderr };
}
async function mutateJSON(dir, path, change) {
  const value = JSON.parse(await readFile(resolve(dir, path), 'utf8'));
  change(value);
  await writeFile(resolve(dir, path), JSON.stringify(value, null, 2) + '\n');
}
async function rejectInBothModes(dir, pattern) {
  const sentinels = ['skills/correct/SKILL.md', 'agents/comment-sicko.md', 'agents/poteto-agent.md'].map(path => resolve(dir, path));
  const before = await Promise.all(sentinels.map(path => readFile(path)));
  for (const check of [true, false]) {
    const r = execute(dir, check);
    assert.equal(r.code, 1, r.output);
    assert.match(r.output, pattern);
    assert.deepEqual(await Promise.all(sentinels.map(path => readFile(path))), before, 'Validation failure must precede writes');
  }
}

test('B2 generated artifact instructions use the injected run directory instead of the real home', async () => {
  for (const destination of ['skills/architect/SKILL.md', ...['autonomous-run', 'hillclimb', 'multi-phase-plan', 'orchestrate', 'pause-safely', 'prototype'].map(name => `skills/poteto-mode/playbooks/${name}.md`)]) {
    const content = await readFile(resolve(root, destination), 'utf8');
    assert.doesNotMatch(content, /~\/\.pi\/agent\/pstack-runs/, destination);
    assert.match(content, /pstack run directory (?:given|provided) in the system prompt/i, destination);
    assert.match(content, /<run-id>/, destination);
  }
});

test('autonomous-run template and output document stop as a complete command', async () => {
  for (const path of ['adapters/pi/overrides/skills/poteto-mode/playbooks/autonomous-run.md.template', 'skills/poteto-mode/playbooks/autonomous-run.md']) {
    const content = await readFile(resolve(root, path), 'utf8');
    assert.deepEqual([...content.matchAll(/`(\/loop stop[^`]*)`/g)].map(match => match[1]), ['/loop stop'], path);
  }
});

test('B12 generated writer guidance points to the current skill and principle leaves', async () => {
  const content = await readFile(resolve(root, 'agents/poteto-agent.md'), 'utf8');
  assert.doesNotMatch(content, /generalPurpose|Subagents section|inline Principles index/);
  assert.match(content, /^description: .*code-writing.*handoff/m);
  const link = content.match(/\[poteto-mode skill\]\(([^)]+)\)/);
  assert(link, 'The writer must be told to read the current poteto-mode skill');
  const skill = await readFile(resolve(root, 'agents', link[1]), 'utf8');
  assert.match(skill, /^name: poteto-mode$/m);
  assert.match(content, /principle-\*/);
  assert.match(content, /Read the \[poteto-mode skill\].*in full before doing any work/);
});

test('Pi-specific role agents preserve tool boundaries and are not attributed to upstream', () => fixture(async dir => {
  const map = JSON.parse(await readFile(resolve(dir, 'docs/port-map.json'), 'utf8'));
  assert.deepEqual(map.nativeResources.map(entry => entry.destination).sort(), ['bug-fix-agent', 'hillclimb-agent', 'judgment-agent', 'perf-agent', 'prose-writer', 'strongest-agent', 'verifier'].map(name => `agents/${name}.md`));
  for (const entry of map.nativeResources) {
    assert.equal(entry.origin, 'pi-specific-role');
    assert(!map.entries.some(original => original.source === entry.source));
    assert.equal(await readFile(resolve(dir, entry.destination), 'utf8'), await readFile(resolve(dir, entry.adaptation.override), 'utf8'));
  }
  const verifier = await readFile(resolve(dir, 'agents/verifier.md'), 'utf8');
  assert.match(verifier, /^tools: read, grep, find, ls, verification_exec$/m);
  assert.match(verifier, /^subagentOnlyExtensions: \.\.\/extensions\/pstack\/index\.ts$/m);
  assert.doesNotMatch(verifier, /^extensions:/m, 'Read-only agents must leave extensions unset so ambient provider extensions load');
  assert.match(verifier, /^excludeTools: contact_supervisor$/m);
  const sicko = await readFile(resolve(dir, 'agents/comment-sicko.md'), 'utf8');
  assert.match(sicko, /^tools: read, grep, find, ls, git_read$/m);
  assert.match(sicko, /^subagentOnlyExtensions: \.\.\/extensions\/pstack\/index\.ts$/m);
  assert.doesNotMatch(sicko, /^extensions:/m);
  const writer = await readFile(resolve(dir, 'agents/prose-writer.md'), 'utf8');
  assert.match(writer, /^tools: read, edit, write, grep, find, ls$/m);
  assert.doesNotMatch(writer, /^subagentOnlyExtensions:/m);
  await mutateJSON(dir, 'docs/port-map.json', map => { map.nativeResources[0].destination = 'agents/poteto-agent.md'; });
  await rejectInBothModes(dir, /Destination must match source/);
}));

test('prepared references are generated, checked for drift, and have accepted status', () => fixture(async dir => {
  const map = JSON.parse(await readFile(resolve(dir, 'docs/port-map.json'), 'utf8'));
  const entry = map.preparedResources.find(entry => entry.destination === 'skills/how/references/explorer-prompt.md');
  assert.equal(entry.status, 'accepted');
  assert.equal(map.entries.find(entry => entry.source === 'pstack/skills/how/SKILL.md').disposition, 'ported');
  const target = resolve(dir, entry.destination);
  const expected = await readFile(resolve(dir, entry.adaptation.override), 'utf8');
  await writeFile(target, expected + '\nmanual drift\n');
  assert.equal(execute(dir).code, 1);
  assert.equal(execute(dir, false).code, 0);
  assert.equal(await readFile(target, 'utf8'), expected);
}));

test('prepared resources cannot escape their source-owned destination', () => fixture(async dir => {
  await mutateJSON(dir, 'docs/port-map.json', map => { map.preparedResources[0].destination = 'docs/escape.md'; });
  await rejectInBothModes(dir, /Destination must match source/);
}));

test('prepared resources must have valid status and cannot duplicate a ported source', () => fixture(async dir => {
  await mutateJSON(dir, 'docs/port-map.json', map => { map.preparedResources[0].status = 'invalid-status'; });
  await rejectInBothModes(dir, /Unknown prepared resource status/);
}));

test('generation is repeatable, no-op generation preserves mtime, and check is read-only', () => fixture(async dir => {
  const path = resolve(dir, 'skills/tdd/SKILL.md');
  const before = await stat(path);
  for (const check of [true, false, false, true]) assert.equal(execute(dir, check).code, 0);
  assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
  const content = await readFile(path, 'utf8');
  await writeFile(path, content + '\nmanual drift\n');
  const r = execute(dir);
  assert.equal(r.code, 1);
  assert.match(r.output, /Resource drift/);
  assert.equal(await readFile(path, 'utf8'), content + '\nmanual drift\n');
  assert.equal(execute(dir, false).code, 0);
  assert.equal(await readFile(path, 'utf8'), content);
}));

for (const destination of ['docs/review-generated-target.md', '../escape.md', '/tmp/escape.md', 'skills/../docs/target.md']) {
  test('reject destination outside source-owned path: ' + destination, () => fixture(async dir => {
    await mutateJSON(dir, 'docs/port-map.json', map => { map.entries.find(e => e.source === 'pstack/skills/tdd/SKILL.md').destination = destination; });
    await rejectInBothModes(dir, /Destination must match source/);
  }));
}

test('reject changed pinned source before generation', () => fixture(async dir => {
  const path = resolve(dir, 'upstream/pstack/skills/tdd/SKILL.md');
  await writeFile(path, await readFile(path, 'utf8') + '\nchanged baseline\n');
  await rejectInBothModes(dir, /Pinned source differs/);
}));

for (const [name, mutation, pattern] of [
  ['unknown field', text => text.replace('disable-model-invocation: true', 'disable-model-invocation: true\nunknown-host-field: false'), /Unmapped frontmatter/],
  ['invocation policy change', text => text.replace('disable-model-invocation: true', 'disable-model-invocation: false'), /Invocation policy needs an explicit override/],
  ['multiline description', text => text.replace(/^description:.*$/m, 'description: >\n  multiline text'), /Unmapped frontmatter|Unsupported multiline/],
]) {
  test('reject reviewed-baseline metadata needing adaptation: ' + name, () => fixture(async dir => {
    const source = 'pstack/skills/tdd/SKILL.md';
    const path = resolve(dir, 'upstream', source);
    const text = mutation(await readFile(path, 'utf8'));
    await writeFile(path, text);
    // Update only the fixture fingerprint to reach field validation independently.
    await mutateJSON(dir, 'docs/source-files.json', manifest => { manifest.files.find(e => e.path === source).blob = blob(Buffer.from(text)); });
    await rejectInBothModes(dir, pattern);
  }));
}

for (const path of ['skills/poteto-mode/unowned.txt', 'agents/unmanaged.txt', 'adapters/pi/overrides/orphan.template']) {
  test('reject unmanaged file: ' + path, () => fixture(async dir => {
    await writeFile(resolve(dir, path), 'must be preserved');
    await rejectInBothModes(dir, /Unmanaged/);
    assert.equal(await readFile(resolve(dir, path), 'utf8'), 'must be preserved');
  }));
}

test('reject a symlink output without changing its target', () => fixture(async dir => {
  const path = resolve(dir, 'skills/tdd/SKILL.md');
  const target = resolve(dir, 'sentinel.txt');
  await writeFile(target, 'must be preserved');
  await rm(path);
  await symlink(target, path);
  await rejectInBothModes(dir, /Symlink resource/);
  assert.equal(await readFile(target, 'utf8'), 'must be preserved');
}));

test('reject missing declared dependency', () => fixture(async dir => {
  await mutateJSON(dir, 'docs/port-map.json', map => { map.entries.find(e => e.destination === 'skills/correct/SKILL.md').dependencies = []; });
  await rejectInBothModes(dir, /Dependency declaration differs/);
}));

test('reject a skill dependency outside the generated set', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/skills/no-comments/SKILL.md.template');
  await writeFile(path, (await readFile(path, 'utf8')) + '\nSee [missing](../not-generated/SKILL.md).\n');
  await rejectInBothModes(dir, /Dependency is not generated/);
}));

test('report a missing document dependency before writes', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/skills/poteto-mode/SKILL.md.template');
  await writeFile(path, (await readFile(path, 'utf8')).replace('../../docs/port-status.md', '../../docs/missing-dependency.md'));
  await rejectInBothModes(dir, /Missing dependency: docs\/missing-dependency\.md from skills\/poteto-mode\/SKILL\.md/);
}));

test('reject override inputs outside their owned template', () => fixture(async dir => {
  await mutateJSON(dir, 'docs/port-map.json', map => { map.entries.find(e => e.destination === 'skills/correct/SKILL.md').adaptation.override = 'docs/validation-p1.md'; });
  await rejectInBothModes(dir, /Override must match destination/);
}));

test('reject forbidden write tool in read-only agent comment-sicko', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  const text = (await readFile(path, 'utf8')).replace('tools: read, grep, find, ls', 'tools: read, grep, find, ls, edit');
  await writeFile(path, text);
  await rejectInBothModes(dir, /Forbidden tool/);
}));

test('reject missing explicit tool allowlist in agent', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  const text = (await readFile(path, 'utf8')).replace(/^tools:.*$/m, '');
  await writeFile(path, text);
  await rejectInBothModes(dir, /Agent must declare an explicit tool allowlist/);
}));

test('reject invalid package namespace in agent definition', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/poteto-agent.md.template');
  const text = (await readFile(path, 'utf8')).replace('package: pstack', 'package: wrong');
  await writeFile(path, text);
  await rejectInBothModes(dir, /Agent package must be declared as pstack/);
}));

test('reject non-empty extensions in read-only agent', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  const text = (await readFile(path, 'utf8')).replace('systemPromptMode:', 'extensions: ./ext.ts\nsystemPromptMode:');
  await writeFile(path, text);
  await rejectInBothModes(dir, /Read-only agent must not declare extensions/);
}));

test('reject an explicitly empty extensions declaration in read-only agent', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  // An empty list is not neutral: pi-subagents treats the key as "disable ALL
  // ambient extensions", including the provider extension a model may need.
  const text = (await readFile(path, 'utf8')).replace('systemPromptMode:', 'extensions:\nsystemPromptMode:');
  await writeFile(path, text);
  await rejectInBothModes(dir, /Read-only agent must not declare extensions/);
}));

test('reject unauthorized tool in writer agent', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/poteto-agent.md.template');
  const text = (await readFile(path, 'utf8')).replace('tools: read, edit, write, grep, find, ls, bash', 'tools: read, edit, write, grep, find, ls, bash, dangerous_tool');
  await writeFile(path, text);
  await rejectInBothModes(dir, /Unrecognized writer tool/);
}));

test('reject writer empty extensions', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/poteto-agent.md.template');
  await writeFile(path, (await readFile(path, 'utf8')).replace('systemPromptMode:', 'extensions:\nsystemPromptMode:'));
  await rejectInBothModes(dir, /Writer must not declare extensions/);
}));

test('reject missing runtime supervisor exclusion', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  await writeFile(path, (await readFile(path, 'utf8')).replace('excludeTools: contact_supervisor\n', ''));
  await rejectInBothModes(dir, /must exclude runtime supervisor tool/);
}));

test('reject identity role tampering for comment-sicko', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  // Declare a valid writer allowlist so the identity assertion, not the tool
  // whitelist, rejects the tampered acceptance role.
  const text = (await readFile(path, 'utf8'))
    .replace('tools: read, grep, find, ls, git_read', 'tools: read, edit, write, grep, find, ls, bash')
    .replace('acceptanceRole: read-only', 'acceptanceRole: writer');
  await writeFile(path, text);
  await rejectInBothModes(dir, /comment-sicko must be read-only/);
}));

test('reject missing subagentOnlyExtensions in verifier', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/verifier.md.template');
  await writeFile(path, (await readFile(path, 'utf8')).replace('subagentOnlyExtensions: ../extensions/pstack/index.ts\n', ''));
  await rejectInBothModes(dir, /Agents requiring package extension tools must declare subagentOnlyExtensions/);
}));

test('reject missing subagentOnlyExtensions in comment-sicko', () => fixture(async dir => {
  const path = resolve(dir, 'adapters/pi/overrides/agents/comment-sicko.md.template');
  await writeFile(path, (await readFile(path, 'utf8')).replace('subagentOnlyExtensions: ../extensions/pstack/index.ts\n', ''));
  await rejectInBothModes(dir, /Agents requiring package extension tools must declare subagentOnlyExtensions/);
}));
