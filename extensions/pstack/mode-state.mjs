import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Mode state keyed by Pi session id. Pi only writes the session transcript after
 * the first user/assistant message, and a `--session-id` lookup that finds no
 * transcript allocates a fresh timestamped file name. Keying by id keeps mode
 * recoverable across processes before (and independently of) that transcript.
 */
export function sessionModeStatePath(agentDir, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('mode-state: session id must be a non-empty string');
  }
  return join(agentDir, 'pstack-sessions', `${encodeURIComponent(sessionId)}.json`);
}

function parseState(value, path) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).length !== 2 || value.version !== 1 || typeof value.enabled !== 'boolean') {
    throw new Error(`${path}: invalid mode state; expected { version: 1, enabled: boolean }`);
  }
  return { version: 1, enabled: value.enabled };
}

/** Read the authoritative file on every call. A missing file means mode is off. */
export function loadModeState(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { version: 1, enabled: false };
    throw error;
  }
  let value;
  try { value = JSON.parse(raw); }
  catch (error) { throw new Error(`${path}: invalid mode state JSON: ${error.message}`, { cause: error }); }
  return parseState(value, path);
}

/** Persist before returning, including when no Pi session entry exists yet. */
export function saveModeState(path, state) {
  const next = parseState(state, path);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  let fd;
  let created = false;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    created = true;
    writeFileSync(fd, JSON.stringify(next, null, 2) + '\n');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    return next;
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (created) {
      try { unlinkSync(temporary); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}
