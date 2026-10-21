import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Resolve Pi's session root the same way the CLI does.
 * `PI_CODING_AGENT_SESSION_DIR` wins; otherwise sessions live under the agent
 * directory (`PI_CODING_AGENT_DIR`, default `~/.pi/agent`).
 */
export function resolveSessionRoot(env = process.env) {
  if (env.PI_CODING_AGENT_SESSION_DIR) return resolve(env.PI_CODING_AGENT_SESSION_DIR);
  const agentDir = env.PI_CODING_AGENT_DIR
    ? resolve(env.PI_CODING_AGENT_DIR)
    : join(env.HOME || homedir(), '.pi', 'agent');
  return join(agentDir, 'sessions');
}

/**
 * Pi names a workspace session directory by dropping the leading separator and
 * replacing `/`, `\`, and `:` with `-`, then wrapping the result in `--`.
 * Example: /Users/you/proj -> --Users-you-proj--
 */
export function workspaceSlug(cwd) {
  const resolved = resolve(cwd);
  return `--${resolved.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
}

export function workspaceSessionDir(cwd, { root = resolveSessionRoot(), env } = {}) {
  if (env) root = resolveSessionRoot(env);
  return join(root, workspaceSlug(cwd));
}

async function regularJsonl(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const path = join(dir, entry.name);
    const info = await stat(path);
    files.push({ path, name: entry.name, modified: info.mtime, size: info.size });
  }
  return files;
}

function sessionId(name) {
  const parts = name.split('_');
  return (parts.length > 1 ? parts.slice(1).join('_') : name).replace(/\.jsonl$/, '');
}

/**
 * List only the sessions for `cwd`, newest modification time first. Never walks
 * the sessions root, so another workspace's private history stays out of scope.
 * `exclude` accepts absolute session paths (for example `$PI_SESSION_FILE`).
 */
export async function listWorkspaceSessions(cwd, { root = resolveSessionRoot(), env, exclude = [] } = {}) {
  if (env) root = resolveSessionRoot(env);
  const dir = workspaceSessionDir(cwd, { root });
  const excluded = new Set(exclude.filter(Boolean).map(path => resolve(path)));
  const files = await regularJsonl(dir);
  return files
    .filter(file => !excluded.has(resolve(file.path)))
    .sort((a, b) => b.modified - a.modified)
    .map(file => ({
      id: sessionId(file.name),
      name: file.name,
      path: file.path,
      modified: file.modified,
      size: file.size,
    }));
}

/** Read the first line (the session header) without loading the transcript. */
export async function readSessionHeader(path) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const line = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0];
    const header = JSON.parse(line);
    if (header.type !== 'session') throw new Error(`Not a Pi session header: ${path}`);
    return header;
  } finally {
    await handle.close();
  }
}

/** Return the latest `/name` recorded in a session, or null. */
export async function readSessionName(path) {
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let name = null;
  for await (const line of lines) {
    if (!line.includes('"session_info"')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'session_info' && typeof entry.name === 'string') name = entry.name;
    } catch {
      // A corrupt line is not a session name; keep scanning.
    }
  }
  return name;
}

/**
 * pi-subagents persists one transcript per child under the parent workspace's
 * `subagent-artifacts/` directory. This lists those artifacts, newest first,
 * without crossing into another workspace.
 */
export async function listSubagentTranscripts(cwd, { root = resolveSessionRoot(), env } = {}) {
  if (env) root = resolveSessionRoot(env);
  const dir = join(workspaceSessionDir(cwd, { root }), 'subagent-artifacts');
  const files = await regularJsonl(dir);
  return files
    .filter(file => file.name.endsWith('_transcript.jsonl'))
    .sort((a, b) => b.modified - a.modified)
    .map(file => {
      const match = file.name.match(/^(.+)_([^_]+)_transcript\.jsonl$/);
      return {
        runId: match ? match[1] : file.name.replace(/_transcript\.jsonl$/, ''),
        agent: match ? match[2] : null,
        name: file.name,
        path: file.path,
        modified: file.modified,
        size: file.size,
      };
    });
}

export function isInside(base, path) {
  const rel = relative(resolve(base), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
