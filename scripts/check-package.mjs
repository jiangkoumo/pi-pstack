import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSkillReferences } from './check-skill-references.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('..', import.meta.url));
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const manifest = await json('package.json');
assert(manifest.files.includes('agents/'), 'Missing agents/ in package.json files');
assert(manifest.files.includes('CHANGELOG.md'), 'Missing CHANGELOG.md in package.json files');
const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
assert(changelog.split('\n').some(line => line === `## ${manifest.version}` || line.startsWith(`## ${manifest.version} — `)), 'CHANGELOG.md must contain a release heading for the current package version');
assert.deepEqual(manifest.pi, {
  extensions: ['./extensions/pstack/index.ts'],
  skills: ['./skills']
});
assert.equal(manifest.name, '@jiangkoumo/pi-pstack');
assert.equal(manifest.publishConfig?.access, 'public', 'Published package requires public access');
assert.notEqual(manifest.private, true, 'Package must not be private for release');
assert.equal(manifest.scripts?.release, 'node scripts/release.mjs', 'Missing release script entry');
const map = await json('docs/port-map.json');
const inventory = await json('docs/upstream-inventory.json');
assert.equal(map.commit, inventory.commit);
assert.equal(map.generator, 'scripts/generate-pi-resources.mjs');
assert.equal(map.harness, 'adapters/pi/harness.md');
assert((await stat(resolve(root, map.generator))).isFile(), 'Missing generator: ' + map.generator);
assert((await stat(resolve(root, map.harness))).isFile(), 'Missing harness: ' + map.harness);
const expected = [...inventory.skills, ...inventory.playbooks, ...inventory.agents].sort();
assert.deepEqual(map.entries.map(entry => entry.source).sort(), expected);
const sources = await json('docs/source-files.json');
assert.equal(sources.commit, inventory.commit);
for (const entry of sources.files) {
  const bytes = await readFile(resolve(root, 'upstream', entry.path));
  const hash = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  assert.equal(hash, entry.blob, 'Pinned source differs: ' + entry.path);
}
const DISPOSITIONS = ['ported', 'substitute', 'deferred'];
const PHASES = ['P1', 'P2', 'P3', 'P4', 'P5'];
for (const entry of map.entries) {
  assert(DISPOSITIONS.includes(entry.disposition), 'Unknown disposition: ' + entry.disposition);
  assert(PHASES.includes(entry.phase), 'Unknown phase: ' + entry.phase);
  assert(entry.reason && entry.reason.length > 10, 'Disposition needs a real reason: ' + entry.source);
  assert.equal(entry.audit?.sourceRead, true);
  assert(Array.isArray(entry.audit.relativeLinks));
  if (entry.disposition === 'ported') {
    assert(entry.destination && ['P1', 'P3', 'P5'].includes(entry.phase));
    assert(sources.files.some(source => source.path === entry.source), 'Missing original: ' + entry.source);
    assert(entry.adaptation && ['override', 'inherit-body'].includes(entry.adaptation.strategy), 'Invalid adaptation: ' + entry.source);
    if (entry.adaptation.strategy === 'override') {
      assert((await stat(resolve(root, entry.adaptation.override))).isFile(), 'Missing override file: ' + entry.adaptation.override);
    }
    assert.equal(typeof entry.evidence, 'string', 'Ported entry requires evidence reference: ' + entry.source);
    assert((await stat(resolve(root, 'docs', entry.evidence))).isFile(), 'Missing evidence file in docs: ' + entry.evidence);
    const target = resolve(root, entry.destination);
    assert((await stat(target)).isFile(), 'Missing ported file: ' + entry.source);
  } else {
    assert.equal(entry.destination, null, 'Only ported entries have a destination: ' + entry.source);
    if (entry.source === 'pstack/skills/setup-pstack/SKILL.md') {
      assert.equal(entry.adaptation?.strategy, 'extension-command');
      assert.equal(entry.evidence, 'validation-p2.md');
    } else {
      assert.equal(entry.adaptation, null);
      assert.equal(entry.evidence, null);
    }
  }
}
const tally = map.entries.reduce((accumulator, entry) => { accumulator[entry.disposition] = (accumulator[entry.disposition] ?? 0) + 1; return accumulator; }, {});
assert.equal(Object.values(tally).reduce((sum, count) => sum + count, 0), map.entries.length, 'Disposition tally must cover every mapped entry');
assert.equal(tally.deferred ?? 0, 0);
for (const entry of map.entries.filter(item => item.disposition === 'ported')) {
  assert.match(entry.evidence, /^validation-[a-z0-9-]+\.md$/, 'Ported entry requires validation evidence: ' + entry.source);
}
const auditText = await readFile(resolve(root, 'docs/skill-audit.md'), 'utf8');
const auditRows = auditText.split('\n').filter(line => /^\| (技能 |流程 |代理 |Benny 技能 )/.test(line));
assert.equal(auditRows.length, map.entries.length, 'Audit table covers every mapped entry');
for (const entry of map.entries) {
  const label = entry.source.replace('pstack/skills/poteto-mode/playbooks/', '流程 ').replace('pstack/skills/', '技能 ').replace('pstack/agents/', '代理 ').replace('pstack/automations/benny/skills/', 'Benny 技能 ').replace('/SKILL.md', '').replace('.md', '');
  assert(auditRows.includes('| ' + label + ' | ' + entry.phase + ' | ' + entry.reason + ' |'), 'Audit table differs from map: ' + entry.source);
}
const stripFrontmatter = text => text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
const upstreamBodies = new Map(sources.files.map(source => [source.path, null]));
for (const [path] of upstreamBodies) upstreamBodies.set(path, stripFrontmatter(await readFile(resolve(root, 'upstream', path), 'utf8')));
const bodyOf = async skill => stripFrontmatter(await readFile(resolve(root, 'skills', skill, 'SKILL.md'), 'utf8'));
const unchangedBodies = [
  'principle-model-the-domain',
  'principle-fix-root-causes',
  'principle-test-behavior-not-implementation',
  'principle-encode-lessons-in-structure',
  'principle-laziness-protocol',
  'tdd',
  'bro',
  'in-your-own-words',
  'ketchup',
  'principle-attack-the-premise',
  'principle-build-the-lever',
  'principle-exhaust-the-design-space',
  'principle-experience-first',
  'principle-foundational-thinking',
  'principle-guard-the-context-window',
  'principle-make-operations-idempotent',
  'principle-migrate-callers-then-delete-legacy-apis',
  'principle-minimize-reader-load',
  'principle-never-block-on-the-human',
  'principle-outcome-oriented-execution',
  'principle-redesign-from-first-principles',
  'principle-separate-before-serializing-shared-state',
  'principle-subtract-before-you-add',
  'principle-type-system-discipline',
  'technical-writing',
  'unslop',
];
const changedBodies = [
  'poteto-mode', 'correct', 'principle-prove-it-works', 'principle-sequence-verifiable-units',
  'principle-boundary-discipline', 'principle-explain-the-number', 'typescript-best-practices',
  'architect', 'arena', 'interrogate', 'no-comments', 'reflect', 'swarm', 'why',
  'how', 'poteto-help', 'figure-it-out', 'blast-radius', 'benchmark-checklist', 'teach',
  'show-me-your-work', 'create-verification-skill', 'maintain-verification-skill',
  'recall', 'automate-me', 'sharpen'
];
for (const skill of unchangedBodies) {
  assert.equal(await bodyOf(skill), upstreamBodies.get('pstack/skills/' + skill + '/SKILL.md'), 'Adaptation record says the body is unchanged: ' + skill);
}
assert((await bodyOf('sharpen')).startsWith(upstreamBodies.get('pstack/skills/sharpen/SKILL.md') + '\n\n'), 'sharpen must preserve the pinned upstream body before Pi additions');
for (const skill of changedBodies) {
  assert.notEqual(await bodyOf(skill), upstreamBodies.get('pstack/skills/' + skill + '/SKILL.md'), 'Adaptation record says the body changed: ' + skill);
}
for (const playbook of ['investigation', 'bug-fix', 'feature', 'runtime-forensics', 'trace-forensics', 'visual-parity', 'eval', 'authoring-a-skill']) {
  const changed = stripFrontmatter(await readFile(resolve(root, 'skills/poteto-mode/playbooks', playbook + '.md'), 'utf8')) !== stripFrontmatter(await readFile(resolve(root, 'upstream/pstack/skills/poteto-mode/playbooks', playbook + '.md'), 'utf8'));
  assert(changed, 'Adaptation record says the playbook changed: ' + playbook);
}

