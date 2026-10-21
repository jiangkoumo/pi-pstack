#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_ROOT = 'adapters/pi/overrides';
const PHANTOM_SKILLS = new Set(['create-skill', 'bugbot-triage']);
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.md.template'))) files.push(path);
  }
  return files;
}

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

/**
 * Templates are validated at their generated destination, so a relative link
 * means the same thing before and after generation.
 */
function destinationFor(file, root) {
  const rel = relative(root, file).split(sep).join('/');
  if (!rel.startsWith(TEMPLATE_ROOT + '/')) return file;
  const generated = rel.slice(TEMPLATE_ROOT.length + 1).replace(/\.template$/, '');
  return resolve(root, generated);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function localTarget(raw) {
  const target = raw.trim().replace(/^<|>$/g, '').split(/\s+/)[0].split('#')[0];
  if (!target) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  return decodeURIComponent(target);
}

/**
 * Check every package-authored Markdown file for links and /skill: references.
 * Templates are checked at their generated path. A link to a missing file, a
 * /skill: name with no skills/<name>/SKILL.md, or a known phantom skill name
 * is an error. Reference files such as references/bugbot-triage.md are real
 * files and pass through the ordinary link check.
 */
export async function checkSkillReferences(root = PACKAGE_ROOT, { includeGenerated = false } = {}) {
  const files = [...await walk(resolve(root, TEMPLATE_ROOT))];
  if (includeGenerated) {
    files.push(...await walk(resolve(root, 'skills')));
    files.push(...await walk(resolve(root, 'agents')));
  }

  const errors = [];
  const checked = [];
  const skillReferences = [];
  const links = [];

  for (const file of files.sort()) {
    const text = await readFile(file, 'utf8');
    const display = relative(root, file).split(sep).join('/');
    const destination = destinationFor(file, root);
    checked.push(display);

    const seenLinks = new Set();
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = localTarget(match[1]);
      if (!target) continue;
      const resolved = target.startsWith('/') ? resolve(root, target.slice(1)) : resolve(dirname(destination), target);
      const key = `${match.index}:${resolved}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({ file: display, target, resolved: relative(root, resolved).split(sep).join('/') });
      if (!(await exists(resolved))) {
        errors.push({ file: display, line: lineOf(text, match.index), target, resolved: relative(root, resolved).split(sep).join('/'), reason: 'Missing local link target' });
      }
    }

    for (const match of text.matchAll(/\/skill:([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
      const name = match[1];
      skillReferences.push({ file: display, line: lineOf(text, match.index), name });
      if (PHANTOM_SKILLS.has(name)) {
        errors.push({ file: display, line: lineOf(text, match.index), target: `/skill:${name}`, reason: 'Phantom skill reference' });
        continue;
      }
      if (!SKILL_NAME.test(name) || !(await exists(resolve(root, 'skills', name, 'SKILL.md')))) {
        errors.push({ file: display, line: lineOf(text, match.index), target: `/skill:${name}`, reason: 'Unknown skill reference' });
      }
    }

    for (const name of PHANTOM_SKILLS) {
      const pattern = new RegExp(`\\*\\*${name}\\*\\*|\\]\\(\\.\\./${name}/SKILL\\.md\\)`, 'g');
      for (const match of text.matchAll(pattern)) {
        errors.push({ file: display, line: lineOf(text, match.index), target: name, reason: 'Phantom skill reference' });
      }
    }
  }

  return {
    ok: errors.length === 0,
    root,
    scope: includeGenerated ? 'templates+generated' : 'templates',
    checkedFiles: checked.length,
    links: links.length,
    skillReferences: skillReferences.length,
    errors,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag === -1 ? PACKAGE_ROOT : resolve(process.argv[rootFlag + 1]);
  const result = await checkSkillReferences(root, { includeGenerated: process.argv.includes('--include-generated') });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
