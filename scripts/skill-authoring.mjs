import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fields: null, body: text };
  const fields = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const field = line.match(/^([a-zA-Z][a-zA-Z0-9-]*): ?(.*)$/);
    if (!field) continue;
    fields[field[1]] = field[2].replace(/^["']|["']$/g, '');
  }
  return { fields, body: match[2] };
}

async function exists(path) {
  return stat(path).then(info => info.isFile(), () => false);
}

/**
 * Validate one skill directory against Pi's Agent Skills contract plus the
 * package's MIT convention: frontmatter, name/directory agreement, referenced
 * files, and cross-skill links.
 */
export async function validateSkillDirectory(dir) {
  const root = resolve(dir);
  const errors = [];
  const readme = resolve(root, 'SKILL.md');
  const text = await readFile(readme, 'utf8').catch(() => null);
  if (text === null) {
    return { ok: false, name: null, errors: [`Missing SKILL.md in ${root}`], links: [] };
  }
  const { fields, body } = frontmatter(text);
  if (!fields) errors.push('Missing YAML frontmatter');
  const name = fields?.name ?? null;
  const description = fields?.description ?? null;
  if (!name) errors.push('Missing frontmatter name');
  else {
    if (!NAME.test(name)) errors.push(`Invalid skill name: ${name}`);
    if (name.length > 64) errors.push(`Skill name exceeds 64 characters: ${name}`);
    if (basename(root) !== name) errors.push(`Directory name ${basename(root)} differs from skill name ${name}`);
  }
  if (!description) errors.push('Missing frontmatter description');
  else if (description.length > 1024) errors.push(`Description exceeds 1024 characters: ${name}`);
  if (fields && 'license' in fields && fields.license !== 'MIT') errors.push(`Unexpected license: ${fields.license}`);

  const links = [];
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split('#')[0];
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const target = resolve(dirname(readme), decodeURIComponent(href));
    links.push(target);
    if (!(await exists(target))) errors.push(`Broken skill link: ${href}`);
  }
  return { ok: errors.length === 0, name, errors, links };
}

/** Validate every immediate skill directory under a parent directory. */
export async function validateSkillTree(parent) {
  const entries = await readdir(resolve(parent), { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    results.push(await validateSkillDirectory(resolve(parent, entry.name)));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/skill-authoring.mjs <skill-dir>');
    process.exit(2);
  }
  const result = await validateSkillDirectory(target);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

