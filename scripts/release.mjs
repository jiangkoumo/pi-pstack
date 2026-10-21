#!/usr/bin/env node
/**
 * Local, tag-driven release helper.
 *
 * Default behavior is local-only: bump package.json (and package-lock.json when
 * present), create a release commit, and create an annotated vX.Y.Z tag. Nothing
 * is pushed and nothing is published unless the operator passes --push or
 * --publish.
 *
 * Usage:
 *   node scripts/release.mjs patch
 *   node scripts/release.mjs minor --push
 *   node scripts/release.mjs major --publish
 *   node scripts/release.mjs patch --dry-run
 *
 * --push        push the release commit and tag to origin
 * --publish     publish to npm; implies --push so the tag exists on the remote
 * --dry-run     run every check and print the planned release without changing files
 * --allow-branch  allow releasing from a branch other than main
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packagePath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const args = process.argv.slice(2);
const flags = new Set(args.filter(argument => argument.startsWith('-')));
const bump = args.find(argument => !argument.startsWith('-'));
const allowedFlags = new Set(['--push', '--publish', '--dry-run', '--allow-branch', '--help', '-h']);
const validBumps = new Set(['patch', 'minor', 'major']);

function usage(message, output = console.error) {
  if (message) output(`error: ${message}\n`);
  output(`Usage: npm run release -- <patch|minor|major> [--push] [--publish] [--dry-run] [--allow-branch]

Examples:
  npm run release -- patch --dry-run    # run gates, show the next version, change nothing
  npm run release -- patch              # local commit + annotated tag only
  npm run release -- patch --push       # also push the commit and tag to origin
  npm run release -- patch --publish    # also publish to npm (implies --push)

--publish publishes the version in package.json. It requires npm authentication
(npm login locally, or NPM_TOKEN in CI) and a clean, fully gated working tree.`);
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit', ...options });
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function fail(message) {
  throw new Error(message);
}

function assertClean(label) {
  const status = capture('git', ['status', '--porcelain']);
  if (status) fail(`${label}: working tree is not clean:\n${status}\nCommit or stash changes before releasing.`);
}

function assertBranch() {
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === 'HEAD') fail('Refusing to release from a detached HEAD; check out main first.');
  if (branch !== 'main' && !flags.has('--allow-branch')) {
    fail(`Refusing to release from branch "${branch}". Switch to main or pass --allow-branch.`);
  }
  return branch;
}

function assertRemote() {
  try {
    capture('git', ['remote', 'get-url', 'origin']);
  } catch {
    fail('No "origin" remote is configured; cannot push the release commit and tag.');
  }
}

function readPackage() {
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch (error) {
    fail(`Cannot read package.json: ${error.message}`);
  }
}

function bumpVersion(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) fail(`Unsupported package version "${version}"; expected a semver like 1.2.3.`);
  let [, major, minor, patch, prerelease] = match;
  major = Number(major);
  minor = Number(minor);
  patch = Number(patch);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  // npm's semver.inc(version, 'patch') promotes a prerelease to its stable patch.
  return prerelease ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
}

function writeVersion(nextVersion) {
  const current = readFileSync(packagePath, 'utf8');
  // Replace only the top-level version field so the release commit does not
  // reformat unrelated arrays/objects in package.json.
  const updated = current.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${nextVersion}$2`);
  if (updated === current) fail('Could not find the top-level version field in package.json.');
  writeFileSync(packagePath, updated);
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = nextVersion;
    if (lock.packages && lock.packages['']) lock.packages[''].version = nextVersion;
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
}

function runGates() {
  console.log('\n[release] running npm test');
  run(npm, ['test']);
  console.log('\n[release] running npm run check:generate');
  run(npm, ['run', 'check:generate']);
  console.log('\n[release] running npm run check:fidelity');
  run(npm, ['run', 'check:fidelity']);
  // The gates must not leave generated artifacts or test byproducts behind.
  assertClean('after gates');
}

function main() {
  if (flags.has('--help') || flags.has('-h')) {
    usage(undefined, console.log);
    return;
  }
  for (const flag of flags) {
    if (!allowedFlags.has(flag)) {
      usage(`unknown option: ${flag}`);
      process.exitCode = 1;
      return;
    }
  }
  const bumpArgs = args.filter(argument => !argument.startsWith('-'));
  if (bumpArgs.length > 1) {
    usage(`expected one bump type, got: ${bumpArgs.join(' ')}`);
    process.exitCode = 1;
    return;
  }
  if (!bump) {
    usage('missing bump type');
    process.exitCode = 1;
    return;
  }
  if (!validBumps.has(bump)) {
    usage(`invalid bump type: ${bump}`);
    process.exitCode = 1;
    return;
  }

  const publish = flags.has('--publish');
  const push = flags.has('--push') || publish;
  const dryRun = flags.has('--dry-run');
  if (publish && !flags.has('--push')) {
    console.log('[release] --publish implies --push');
  }

  assertClean('before release');
  const branch = assertBranch();
  if (push && !dryRun) assertRemote();

  const manifest = readPackage();
  if (!manifest.name || !manifest.version) fail('package.json is missing name or version.');
  if (manifest.private) {
    fail('package.json has "private": true; remove it before configuring a publishable release.');
  }
  if (manifest.name.startsWith('@') && manifest.publishConfig?.access !== 'public') {
    fail('Scoped packages must set publishConfig.access to "public" before publishing.');
  }

  const nextVersion = bumpVersion(manifest.version, bump);
  const tag = `v${nextVersion}`;
  if (capture('git', ['tag', '--list', tag])) {
    fail(`Tag ${tag} already exists; choose a different bump or delete the local tag.`);
  }

  console.log(`[release] ${manifest.name}: ${manifest.version} -> ${nextVersion} (${tag})`);
  runGates();

  if (dryRun) {
    console.log(JSON.stringify({
      status: 'dry-run',
      name: manifest.name,
      from: manifest.version,
      to: nextVersion,
      tag,
      branch,
      wouldPush: push,
      wouldPublish: publish,
    }, null, 2));
    return;
  }

  writeVersion(nextVersion);
  if (readPackage().version !== nextVersion) fail('package.json version did not update to ' + nextVersion);
  const files = ['package.json', ...(existsSync(lockPath) ? ['package-lock.json'] : [])];
  run('git', ['add', ...files]);
  run('git', ['commit', '-m', `chore(release): ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);

  // Publish before pushing the tag: the tag triggers the CI publish workflow,
  // which checks npm and skips a version that this local publish already shipped.
  if (publish) {
    const publishArgs = ['publish', '--access', 'public'];
    if (nextVersion.includes('-')) publishArgs.push('--tag', 'next');
    console.log(`\n[release] publishing ${manifest.name}@${nextVersion} to npm`);
    run(npm, publishArgs);
    console.log(`[release] published ${manifest.name}@${nextVersion}`);
  }

  if (push) {
    console.log(`\n[release] pushing ${branch} and ${tag} to origin`);
    run('git', ['push', 'origin', branch]);
    run('git', ['push', 'origin', tag]);
  }

  console.log(JSON.stringify({
    status: 'released',
    name: manifest.name,
    from: manifest.version,
    to: nextVersion,
    tag,
    branch,
    commit: capture('git', ['rev-parse', 'HEAD']),
    pushed: push,
    published: publish,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`\n[release] failed: ${error.message}`);
  process.exitCode = 1;
}
