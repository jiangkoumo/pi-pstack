#!/usr/bin/env node
// P4 isolated install / upgrade / uninstall check.
//
// What this does:
// - npm packs the package, inspects the tarball contents, and installs it into a
//   throwaway consumer's .pi/npm/node_modules/pi-pstack (the Pi package layout);
// - loads the real installed Pi host with only that package registered, checks the
//   11 skills and 2 subagents, and confirms the extension has no load errors;
// - overwrites the install with the same tarball (upgrade simulation) and checks
//   user config/settings survive;
// - removes the package and reloads: no pstack skill or extension may remain.
//
// This does not run the npm registry, publish, or touch the operator's global Pi config.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const piRoot = process.env.PI_PSTACK_PI_ROOT;
const subRoot = process.env.PI_SUBAGENTS_ROOT || resolve(homedir(), '.pi/agent/npm/node_modules/pi-subagents');
assert(piRoot, 'Set PI_PSTACK_PI_ROOT to the installed pi-coding-agent package root');

const directory = await mkdtemp(resolve(tmpdir(), 'pstack-p4-install-'));
const agentDir = resolve(directory, 'agent');
const consumer = resolve(directory, 'consumer');
const installDir = resolve(consumer, '.pi/npm/node_modules/pi-pstack');
process.env.PI_CODING_AGENT_DIR = agentDir;
delete process.env.PI_SUBAGENT_EXTRA_AGENT_DIRS;

const { DefaultResourceLoader, SettingsManager } = await import(pathToFileURL(resolve(piRoot, 'dist/index.js')));

