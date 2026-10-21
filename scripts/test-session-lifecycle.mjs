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
 * dispose the session. Do not use `process.exit()` and do not rely on special
 * timers being unreferenced: cleanup must be driven by the lifecycle contract.
 */
const disposed = new WeakSet();

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

export async function disposeTestSession(session) {
  if (!session || disposed.has(session)) return;
  disposed.add(session);
  try {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  } finally {
    session.dispose();
  }
}
