/**
 * Session teardown for fixtures that build a Pi AgentSession directly.
 *
 * `createAgentSession()` returns an AgentSession, and `AgentSession.dispose()`
 * only disposes that session object. The `session_shutdown` lifecycle event is
 * emitted by AgentSessionRuntime.dispose(), which a fixture does not own. An
 * extension runtime therefore keeps its intervals (for pi-subagents: the result
 * watcher and wait reconcilers) alive after `session.dispose()` and keeps
 * touching a context that is stale once the session is invalidated.
 *
 * Emit the real shutdown event through the public extension runner first, then
 * dispose the session. Cleanup must be driven by the lifecycle contract. The
 * `finalizeCheck` helper below adds one bounded, explicit exit after cleanup;
 * it does not replace shutdown-driven teardown and never turns a failure green.
 */
import { rm } from 'node:fs/promises';

const disposed = new WeakSet();

/** Reject a cleanup promise that cannot finish, so teardown never hangs a check. */
export function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_accept, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not finish within ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Close an HTTP fixture server deterministically. Existing keep-alive sockets are
 * destroyed first; `server.close()` then gets a bounded wait. A stuck close is a
 * real cleanup failure, not something the caller should hide.
 */
export async function closeTestServer(server, { timeoutMs = 5000 } = {}) {
  if (!server) return;
  server.closeAllConnections?.();
  if (!server.listening) return;
  await withTimeout(new Promise((accept, reject) => {
    server.close(error => error ? reject(error) : accept());
  }), timeoutMs, 'server close');
}

/** Remove a fixture directory with a bounded wait after the session is torn down. */
export async function removeTestDirectory(directory, { timeoutMs = 5000 } = {}) {
  if (!directory) return;
  await withTimeout(rm(directory, { recursive: true, force: true }), timeoutMs, `remove ${directory}`);
}

/**
 * Last-resort teardown for fixture scripts. The whole cleanup gets one bounded
 * budget (5s by default), then the process exits explicitly with the already
 * decided code. A referenced interval is invisible to `_getActiveHandles()` and
 * would otherwise keep the check alive forever; a shutdown hook that never
 * settles must not skip the exit either. A cleanup timeout is itself a failure.
 */
export async function finalizeCheck(cleanup, { timeoutMs = 5000 } = {}) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise((_accept, reject) => {
        timer = setTimeout(() => reject(new Error(`cleanup exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    process.exitCode = 1;
    console.error(JSON.stringify({ lifecycle: 'cleanup-failed', error: String(error) }));
  } finally {
    clearTimeout(timer);
  }
  const code = process.exitCode ?? 0;
  // Flush already-queued stdout/stderr before the explicit exit, without waiting
  // on any leaked timer or socket.
  await new Promise(resolve => process.stdout.write('', resolve)).catch(() => {});
  await new Promise(resolve => process.stderr.write('', resolve)).catch(() => {});
  process.exit(code);
}

/**
 * Track intervals created while a fixture owns a session.
 *
 * pi-subagents unrefs its watcher/reconciler timers, so they do not keep the
 * process alive and a plain exit is not evidence that teardown worked. This
 * records the actual interval handles so a test can assert that the lifecycle
 * event cleared them.
 */
export function trackIntervals() {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const live = new Set();
  globalThis.setInterval = function trackedSetInterval(...args) {
    const timer = originalSetInterval(...args);
    live.add(timer);
    return timer;
  };
  globalThis.clearInterval = function trackedClearInterval(timer) {
    live.delete(timer);
    return originalClearInterval(timer);
  };
  return {
    live,
    restore() {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    },
  };
}

export async function disposeTestSession(session, { timeoutMs = 5000 } = {}) {
  if (!session || disposed.has(session)) return;
  disposed.add(session);
  try {
    // A stuck extension shutdown handler must not prevent session disposal or
    // bypass the caller's cleanup budget.
    await withTimeout(Promise.resolve().then(
      () => session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }),
    ), timeoutMs, 'session shutdown');
  } finally {
    session.dispose();
  }
}
