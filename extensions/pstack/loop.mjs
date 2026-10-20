import { randomUUID } from 'node:crypto';

export const LOOP_ENTRY = 'pstack.loop.v1';
export const LOOP_TURN_TYPE = 'pstack.loop.turn.v1';

export const DEFAULT_MAX_TURNS = 8;
export const MIN_MAX_TURNS = 1;
export const MAX_MAX_TURNS = 100;
export const DEFAULT_UNTIL_TIMEOUT_SEC = 60;
export const MIN_UNTIL_TIMEOUT_SEC = 1;
export const MAX_UNTIL_TIMEOUT_SEC = 600;

/**
 * Parse CLI arguments for /loop command.
 * Supported forms:
 *   /loop status
 *   /loop stop
 *   /loop resume [--max-turns <n>]
 *   /loop run [--max-turns <n>] --until <cmd> [--until-timeout <sec>] [--allow-dirty] [--] <goal...>
 */
export function parseLoopArgs(rawArgs) {
  const text = String(rawArgs ?? '').trim();
  if (!text) return { action: 'status' };

  const tokens = [];
  let current = '';
  let inQuote = null;
  let wordStarted = false;
  // Split shell words without expanding variables, substitutions, or operators.
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\' && inQuote !== "'") {
      if (i + 1 >= text.length) throw new Error('Unfinished escape in /loop arguments');
      const next = text[i + 1];
      if (!inQuote || ['$', '`', '"', '\\', '\n'].includes(next)) {
        if (next !== '\n') { current += next; wordStarted = true; }
        i++;
      } else {
        current += char;
        wordStarted = true;
      }
    } else if (inQuote) {
      if (char === inQuote) inQuote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      inQuote = char;
      wordStarted = true;
    } else if (/\s/.test(char)) {
      if (wordStarted) { tokens.push(current); current = ''; wordStarted = false; }
    } else {
      current += char;
      wordStarted = true;
    }
  }
  if (inQuote) throw new Error('Unclosed quote in /loop arguments');
  if (wordStarted) tokens.push(current);

  const first = tokens[0]?.toLowerCase();
  if (first === 'status' && tokens.length === 1) return { action: 'status' };
  if (first === 'stop' && tokens.length === 1) {
    return { action: 'stop', reason: 'operator-stopped' };
  }
  if (first === 'resume') {
    let maxTurns;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i] === '--max-turns' && i + 1 < tokens.length) {
        maxTurns = Number(tokens[i + 1]);
        i++;
      } else {
        throw new Error(`Unknown option for resume: ${tokens[i]}; use /loop resume [--max-turns <n>]`);
      }
    }
    if (maxTurns !== undefined && (!Number.isInteger(maxTurns) || maxTurns < MIN_MAX_TURNS || maxTurns > MAX_MAX_TURNS)) {
      throw new Error(`--max-turns must be between ${MIN_MAX_TURNS} and ${MAX_MAX_TURNS}`);
    }
    return { action: 'resume', maxTurns };
  }

  if (first !== 'run') throw new Error('Usage: /loop run --until <cmd> <goal> | status | stop | resume [--max-turns <n>]');
  const startIndex = 1;

  let maxTurns = DEFAULT_MAX_TURNS;
  let untilCommand = null;
  let untilTimeoutSec = DEFAULT_UNTIL_TIMEOUT_SEC;
  let allowDirty = false;
  const goalTokens = [];

  for (let i = startIndex; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === '--') {
      goalTokens.push(...tokens.slice(i + 1));
      break;
    }
    if (tok === '--max-turns') {
      if (i + 1 >= tokens.length) throw new Error('--max-turns requires a positive integer');
      maxTurns = Number(tokens[i + 1]);
      if (!Number.isInteger(maxTurns) || maxTurns < MIN_MAX_TURNS || maxTurns > MAX_MAX_TURNS) {
        throw new Error(`--max-turns must be between ${MIN_MAX_TURNS} and ${MAX_MAX_TURNS}`);
      }
      i++;
      continue;
    }
    if (tok === '--until') {
      if (i + 1 >= tokens.length) throw new Error('--until requires a shell command string');
      untilCommand = tokens[i + 1].trim();
      if (!untilCommand) throw new Error('--until command cannot be empty');
      i++;
      continue;
    }
    if (tok === '--until-timeout') {
      if (i + 1 >= tokens.length) throw new Error('--until-timeout requires seconds');
      untilTimeoutSec = Number(tokens[i + 1]);
      if (!Number.isInteger(untilTimeoutSec) || untilTimeoutSec < MIN_UNTIL_TIMEOUT_SEC || untilTimeoutSec > MAX_UNTIL_TIMEOUT_SEC) {
        throw new Error(`--until-timeout must be between ${MIN_UNTIL_TIMEOUT_SEC} and ${MAX_UNTIL_TIMEOUT_SEC} seconds`);
      }
      i++;
      continue;
    }
    if (tok === '--allow-dirty') {
      allowDirty = true;
      continue;
    }
    if (tok.startsWith('-')) {
      throw new Error(`Unknown /loop option: ${tok}`);
    }
    goalTokens.push(tok);
  }

  const goal = goalTokens.join(' ').trim();
  if (!goal) throw new Error('Usage: /loop run [--max-turns <n>] --until <cmd> [--until-timeout <sec>] [--allow-dirty] [--] <goal>');
  if (!untilCommand) throw new Error('--until is required to define when the loop is complete');

  return {
    action: 'run',
    goal,
    maxTurns,
    until: untilCommand ? { command: untilCommand, timeoutSec: untilTimeoutSec } : null,
    allowDirty,
  };
}

