#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const isCheck = process.argv.includes('--check');
assert(process.argv.slice(2).every(arg => arg === '--check'), 'Usage: node scripts/generate-pi-resources.mjs [--check]');

// Reject links even within the package: generation must not follow a stale output
// symlink into another resource. Validate every input and output before any write.
async function pathInPackage(path, prefix = '') {
  assert(typeof path === 'string' && path && !path.includes('\\') && !path.includes('\0') && !posix.isAbsolute(path), 'Invalid resource path: ' + path);
  assert(path === posix.normalize(path) && !path.split('/').includes('..'), 'Non-canonical resource path: ' + path);
  assert(!prefix || path.startsWith(prefix), 'Path outside managed scope: ' + path);
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    const info = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    assert(!info?.isSymbolicLink(), 'Symlink resource path: ' + path);
  }
  return resolve(root, path);
}
const json = async path => JSON.parse(await readFile(await pathInPackage(path), 'utf8'));
const map = await json('docs/port-map.json');
const sources = await json('docs/source-files.json');
const inventory = await json('docs/upstream-inventory.json');
assert.equal(map.commit, sources.commit, 'Source manifest revision mismatch');
assert.equal(map.commit, inventory.commit, 'Inventory revision mismatch');
assert.equal(map.generator, 'scripts/generate-pi-resources.mjs');
assert.equal(map.harness, 'adapters/pi/harness.md');
assert.deepEqual(map.entries.map(e => e.source).sort(), [...inventory.skills, ...inventory.playbooks, ...inventory.agents].sort(), 'Inventory coverage differs');

const originals = new Map();
for (const source of sources.files) {
  assert(!originals.has(source.path), 'Duplicate source fingerprint: ' + source.path);
  const bytes = await readFile(await pathInPackage('upstream/' + source.path, 'upstream/'));
  const hash = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  assert.equal(hash, source.blob, 'Pinned source differs: ' + source.path);
  originals.set(source.path, bytes.toString('utf8'));
}

function frontmatter(text, allowed, label) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert(match, 'Missing frontmatter: ' + label);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z][a-z-]*): (.+)$/);
    assert(field && allowed.includes(field[1]), 'Unmapped frontmatter field or syntax in ' + label + ': ' + line);
    assert(!Object.hasOwn(fields, field[1]), 'Duplicate frontmatter field: ' + label + ': ' + field[1]);
    assert(!['|', '>'].includes(field[2]), 'Unsupported multiline frontmatter: ' + label);
    fields[field[1]] = field[2];
  }
  return { fields, body: match[2].trim() };
}

