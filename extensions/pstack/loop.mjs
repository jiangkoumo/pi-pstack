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
 *   /loop stop [reason]
 *   /loop resume [--max-turns <n>]
 *   /loop [run] [--max-turns <n>] [--until <cmd>] [--until-timeout <sec>] [--allow-dirty] [--] <goal...>
 */
export function parseLoopArgs(rawArgs) {
  const text = String(rawArgs ?? '').trim();
  if (!text) return { action: 'status' };

  const tokens = [];
  let current = '';
  let inQuote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuote) {
      if (char === inQuote) inQuote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (/\s/.test(char)) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  const first = tokens[0]?.toLowerCase();
  if (first === 'status' && tokens.length === 1) return { action: 'status' };
  if (first === 'stop') {
    const reason = tokens.slice(1).join(' ').trim() || 'operator-stopped';
    return { action: 'stop', reason };
  }
  if (first === 'resume') {
    let maxTurns;
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i] === '--max-turns' && i + 1 < tokens.length) {
        maxTurns = Number.parseInt(tokens[i + 1], 10);
        i++;
      } else {
        throw new Error(`Unknown option for resume: ${tokens[i]}; use /loop resume [--max-turns <n>]`);
      }
    }
    if (maxTurns !== undefined && (Number.isNaN(maxTurns) || maxTurns < MIN_MAX_TURNS || maxTurns > MAX_MAX_TURNS)) {
      throw new Error(`--max-turns must be between ${MIN_MAX_TURNS} and ${MAX_MAX_TURNS}`);
    }
    return { action: 'resume', maxTurns };
  }

  // Otherwise it's 'run' (or bare options + goal)
  let startIndex = 0;
  if (first === 'run') startIndex = 1;

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
      maxTurns = Number.parseInt(tokens[i + 1], 10);
      if (Number.isNaN(maxTurns) || maxTurns < MIN_MAX_TURNS || maxTurns > MAX_MAX_TURNS) {
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
      untilTimeoutSec = Number.parseInt(tokens[i + 1], 10);
      if (Number.isNaN(untilTimeoutSec) || untilTimeoutSec < MIN_UNTIL_TIMEOUT_SEC || untilTimeoutSec > MAX_UNTIL_TIMEOUT_SEC) {
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
  if (!goal) throw new Error('Usage: /loop [run] [--max-turns <n>] [--until <cmd>] [--until-timeout <sec>] [--allow-dirty] [--] <goal>');

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
 * Determine the next step at turn boundary.
 *
 * @param {object} state - Current loop state.
 * @param {object} [predicateResult] - Optional result from executing the --until command.
 *   { exitCode: number, error?: string, timedOut?: boolean }
 * @param {object} [options] - Optional host outcome flags.
 *   { outcome?: 'completed' | 'aborted' | 'error', canContinue?: boolean }
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
 * Render prompt text for a loop turn.
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