/**
 * Reconstruct loop state from the branch entries.
 */
export function loopFromBranch(entries) {
  if (!Array.isArray(entries)) return { active: false, state: null };

  for (const entry of [...entries].reverse()) {
    if (entry.type !== 'custom' || entry.customType !== LOOP_ENTRY) continue;
    const data = entry.data;
    if (!data || data.version !== 1 || typeof data.runId !== 'string' || typeof data.status !== 'string') {
      throw new Error('Unsupported or malformed pstack loop entry on active branch');
    }
    return {
      active: data.status === 'running',
      state: data,
    };
  }
  return { active: false, state: null };
}

/**
 * Create a fresh initial running state.
 */
export function createInitialLoopState(options) {
  const now = new Date().toISOString();
  return {
    version: 1,
    runId: randomUUID(),
    status: 'running',
    goal: options.goal,
    turn: 1,
    maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
    until: options.until ?? null,
    allowDirty: Boolean(options.allowDirty),
    startedAt: now,
    updatedAt: now,
    reason: 'initial-run',
    lastPredicateResult: null,
  };
}

/**
 * @typedef {{ exitCode: number | null, error?: string, timedOut?: boolean }} PredicateResult
 * @typedef {object} LoopState
 * @property {number} version
 * @property {string} runId
 * @property {string} status
 * @property {string} goal
 * @property {number} turn
 * @property {number} maxTurns
 * @property {{ command: string, timeoutSec?: number } | null} until
 * @property {boolean} allowDirty
 * @property {string} startedAt
 * @property {string} updatedAt
 * @property {string} reason
 * @property {PredicateResult | null} lastPredicateResult
 */

/**
 * Determine the next step at turn boundary.
 *
 * @param {LoopState} state - Current loop state.
 * @param {PredicateResult | null} [predicateResult] - Result of the --until command.
 * @param {{ outcome?: 'completed' | 'aborted' | 'error' }} [options] - Host outcome flags.
 * @returns {{ action: 'stop' | 'continue', nextState: LoopState }}
 */