async function filesUnder(path) {
  const full = await pathInPackage(path);
  const entries = await readdir(full, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const files = [];
  for (const entry of entries) {
    const child = path + '/' + entry.name;
    assert(!entry.isSymbolicLink(), 'Symlink resource path: ' + child);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else { assert(entry.isFile(), 'Unsupported resource type: ' + child); files.push(child); }
  }
  return files;
}

const rendered = new Map();
const overrides = new Set();
const entries = new Map();
for (const entry of map.entries) {
  assert(['ported', 'substitute', 'deferred'].includes(entry.disposition), 'Unknown disposition: ' + entry.source);
  if (entry.disposition !== 'ported') {
    assert.equal(entry.destination, null, 'Unported entry has a destination: ' + entry.source);
    assert.equal(entry.dependencies, null, 'Unported dependencies must remain unaudited: ' + entry.source);
    continue;
  }
  assert(originals.has(entry.source), 'Missing source fingerprint: ' + entry.source);
  // P2.5 owns only skills. Agents require a separate P3 schema and permission review.
  assert(entry.source.startsWith('pstack/skills/'), 'Unsupported generated source: ' + entry.source);
  assert.equal(entry.destination, entry.source.slice('pstack/'.length), 'Destination must match source within skills/: ' + entry.destination);
  await pathInPackage(entry.destination, 'skills/');
  assert(!rendered.has(entry.destination), 'Duplicate destination: ' + entry.destination);
  assert(Array.isArray(entry.dependencies), 'Missing dependency list: ' + entry.source);
  assert(entry.adaptation && ['override', 'inherit-body'].includes(entry.adaptation.strategy), 'Unknown adaptation strategy: ' + entry.source);
  assert.deepEqual(Object.keys(entry.adaptation).sort(), ['override', 'strategy'], 'Unknown adaptation field: ' + entry.source);

  let output;
  if (entry.adaptation.strategy === 'override') {
    const template = entry.adaptation.override;
    assert.equal(template, 'adapters/pi/overrides/' + entry.destination + '.template', 'Override must match destination: ' + template);
    assert(!overrides.has(template), 'Duplicate override: ' + template);
    overrides.add(template);
    output = await readFile(await pathInPackage(template, 'adapters/pi/overrides/'), 'utf8');
  } else {
    assert.equal(entry.adaptation.override, null, 'Inherited entry has an override: ' + entry.source);
    const { fields, body } = frontmatter(originals.get(entry.source), ['name', 'description', 'disable-model-invocation'], entry.source);
    assert(fields.name && fields.description, 'Missing skill metadata: ' + entry.source);
    // P2.5 supports explicit-only skills. A changed invocation policy needs an
    // explicit reviewed override, rather than silently forcing the old value.
    assert.equal(fields['disable-model-invocation'], 'true', 'Invocation policy needs an explicit override: ' + entry.source);
    output = `---\nname: ${fields.name}\ndescription: ${fields.description}\ndisable-model-invocation: ${fields['disable-model-invocation']}\nlicense: MIT\n---\n\n${body}\n`;
  }
  if (entry.destination.endsWith('/SKILL.md')) {
    const { fields } = frontmatter(output, ['name', 'description', 'disable-model-invocation', 'license'], entry.destination);
    assert.equal(fields.name, posix.basename(posix.dirname(entry.destination)), 'Name must match directory: ' + entry.destination);
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name) && fields.name.length <= 64, 'Invalid skill name: ' + fields.name);
    assert(fields.description, 'Missing description: ' + entry.destination);
    assert.equal(fields.license, 'MIT', 'Missing MIT license: ' + entry.destination);
    assert.equal(fields['disable-model-invocation'], 'true', 'Skill must be explicit-only: ' + entry.destination);
  }
  rendered.set(entry.destination, output);
  entries.set(entry.destination, entry);
}

// Both modes reject all unowned files, regardless of extension. Do not remove
// them automatically: the operator may have work here that must be preserved.
for (const file of await filesUnder('skills')) assert(rendered.has(file), 'Unmanaged generated file: ' + file);
for (const file of await filesUnder('adapters/pi/overrides')) assert(overrides.has(file), 'Unmanaged override template: ' + file);

for (const [dest, content] of rendered) {
  const actual = new Set();
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split('#')[0];
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const target = posix.normalize(posix.join(posix.dirname(dest), decodeURIComponent(href)));
    await pathInPackage(target);
    actual.add(target);
    if (target.startsWith('skills/')) assert(rendered.has(target), 'Dependency is not generated: ' + target + ' from ' + dest);
    else {
      assert(target.startsWith('docs/') || target === map.harness, 'Unmapped dependency: ' + target + ' from ' + dest);
      const info = await lstat(await pathInPackage(target)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      assert(info?.isFile(), 'Missing dependency: ' + target + ' from ' + dest);
    }
  }
  const declared = entries.get(dest).dependencies;
  assert.deepEqual(declared, [...new Set(declared)].sort(), 'Dependencies must be unique and sorted: ' + dest);
  assert.deepEqual(declared, [...actual].sort(), 'Dependency declaration differs: ' + dest);
}

if (isCheck) {
  for (const [dest, want] of rendered) {
    const have = await readFile(await pathInPackage(dest), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    assert.equal(have, want, 'Resource drift: ' + dest + '; run npm run generate');
  }
  console.log(JSON.stringify({ status: 'passed', checked: rendered.size, unmanaged: 0 }));
} else {
  let written = 0;
  for (const [dest, content] of rendered) {
    const path = await pathInPackage(dest, 'skills/');
    const existing = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing === content) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    written++;
  }
  console.log(JSON.stringify({ status: 'passed', generated: rendered.size, written }));
}
