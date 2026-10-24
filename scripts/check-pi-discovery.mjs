import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed @earendil-works/pi-coding-agent package root');
const { loadSkills, formatSkillsForPrompt } = await import(pathToFileURL(resolve(piRoot, 'dist/core/skills.js')).href);
const loaded = loadSkills({ cwd: root, agentDir: resolve(root, 'scripts/fixtures/empty-agent'), skillPaths: [resolve(root, 'skills')], includeDefaults: false });
assert.deepEqual(loaded.diagnostics, [], 'Pi skill diagnostics');
const expected = readdirSync(resolve(root, 'skills'), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(resolve(root, 'skills', entry.name, 'SKILL.md')))
  .map(entry => entry.name).sort();
assert.deepEqual(loaded.skills.map(skill => skill.name).sort(), expected, 'Every skills/*/SKILL.md loads in Pi under its folder name');
assert(loaded.skills.every(skill => skill.disableModelInvocation));
assert.equal(formatSkillsForPrompt(loaded.skills), '', 'Explicit-only skills do not add their bodies to the default prompt');
assert(loaded.skills.some(skill => skill.name === 'poteto-mode'));
assert(loaded.skills.some(skill => skill.name === 'correct'));
console.log(JSON.stringify({ status: 'passed', skills: loaded.skills.map(skill => skill.name), diagnostics: loaded.diagnostics, defaultPromptCharacters: 0 }));