export function decideNextStep(state, predicateResult = null, options = {}) {
  const now = new Date().toISOString();

  if (state.status !== 'running') {
    return { action: 'stop', nextState: state };
  }

  // Host level abort or error
  if (options.outcome === 'aborted') {
    return {
      action: 'stop',
      nextState: { ...state, status: 'stopped', reason: 'operator-aborted', updatedAt: now }
    };
  }
  if (options.outcome === 'error') {
    return {
      action: 'stop',
      nextState: { ...state, status: 'failed', reason: 'turn-error', updatedAt: now }
    };
  }

  // Predicate evaluation if predicate exists
  if (predicateResult) {
    if (predicateResult.timedOut) {
      return {
        action: 'stop',
        nextState: {
          ...state,
          status: 'failed',
          reason: 'predicate-timeout',
          lastPredicateResult: predicateResult,
          updatedAt: now
        }
      };
    }
    if (predicateResult.error || predicateResult.exitCode >= 126) {
      return {
        action: 'stop',
        nextState: {
          ...state,
          status: 'failed',
          reason: 'predicate-error',
          lastPredicateResult: predicateResult,
          updatedAt: now
        }
      };
    }
    if (predicateResult.exitCode === 0) {
      // Success! Predicate satisfied.
      return {
        action: 'stop',
        nextState: {
          ...state,
          status: 'completed',
          reason: 'predicate-satisfied',
          lastPredicateResult: predicateResult,
          updatedAt: now
        }
      };
    }
    // Predicate non-zero (1..125) means goal not satisfied yet. Continue checking budget.
  }

  // Check budget limits
  if (state.turn >= state.maxTurns) {
    return {
      action: 'stop',
      nextState: {
        ...state,
        status: 'stopped',
        reason: 'budget-exhausted',
        lastPredicateResult: predicateResult ?? state.lastPredicateResult,
        updatedAt: now
      }
    };
  }

  // Advance turn
  return {
    action: 'continue',
    nextState: {
      ...state,
      turn: state.turn + 1,
      reason: 'turn-advanced',
      lastPredicateResult: predicateResult ?? state.lastPredicateResult,
      updatedAt: now
    }
  };
}

/**
 * Register the notification fallback for Pi aborts that skip agent_before_settle.
 * Entry contract: call once from the extension factory, before other settled
 * observers. agent_settled is notification-only; appendEntry persists state,
 * without returning continuation drafts or executing a predicate.
 *
 * @param {Pick<import('@earendil-works/pi-coding-agent').ExtensionAPI, 'on' | 'appendEntry'>} pi
 * @returns {() => void} Unsubscribe during runtime teardown if needed.
 */
export function registerLoopAbortHooks(pi) {
  return pi.on('agent_settled', (event, ctx) => {
    if (!event.aborted) return;
    const { state } = loopFromBranch(ctx.sessionManager.getBranch());
    if (!state) return;
    // Preserve explicit operator stops and all other terminal outcomes. The
    // settle path currently records an abort as stopped/operator-aborted.
    if (state.status !== 'running' && !(state.status === 'stopped' && state.reason === 'operator-aborted')) return;
    pi.appendEntry(LOOP_ENTRY, {
      ...state,
      status: 'interrupted',
      reason: 'operator-aborted',
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Render prompt text for a loop turn.
 * @param {LoopState} state
 * @param {number} turn
 * @param {PredicateResult | null} [lastPredicate]
 */
export function renderLoopPrompt(state, turn, lastPredicate = null) {
  const parts = [
    `[pstack /loop turn ${turn}/${state.maxTurns}]`,
    `Goal: ${state.goal}`,
  ];
  if (state.until) {
    parts.push(`Stop predicate: \`${state.until.command}\` (target: exit code 0).`);
  }
  if (lastPredicate) {
    parts.push(`Last predicate exit code: ${lastPredicate.exitCode} (goal not yet satisfied).`);
  }
  parts.push(
    'Instructions: Continue working towards the goal.',
    'Do not make unrequested git commits or pushes. Keep changes focused and verified.'
  );
  return parts.join('\n');
}