let links = 0;
const documents = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith('.md')) documents.push(full);
  }
}
await walk(resolve(root, 'skills'));
await walk(resolve(root, 'agents'));
await walk(resolve(root, 'docs'));
await walk(resolve(root, 'adapters'));
documents.push(resolve(root, 'README.md'), resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(root, 'CHANGELOG.md'));
for (const file of documents) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split('#')[0];
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const target = resolve(dirname(file), decodeURIComponent(href));
    assert(!relative(root, target).startsWith('..'), 'Link escapes package: ' + href);
    assert((await stat(target)).isFile(), 'Broken link in ' + relative(root, file) + ': ' + href);
    links++;
  }
  if (file.includes('/skills/') && file.endsWith('/SKILL.md')) {
    const name = content.match(/^name: (.+)$/m)?.[1];
    assert(name && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64);
    assert.equal(dirname(file).split('/').at(-1), name);
    assert(content.includes('license: MIT'));
  } else if (file.includes('/agents/') && file.endsWith('.md')) {
    const name = content.match(/^name: (.+)$/m)?.[1];
    assert(name && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64);
    assert.match(content, /^package: pstack$/m);
    assert(content.includes('license: MIT'));
  }
}
// The name/folder rule must hold for every skill directory, not only for the
// SKILL.md files the document walk happened to find: a directory without a
// SKILL.md, or one whose declared name drifts from its folder, is a discovery
// bug in the package rather than a document to link-check.
for (const entry of await readdir(resolve(root, 'skills'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const skillFile = resolve(root, 'skills', entry.name, 'SKILL.md');
  let body;
  try { body = await readFile(skillFile, 'utf8'); } catch { assert.fail('Skill directory has no SKILL.md: ' + entry.name); }
  const declared = body.match(/^name: (.+)$/m)?.[1];
  assert.equal(declared, entry.name, 'Skill name must match its folder: ' + entry.name + ' declares ' + declared);
}
const included = (relativePath) => ['README.md', 'package.json', 'LICENSE'].includes(relativePath) || manifest.files.some(entry => entry.endsWith('/') ? relativePath.startsWith(entry) : relativePath === entry);
for (const file of documents) {
  const content = await readFile(file, 'utf8');
  if (!included(relative(root, file))) continue;
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split('#')[0];
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const target = relative(root, resolve(dirname(file), decodeURIComponent(href)));
    assert(included(target), 'Published doc links an omitted file: ' + target);
  }
}
const references = await checkSkillReferences(root, { includeGenerated: true });
assert(references.ok, 'Invalid skill/playbook references: ' + JSON.stringify(references.errors));

// --- docs-vs-tree (upstream #704) ---
// Assert that every skill and extension command mentioned in documentation exists in the package tree.
const treeSkills = new Set(
  (await readdir(resolve(root, 'skills'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
);
const treePlaybooks = new Set(
  (await readdir(resolve(root, 'skills/poteto-mode/playbooks'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.replace(/\.md$/, ''))
);
const registeredCommands = new Set(['poteto-mode', 'setup-pstack', 'loop']);
const placeholderNames = new Set(['name', 'skill-name', 'your-task', 'topic', 'command']);

for (const docFile of documents) {
  const text = await readFile(docFile, 'utf8');
  for (const match of text.matchAll(/\/skill:([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
    const name = match[1];
    if (placeholderNames.has(name)) continue;
    assert(
      treeSkills.has(name) || treePlaybooks.has(name),
      `docs-vs-tree: ${relative(root, docFile)} references missing skill /skill:${name}`
    );
  }
  for (const match of text.matchAll(/\/(poteto-mode|setup-pstack|loop)\b/g)) {
    const command = match[1];
    assert(
      registeredCommands.has(command),
      `docs-vs-tree: ${relative(root, docFile)} references unknown command /${command}`
    );
  }
}

const genCheck = spawnSync(process.execPath, [resolve(root, 'scripts/generate-pi-resources.mjs'), '--check'], { encoding: 'utf8' });
assert.equal(genCheck.status, 0, 'Resource drift detected: ' + genCheck.stderr + genCheck.stdout);

console.log(JSON.stringify({ status: 'passed', mapped: map.entries.length, archived: sources.files.length, documents: documents.length, localLinks: links, unchangedBodies: unchangedBodies.length, changedBodies: changedBodies.length, dispositions: tally, publishedPaths: manifest.files, resourceGeneration: 'in-sync' }));