async function makeLoader(packages) {
  const settingsManager = SettingsManager.inMemory({
    defaultProjectTrust: 'never',
    packages,
    subagents: { asyncByDefault: false },
    retry: { enabled: false },
    theme: 'operator-theme',
  });
  const loader = new DefaultResourceLoader({
    cwd: consumer,
    agentDir,
    settingsManager,
    noContextFiles: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  return { settingsManager, loader };
}

const expectedSkills = new Set([
  'poteto-mode', 'correct', 'tdd',
  'principle-model-the-domain', 'principle-fix-root-causes', 'principle-prove-it-works',
  'principle-sequence-verifiable-units', 'principle-test-behavior-not-implementation',
  'principle-encode-lessons-in-structure', 'principle-laziness-protocol', 'principle-boundary-discipline',
]);

async function installedSkills(loader) {
  return loader.getSkills().skills.map(skill => skill.name).filter(name => expectedSkills.has(name)).sort();
}

let summary;
try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(consumer, { recursive: true });
  await mkdir(installDir, { recursive: true });

  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }))[0];
  const tarballPath = resolve(directory, pack.filename);
  const files = pack.files.map(entry => entry.path);
  const required = [
    'package.json',
    'extensions/pstack/index.ts',
    'skills/poteto-mode/SKILL.md',
    'agents/poteto-agent.md',
    'agents/comment-sicko.md',
    'adapters/pi/harness.md',
    'scripts/writer-gate.mjs',
    'docs/validation-p3-writer.md',
    'LICENSE',
    'LICENSES/pstack.txt',
    'THIRD_PARTY_NOTICES.md',
  ];
  for (const path of required) assert(files.includes(path), 'Tarball is missing ' + path);
  for (const path of files) {
    assert(!path.startsWith('node_modules/'), 'Tarball must not bundle node_modules: ' + path);
    assert(!path.endsWith('.tgz'), 'Tarball must not include a tarball: ' + path);
    assert(!path.startsWith('.git/'), 'Tarball must not include .git: ' + path);
  }
  // Real Pi CLI registration in an isolated project/agent dir. A local tarball
  // source is registered as a path; it is not a registry download.
  const cliProject = resolve(directory, 'cli-project');
  const cliSettings = resolve(cliProject, '.pi/settings.json');
  await mkdir(cliProject, { recursive: true });
  const cliEnv = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
  const cli = process.env.PI_PSTACK_PI_CLI || 'pi';
  execFileSync(cli, ['install', tarballPath, '-l', '-a'], { cwd: cliProject, env: cliEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const installedSettings = JSON.parse(await readFile(cliSettings, 'utf8'));
  assert.equal(installedSettings.packages.length, 1, 'pi install must add exactly one project package: ' + JSON.stringify(installedSettings));
  assert(installedSettings.packages[0].includes(pack.filename), 'pi install must register the tarball path: ' + JSON.stringify(installedSettings));
  execFileSync(cli, ['remove', tarballPath, '-l', '-a'], { cwd: cliProject, env: cliEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const removedSettings = JSON.parse(await readFile(cliSettings, 'utf8'));
  assert.deepEqual(removedSettings.packages, [], 'pi remove must clear the project package registration: ' + JSON.stringify(removedSettings));

  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true, 'Package must stay private until publishing is authorized');
  assert.equal(pack.entryCount, files.length);

  execFileSync('tar', ['-xzf', tarballPath, '-C', installDir, '--strip-components=1']);

  // User configuration that an upgrade/uninstall must not clobber.
  const userConfig = { version: 1, roles: { code: { model: 'fixture/writer', thinking: 'low' } } };
  await writeFile(resolve(agentDir, 'pstack.json'), JSON.stringify(userConfig, null, 2) + '\n');
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({ packages: [installDir], theme: 'operator-theme' }, null, 2) + '\n');

  const installed = await makeLoader([installDir]);
  assert.deepEqual(installed.loader.getExtensions().errors, [], 'Installed package extension must load without errors');
  const skillsAfterInstall = await installedSkills(installed.loader);
  assert.equal(skillsAfterInstall.length, 11, 'Installed package must expose 11 pstack skills: ' + JSON.stringify(skillsAfterInstall));
  assert(skillsAfterInstall.includes('poteto-mode'));
  assert(skillsAfterInstall.includes('correct'));

  const { discoverAgents } = await import(pathToFileURL(resolve(subRoot, 'src/agents/agents.js')));
  const discovered = discoverAgents(installDir, 'package', undefined, { globalNpmRoot: null });
  const pstackAgents = discovered.agents.filter(agent => agent.packageName === 'pstack');
  const agentNames = pstackAgents.map(agent => agent.name).sort();
  assert.deepEqual(agentNames, ['pstack.comment-sicko', 'pstack.poteto-agent'], 'Installed package must export exactly two pstack agents: ' + JSON.stringify(agentNames));
  assert(pstackAgents.every(agent => agent.packageName === 'pstack'));

  // Upgrade simulation: overwrite the same files, then reload. User config must survive.
  execFileSync('tar', ['-xzf', tarballPath, '-C', installDir, '--strip-components=1']);
  const upgraded = await makeLoader([installDir]);
  assert.deepEqual(upgraded.loader.getExtensions().errors, [], 'Upgraded package extension must load without errors');
  assert.deepEqual(await installedSkills(upgraded.loader), skillsAfterInstall, 'Upgrade must keep the same skill set');
  assert.deepEqual(JSON.parse(await readFile(resolve(agentDir, 'pstack.json'), 'utf8')), userConfig, 'Upgrade must not rewrite user pstack.json');
  assert.equal(JSON.parse(await readFile(resolve(agentDir, 'settings.json'), 'utf8')).theme, 'operator-theme', 'Upgrade must not rewrite user settings');

  // Uninstall: remove the package and its registration, then load a fresh session.
  await rm(installDir, { recursive: true, force: true });
  await writeFile(resolve(agentDir, 'settings.json'), JSON.stringify({ packages: [], theme: 'operator-theme' }, null, 2) + '\n');
  const removed = await makeLoader([]);
  assert.deepEqual(removed.loader.getExtensions().errors, [], 'Uninstalled environment must load without errors');
  const skillsAfterRemove = await installedSkills(removed.loader);
  assert.equal(skillsAfterRemove.length, 0, 'Removed package must not keep loading skills: ' + JSON.stringify(skillsAfterRemove));
  assert.equal(existsSync(installDir), false, 'Uninstall must remove the installed package directory');
  assert.deepEqual(JSON.parse(await readFile(resolve(agentDir, 'pstack.json'), 'utf8')), userConfig, 'Uninstall must leave user config in place');
  assert.equal(JSON.parse(await readFile(resolve(agentDir, 'settings.json'), 'utf8')).theme, 'operator-theme');


  summary = {
    status: 'passed',
    validationLayer: 'npm tarball + isolated consumer install + real Pi 1.3.0 resource loader; no publishing, no global config',
    tarball: { file: pack.filename, entryCount: pack.entryCount, bytes: pack.size, required: required.length },
    install: { packageDir: installDir, skills: skillsAfterInstall, agents: agentNames, extensionErrors: 0 },
    upgrade: { skillsUnchanged: true, userConfigUnchanged: true, settingsUnchanged: true },
    uninstall: { packageRemoved: true, skills: skillsAfterRemove, extensionErrors: 0, userConfigPreserved: true },
    cli: { install: 'registered', remove: 'removed', projectSettings: removedSettings.packages },
  };
  console.log(JSON.stringify(summary));
} finally {
  await rm(directory, { recursive: true, force: true });
}
process.exit(0);
