import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseConfig } from './runtime.mjs';

export function configPaths(agentDir, cwd, configDirName) {
  return { user: resolve(agentDir, 'pstack.json'), project: resolve(cwd, configDirName, 'pstack.json') };
}
export async function readConfig(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, roles: {} };
    throw error;
  }
  try { return parseConfig(JSON.parse(raw), path); } catch (error) {
    throw new Error(`${path}: ${error.message}`, { cause: error });
  }
}
export async function loadConfig(paths, trusted) {
  const user = await readConfig(paths.user);
  const project = trusted ? await readConfig(paths.project) : { version: 1, roles: {} };
  return { version: 1, roles: { ...user.roles, ...project.roles }, projectIgnored: !trusted };
}
export async function updateConfig(path, transform) {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = path + '.lock';
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`${lockPath}: configuration is being edited; inspect and remove a stale lock after confirming no writer remains`);
    throw error;
  }
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    const current = await readConfig(path);
    const next = parseConfig(transform(current), path);
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(next, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    return true;
  } finally {
    await rm(temporary, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
