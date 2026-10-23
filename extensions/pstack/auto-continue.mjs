import { randomUUID } from 'node:crypto';
import { extractRunItCommands, formalGateState } from './formal-commands.mjs';
import { verifyPublicationCompletion } from './publication-gate.mjs';
import { modeFromBranch } from './runtime.mjs';
import { loadModeState, sessionModeStatePath } from './mode-state.mjs';

export const AUTO_CONTINUE_ENTRY = 'pstack.auto_continue.v1';
export const AUTO_CONTINUE_TURN_TYPE = 'pstack.auto_continue.turn.v1';

export const DEFAULT_MAX_AUTO_CONTINUE_TURNS = 3;
export const MIN_AUTO_CONTINUE_TURNS = 1;
export const MAX_AUTO_CONTINUE_TURNS = 10;

export const COMPLETION_STATUS = Object.freeze({
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  BLOCKED: 'blocked',
});

export const COMPLETION_EXIT_CODES = Object.freeze({
  complete: 0,
  incomplete: 1,
  blocked: 126,
});

/**
 * Patterns indicating forward-looking unfinished intent in assistant text.
 */
const FORWARD_CONTINUATION_PATTERNS = [
  /\bNow\s+(?:let\s+me|I\s+will|I'll|we\s+will|we'll|let's|I\s+need\s+to|to)\b[^\n.!?]*/i,
  /\bNext(?:,\s*|\s+)(?:I\s+will|I'll|let\s+me|let's|step\s+is|we\s+will|we'll|I\s+need\s+to|we\s+need\s+to)\b[^\n.!?]*/i,
  /\bNext\s+steps?:\s*(?!\s*(?:you|your|user|reviewer|human|please|feel\s+free|none|nothing)\b)\S+[^\n.!?]*/i,
  /\b(?:I\s+will\s+now|I'll\s+now|let\s+me\s+now|let's\s+now)\b[^\n.!?]*/i,
  /\b(?:Let's\s+proceed\s+to|Proceeding\s+to|Moving\s+on\s+to|Continuing\s+(?:with|to))\b[^\n.!?]*/i,
  /(?:^|[.!?…\n]\s*|\b(?:now|next|so|then|and)\s+)let\s+me\s+(?:first\s+|just\s+|now\s+)?(?!know\b)[a-z]+[^\n.!?]*/i,
  /\b(?:I\s+will|I'll|Let's|We\s+will|We'll)\s+(?:fix|add|update|implement|check|verify|run|write|rewrite|create|modify|test|investigate|handle|address|refactor|re-run|do|clean|resolve|complete|finish|follow)\b[^\n.!?]*/i,
  /(?:接下来|下一步)(?:是|要|将|需要|开始|先|我们|来|做)[^\n，。！？]*/,
  /(?:现在|马上)(?:开始|来|进行|执行|写|修改|重写|更新|核对|验证|补齐|跑)[^\n，。！？]*/,
  /(?:还有(?:以下)?(?:未完成|待完成|剩余)(?:任务|步骤|工作)|未完成任务)[^\n，。！？]*/,
];

const WAITING_CONTINUATION_PATTERNS = [
  /(?:waiting for (?:continuation|next step)|please (?:say|reply) ["']?continue["']?)/i,
  /(?:等待继续|请回复[“"']?继续[”"']?)/,
];

/**
 * Patterns indicating user questions, waiting for approval, user decisions, or authorization gates.
 * Auto-continue must NOT proceed when any of these are present.
 */
const USER_GATE_OR_QUESTION_PATTERNS = [
  /[?？]/,
  /\b(?:approve|approval|which)\b/i,
  /(?:你决定|是否)/,
  /(?:授权门|等待授权|待授权|需授权|申请授权|待确认|请确认|等(?:你|您)确认|等待确认|等待批准|请批准|需要批准|待批准|等待决定|请决定)/,
  /(?:waiting\s+for\s+(?:approval|confirmation|permission|decision|input|response)|awaiting\s+(?:approval|confirmation|permission|decision)|need(?:s)?\s+(?:your\s+)?(?:approval|confirmation|decision)|approval\s+to\s+proceed|pending\s+(?:approval|confirmation))/i,
];

/**
 * Strip fenced code blocks to avoid false positives in embedded code snippets.
 */
function stripCodeBlocks(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
}

function isOptionalTask(task) {
  return /(?:[\(\[（【]\s*(?:optional|可选)\s*[\)\]）】]|\boptional\b|\b可选\b)/i.test(task);
}

/**
 * Detect unchecked Markdown task list items: `- [ ] ...`, `* [ ] ...`, `1. [ ] ...`.
 * Items marked as (optional) / [optional] are ignored and do not count as incomplete.
 */
function extractUncheckedTasks(text) {
  const tasks = [];
  const regex = /^\s*(?:[-*+]|\d+\.)\s*\[\s*\]\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const task = match[1]?.trim();
    if (task && !isOptionalTask(task)) tasks.push(task);
  }
  return tasks;
}

/**
 * Inspect assistant text for unfinished expressions, forward-looking promises,
 * or unchecked task lists.
 *
 * @param {string} text - Assistant message text.
 * @returns {{ incomplete: boolean, reason: string, pattern?: string, uncheckedTasks: string[] }}
 */
export function detectUnfinishedExpression(text) {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return { incomplete: false, reason: '', uncheckedTasks: [] };
  }

  const prose = stripCodeBlocks(raw);
  const cleanProse = prose.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '');

  // 1. Check for questions, approval requests, user decisions, or gate signals
  for (const pattern of USER_GATE_OR_QUESTION_PATTERNS) {
    if (pattern.test(cleanProse)) {
      return { incomplete: false, reason: '', uncheckedTasks: [] };
    }
  }

  // 2. Check for unchecked markdown task list items (optional items excluded)
  const uncheckedTasks = extractUncheckedTasks(raw);
  if (uncheckedTasks.length > 0) {
    const summary = uncheckedTasks.length === 1
      ? `found 1 unchecked task in task list: "${uncheckedTasks[0]}"`
      : `found ${uncheckedTasks.length} unchecked tasks in task list (e.g. "${uncheckedTasks[0]}")`;
    return {
      incomplete: true,
      reason: summary,
      pattern: uncheckedTasks[0],
      uncheckedTasks,
    };
  }

  // 3. Check for waiting/continuation request signals
  for (const pattern of WAITING_CONTINUATION_PATTERNS) {
    const match = cleanProse.match(pattern);
    if (match) {
      return {
        incomplete: true,
        reason: `assistant message indicated waiting for continuation: "${match[0]}"`,
        pattern: match[0],
        uncheckedTasks: [],
      };
    }
  }

  // 4. Check for forward-looking continuation phrases
  for (const pattern of FORWARD_CONTINUATION_PATTERNS) {
    const match = cleanProse.match(pattern);
    if (match) {
      const cleaned = match[0].trim().replace(/^[.!?…\s]+/, '');
      return {
        incomplete: true,
        reason: `assistant message contained unfinished intent: "${cleaned}"`,
        pattern: cleaned,
        uncheckedTasks: [],
      };
    }
  }

  return { incomplete: false, reason: '', uncheckedTasks: [] };
}

// ---------------------------------------------------------------------------
// Unified Completion Self-Check Registry & Evaluators
// ---------------------------------------------------------------------------

const CHECKER_REGISTRY = new Map();

/**
 * Register a completion checker for a workflow type.
 *
 * @param {string} type - Identifier (e.g. 'publication', 'formal_verification').
 * @param {(options: any) => Promise<any> | any} checkerFn
 */
export function registerCompletionChecker(type, checkerFn) {
  if (typeof type !== 'string' || !type) throw new Error('Checker type must be a non-empty string');
  if (typeof checkerFn !== 'function') throw new Error('Checker must be a function');
  CHECKER_REGISTRY.set(type, checkerFn);
}

/**
 * Evaluate completion for assistant text expressions.
 */
export function evaluateUnfinishedExpressionCompletion(options = {}) {
  const text = options.assistantText ?? options.text ?? '';
  const detection = detectUnfinishedExpression(text);
  if (detection.incomplete) {
    return {
      type: 'assistant_expression',
      complete: false,
      status: COMPLETION_STATUS.INCOMPLETE,
      exitCode: COMPLETION_EXIT_CODES.incomplete,
      missing: [detection.reason],
      reason: detection.reason,
      details: detection,
    };
  }
  return {
    type: 'assistant_expression',
    complete: true,
    status: COMPLETION_STATUS.COMPLETE,
    exitCode: COMPLETION_EXIT_CODES.complete,
    missing: [],
    reason: 'No unfinished expressions detected in assistant text.',
    details: detection,
  };
}

/**
 * Evaluate publication completion (opening-a-pr and feature playbooks).
 */
export async function evaluatePublicationCompletion(options = {}) {
  const pub = await verifyPublicationCompletion(options);
  const complete = pub.status === 'complete';
  return {
    type: 'publication',
    complete,
    status: pub.status,
    exitCode: pub.exitCode,
    missing: pub.missing || [],
    reason: pub.reason,
    details: pub,
  };
}

/**
 * Parse numeric quantities associated with key metrics from text.
 */
function extractQuantities(text) {
  const quantities = {};
  const t = String(text ?? '');

  const stepMatch = t.match(/(\d+)\s+steps?\b/i);
  if (stepMatch) quantities.steps = Number(stepMatch[1]);

  const memberMatch = t.match(/(\d+)\s+members?\b/i);
  if (memberMatch) quantities.members = Number(memberMatch[1]);

  const scenarioMatch = t.match(/(\d+)\s+scenarios?\b/i);
  if (scenarioMatch) quantities.scenarios = Number(scenarioMatch[1]);

  const stateMatch = t.match(/(\d+)\s+(?:distinct\s+)?states?\b/i);
  if (stateMatch) quantities.states = Number(stateMatch[1]);

  return quantities;
}

/** Preserve nested evidence headings while excluding sections after Record. */
function extractFormalRecord(skillText) {
  const lines = skillText.split(/\r?\n/);
  const start = lines.findIndex(line => /^(?:#{2,6}\s*(?:Record|What the generated skill must record)\b|\*\*Record\*\*)/i.test(line));
  if (start < 0) return '';
  const level = lines[start].match(/^#+/)?.[0].length ?? 2;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    const heading = line.match(/^(#{1,6})\s/);
    if (heading && heading[1].length <= level) break;
    body.push(line);
  }
  return body.join('\n');
}

function hasFormalBreakageEvidence(text, requiredCycles) {
  const hasFailure = /(?:exit\s*(?:status|code)?\s*[:=]?\s*(?:[1-9]\d*|non[- ]zero)|\brc\s*[:=]\s*[1-9]\d*|failing|非零退出|退出(?:码|状态)?\s*[:：=]?\s*[1-9]\d*)/i.test(text);
  const hasBreakage = /(?:break|broken|counterexample|破坏|反例)/i.test(text);
  if (!hasFailure || !hasBreakage) return false;
  if (requiredCycles === 1) return true;

  // Count cycle identities, not mentions: repeating cycle 1 is still one cycle.
  const labels = [...text.matchAll(/\b(?:break\s*(?:cycle\s*)?|cycle\s*)(\d+)\b|第\s*([\d一二三四五六七八九十]+)\s*轮/gi)];
  const chineseNumbers = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };
  const cycles = new Set(labels.map(match => {
    const label = match[1] ?? match[2];
    return chineseNumbers[label] ?? String(Number(label));
  }));
  if (labels.length) return cycles.size >= requiredCycles;
  // Preserve unnumbered summaries already supported by the completion contract.
  const descriptions = text.match(/(?:deliberate\s*break|breakage|break\s*(?:and|&)\s*restore)/gi) ?? [];
  return descriptions.length >= requiredCycles || /(?:two\s+breaks|twice|both\s+breaks)/i.test(text);
}

/**
 * Evaluate formal verification completion (create-formal-verification-skill and
 * maintain-formal-verification-skill).
 *
 * Rules:
 * 1. Every "Run it" command in SKILL.md must be re-run, and output quantities/conclusions
 *    must match the descriptions in SKILL.md (steps, states, members, scenarios).
 * 2. Record section must be fully written (tool version, sync commit, bounds, assumptions, exclusions).
 * 3. Final completion report must be provided with coverage scope, deliberate breakage evidence
 *    (2 break/restore cycles for create, 1 for maintain), and unverified scope.
 */
export function evaluateFormalVerificationCompletion(options = {}) {
  const missing = [];
  const skillText = String(options.skillText ?? '').trim();
  const reportText = String(options.reportText ?? '').trim();
  const commandRuns = Array.isArray(options.commandRuns) ? options.commandRuns : [];
  const kind = options.kind === 'maintain' ? 'maintain' : 'create';
  const tlcAvailable = options.tlcAvailable !== false;
  const recordBody = extractFormalRecord(skillText);

  // A. TLC tool availability check
  if (!tlcAvailable) {
    const hasNoTlcStatement = (reportText + '\n' + skillText).includes('未做形式化验证，原因是缺少 TLC');
    if (hasNoTlcStatement) {
      return {
        type: 'formal_verification',
        complete: false,
        status: COMPLETION_STATUS.BLOCKED,
        exitCode: COMPLETION_EXIT_CODES.blocked,
        missing: ['TLC tool configured'],
        reason: '未做形式化验证，原因是缺少 TLC',
        details: { tlcAvailable: false },
      };
    }
    missing.push('TLC unavailable and missing required fallback statement: 未做形式化验证，原因是缺少 TLC');
  }

  // B. Rule 1: SKILL.md Run it commands execution & count matching
  if (!skillText) {
    missing.push('SKILL.md content is required');
  } else {
    const commandMatches = extractRunItCommands(skillText);

    if (commandMatches.length === 0) {
      missing.push('SKILL.md must contain at least one "Run it" command');
    } else {
      for (const cmd of commandMatches) {
        const found = commandRuns.find(run => {
          if (!run || typeof run.command !== 'string') return false;
          return run.command.trim() === cmd;
        });
        if (!found) {
          missing.push(`Re-run command: ${cmd}`);
        }
      }
    }

    // Check quantities match
    const skillQuantities = extractQuantities(skillText);
    for (const run of commandRuns) {
      const outputQuantities = {
        ...extractQuantities(run.output ?? ''),
        ...(run.counts ?? {}),
      };

      for (const key of ['steps', 'members', 'scenarios', 'states']) {
        if (skillQuantities[key] !== undefined && outputQuantities[key] !== undefined) {
          if (skillQuantities[key] !== outputQuantities[key]) {
            missing.push(`Command output quantities (${outputQuantities[key]} ${key}) do not match SKILL.md description (${skillQuantities[key]} ${key})`);
          }
        }
      }
    }
  }

  // C. Rule 2: Record section fully written
  if (skillText) {
    const hasRecordHeading = /(?:^|\n)##+\s*(?:Record|What the generated skill must record)\b/i.test(skillText)
      || /(?:^|\n)\*\*Record\*\*/i.test(skillText);
    if (!hasRecordHeading) {
      missing.push('SKILL.md missing "Record" section');
    } else {
      const hasToolVersion = /(?:tool\s*version|java\s*\d+|tla2tools|tlc|工具版本)/i.test(recordBody);
      const hasSyncCommit = /(?:sync\s*commit|commit\s*[:\s]+[0-9a-f]{7,40}|同步提交)/i.test(recordBody);
      const hasBounds = /(?:bounds?|assumptions?|边界|假设)/i.test(recordBody);
      const hasExclusions = /(?:left\s*out|unverified|not\s*cover(?:ed)?|exclusions?|未验证|未覆盖|没有覆盖|不覆盖|不在范围|遗留|未包含)/i.test(recordBody);

      if (!hasToolVersion) missing.push('Record section missing tool version and resolution');
      if (!hasSyncCommit) missing.push('Record section missing sync commit');
      if (!hasBounds) missing.push('Record section missing bounds and assumptions');
      if (!hasExclusions) missing.push('Record section missing what is left out / exclusions');
    }
  }

  // D. Rule 3: Final report coverage, deliberate breakage evidence, and unverified parts
  if (!reportText) {
    missing.push('Final completion report is missing');
  } else {
    // 1. Coverage scope
    // Exclusion labels also contain 覆盖/范围/验证; they cannot establish
    // positive coverage on their own.
    const coverageText = reportText.replace(/(?:未验证|未覆盖|没有覆盖|不覆盖|不在范围|遗留|未包含)[^\n。；]*/g, '');
    const hasCoverage = /(?:coverage|scope|verified|guarding|target\s*promise|覆盖|范围|已验证|验证了|检查范围)/i.test(coverageText);
    if (!hasCoverage) missing.push('Final report missing coverage scope');

    // 2. Deliberate breakage evidence
    const requiredCycles = kind === 'create' ? 2 : 1;
    const hasBreakEvidence = hasFormalBreakageEvidence(reportText, requiredCycles)
      || hasFormalBreakageEvidence(recordBody, requiredCycles);

    if (kind === 'create') {
      if (!hasBreakEvidence) {
        missing.push('Final report missing evidence of deliberate breakage (two break and restore cycles with counterexample and failing exit status)');
      }
    } else {
      if (!hasBreakEvidence) {
        missing.push('Final report missing deliberate break and restore evidence showing updated check can still fail');
      }
    }

    // 3. Unverified scope
    const hasUnverified = /(?:unverified|not\s*cover(?:ed)?|out\s*of\s*scope|left\s*out|remaining|未验证|未覆盖|没有覆盖|不覆盖|不在范围|遗留|未包含)/i.test(reportText);
    if (!hasUnverified) missing.push('Final report missing unverified scope / what remains unverified');
  }

  const uniqueMissing = [...new Set(missing)];
  if (uniqueMissing.length > 0) {
    return {
      type: 'formal_verification',
      complete: false,
      status: COMPLETION_STATUS.INCOMPLETE,
      exitCode: COMPLETION_EXIT_CODES.incomplete,
      missing: uniqueMissing,
      reason: `Formal verification incomplete: ${uniqueMissing.join('; ')}`,
      details: { kind, missing: uniqueMissing },
    };
  }

  return {
    type: 'formal_verification',
    complete: true,
    status: COMPLETION_STATUS.COMPLETE,
    exitCode: COMPLETION_EXIT_CODES.complete,
    missing: [],
    reason: 'All formal verification completion criteria satisfied: commands re-run with matching quantities, Record section complete, and final report with breakage evidence delivered.',
    details: { kind },
  };
}

// Register built-in checkers
registerCompletionChecker('assistant_expression', evaluateUnfinishedExpressionCompletion);
registerCompletionChecker('publication', evaluatePublicationCompletion);
registerCompletionChecker('formal_verification', evaluateFormalVerificationCompletion);

/**
 * Unified completion evaluator entry point.
 *
 * @param {string} type - Check type ('assistant_expression', 'publication', 'formal_verification', etc.)
 * @param {object} options - Options passed to the underlying checker.
 */
export async function evaluateCompletion(type, options = {}) {
  const checker = CHECKER_REGISTRY.get(type);
  if (!checker) throw new Error(`Unknown completion checker type: ${type}`);
  const res = await checker(options);
  if (res && typeof res === 'object') {
    if (res.complete === undefined && res.status !== undefined) {
      return {
        ...res,
        complete: res.status === COMPLETION_STATUS.COMPLETE,
      };
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Auto-Continue Configuration & State Control
// ---------------------------------------------------------------------------

/**
 * Parse and validate autoContinue configuration with bounds.
 *
 * @param {boolean | object | undefined | null} config
 * @param {{ potetoMode?: boolean } | boolean} [options]
 * @returns {{ enabled: boolean, maxTurns: number }}
 */
export function parseAutoContinueConfig(config, options = {}) {
  const potetoMode = typeof options === 'boolean'
    ? options
    : Boolean(options?.potetoMode ?? (typeof config === 'object' && config !== null ? config.potetoMode : false));

  let enabled = false;
  let maxTurns = DEFAULT_MAX_AUTO_CONTINUE_TURNS;
  let explicitEnabled = false;

  if (config === false) {
    enabled = false;
    explicitEnabled = true;
  } else if (config === true) {
    enabled = true;
    explicitEnabled = true;
  } else if (typeof config === 'object' && config !== null) {
    const target = config.autoContinue !== undefined ? config.autoContinue : config;
    if (target === false) {
      enabled = false;
      explicitEnabled = true;
    } else if (target === true) {
      enabled = true;
      explicitEnabled = true;
    } else if (typeof target === 'object' && target !== null) {
      if (typeof target.enabled === 'boolean') {
        enabled = target.enabled;
        explicitEnabled = true;
      }
      if (target.maxTurns !== undefined) {
        const n = Number(target.maxTurns);
        if (Number.isInteger(n)) {
          maxTurns = Math.max(MIN_AUTO_CONTINUE_TURNS, Math.min(MAX_AUTO_CONTINUE_TURNS, n));
        }
      }
    }
  }

  // If not explicitly configured, default to enabled ONLY in sessions where poteto-mode is active
  if (!explicitEnabled) {
    enabled = potetoMode;
  }

  return { enabled, maxTurns };
}

/**
 * Determine whether poteto-mode is active on the given branch or session context.
 */
export async function isPotetoModeEnabled(options = {}) {
  const { branch, ctx } = options;

  if (ctx) {
    try {
      const sessionFile = ctx.sessionManager?.getSessionFile?.();
      if (sessionFile) {
        const persisted = loadModeState(`${sessionFile}.pstack-mode.json`);
        if (persisted.enabled) return true;
      }
    } catch {}

    try {
      const sessionId = ctx.sessionManager?.getSessionId?.();
      if (sessionId) {
        let agentDir = process.env.PI_CODING_AGENT_DIR;
        if (!agentDir) {
          try {
            const piAgent = await import('@earendil-works/pi-coding-agent');
            if (typeof piAgent.getAgentDir === 'function') {
              agentDir = piAgent.getAgentDir();
            }
          } catch {}
        }
        if (agentDir) {
          const persisted = loadModeState(sessionModeStatePath(agentDir, sessionId));
          if (persisted.enabled) return true;
        }
      }
    } catch {}
  }

  const b = branch || (ctx?.sessionManager?.getBranch?.());
  if (Array.isArray(b)) {
    try {
      const mode = modeFromBranch(b);
      if (mode.explicit) return mode.enabled;
    } catch {}
  }

  return false;
}

/**
 * Create a fresh initial auto-continue state.
 */
export function createInitialAutoContinueState(options = {}) {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_AUTO_CONTINUE_TURNS;
  const now = new Date().toISOString();
  return {
    version: 1,
    runId: randomUUID(),
    status: 'running',
    turn: 1,
    maxTurns,
    reason: 'initial',
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Reconstruct auto-continue state from branch entries.
 * Resets state when a new user message has arrived since the last auto-continue entry.
 */
export function autoContinueFromBranch(entries) {
  if (!Array.isArray(entries)) return { active: false, state: null };

  let lastAutoContinueIdx = -1;
  let lastData = null;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === 'custom' && entry?.customType === AUTO_CONTINUE_ENTRY) {
      const data = entry.data;
      if (!data || data.version !== 1 || typeof data.runId !== 'string' || typeof data.status !== 'string') {
        throw new Error('Unsupported or malformed pstack auto_continue entry on active branch');
      }
      lastAutoContinueIdx = i;
      lastData = data;
      break;
    }
  }

  if (!lastData) {
    return { active: false, state: null };
  }

  // Check if a new user message arrived after the last auto_continue entry
  const hasNewUserMessage = entries.slice(lastAutoContinueIdx + 1).some(entry => {
    if (!entry) return false;
    if (entry.type === 'message' && entry.message?.role === 'user') return true;
    if (entry.role === 'user') return true;
    if (entry.type === 'user_message') return true;
    return false;
  });

  if (hasNewUserMessage) {
    return { active: false, state: null, reset: true };
  }

  return {
    active: lastData.status === 'running',
    state: lastData,
  };
}

/**
 * Decide whether to continue the agent run automatically.
 *
 * @param {object} params
 * @param {object} [params.state] - Current auto-continue state.
 * @param {string} [params.assistantText] - Last assistant message text.
 * @param {object} [params.config] - Raw or parsed configuration.
 * @param {boolean} [params.potetoMode] - Whether poteto-mode is active.
 * @param {Array} [params.branch] - Active session branch entries.
 * @param {boolean} [params.newUserMessage] - Explicit signal that a new user message arrived.
 * @param {boolean} [params.resetState] - Explicit signal to reset state.
 * @param {'completed' | 'aborted' | 'error'} [params.outcome] - Run outcome.
 * @param {object} [params.completionResult] - Result from an evaluated completion check.
 * @returns {{ action: 'continue' | 'stop', nextState: object, prompt?: string, reason?: string, missing?: string[] }}
 */
export function decideAutoContinueStep(params = {}) {
  const now = new Date().toISOString();
  let potetoMode = Boolean(params.potetoMode);
  if (params.potetoMode === undefined && Array.isArray(params.branch)) {
    try {
      const mode = modeFromBranch(params.branch);
      if (mode.explicit) potetoMode = mode.enabled;
    } catch {}
  }

  const config = parseAutoContinueConfig(params.config, { potetoMode });
  let state = params.state ? { ...params.state } : createInitialAutoContinueState({ maxTurns: config.maxTurns });
  if (params.newUserMessage || params.resetState) {
    state = createInitialAutoContinueState({ maxTurns: config.maxTurns });
  }

  // 1. Host outcome flags
  if (params.outcome === 'aborted') {
    return {
      action: 'stop',
      nextState: { ...state, status: 'stopped', reason: 'operator-aborted', updatedAt: now },
    };
  }
  if (params.outcome === 'error') {
    return {
      action: 'stop',
      nextState: { ...state, status: 'failed', reason: 'turn-error', updatedAt: now },
    };
  }

  // 2. Config disabled
  if (!config.enabled) {
    return {
      action: 'stop',
      nextState: { ...state, status: 'completed', reason: 'auto-continue-disabled', updatedAt: now },
    };
  }

  // 3. Terminal state check
  if (state.status !== 'running') {
    return { action: 'stop', nextState: state };
  }

  // 4. Budget limit check: prevent runaway continuation loops
  if (state.turn >= state.maxTurns) {
    return {
      action: 'stop',
      nextState: { ...state, status: 'stopped', reason: 'max-turns-reached', updatedAt: now },
    };
  }

  // 5. Block on user question, approval, decision or authorization gates in assistantText
  if (params.assistantText) {
    const prose = stripCodeBlocks(params.assistantText);
    const cleanProse = prose.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '');
    for (const pattern of USER_GATE_OR_QUESTION_PATTERNS) {
      if (pattern.test(cleanProse)) {
        return {
          action: 'stop',
          nextState: { ...state, status: 'completed', reason: 'waiting-user-decision', updatedAt: now },
        };
      }
    }
  }

  // 5. Completion checks and expression detection
  let isIncomplete = false;
  let incompleteReason = '';
  const missingItems = [];

  if (params.completionResult) {
    if (params.completionResult.status === COMPLETION_STATUS.BLOCKED) {
      return {
        action: 'stop',
        nextState: { ...state, status: 'blocked', reason: params.completionResult.reason || 'blocked', updatedAt: now },
      };
    }
    if (params.completionResult.status === COMPLETION_STATUS.INCOMPLETE) {
      isIncomplete = true;
      incompleteReason = params.completionResult.reason || 'Self-check indicated incomplete work';
      if (Array.isArray(params.completionResult.missing)) {
        missingItems.push(...params.completionResult.missing);
      }
    }
  }

  if (!isIncomplete && params.assistantText) {
    const exprCheck = detectUnfinishedExpression(params.assistantText);
    if (exprCheck.incomplete) {
      isIncomplete = true;
      incompleteReason = exprCheck.reason;
      if (exprCheck.uncheckedTasks.length > 0) {
        missingItems.push(...exprCheck.uncheckedTasks);
      }
    }
  }

  // 6. Action decision
  if (isIncomplete) {
    const nextState = {
      ...state,
      turn: state.turn + 1,
      reason: incompleteReason,
      updatedAt: now,
    };
    const prompt = renderAutoContinuePrompt({
      turn: nextState.turn,
      maxTurns: nextState.maxTurns,
      reason: incompleteReason,
      missing: missingItems,
    });
    return {
      action: 'continue',
      nextState,
      prompt,
      reason: incompleteReason,
      missing: missingItems,
    };
  }

  return {
    action: 'stop',
    nextState: { ...state, status: 'completed', reason: 'completed', updatedAt: now },
  };
}

/**
 * Render prompt for an auto-continue turn.
 */
export function renderAutoContinuePrompt(options = {}) {
  const parts = [
    `[pstack auto-continue turn ${options.turn}/${options.maxTurns}]`,
    `Unfinished work detected: ${options.reason || 'incomplete task intent'}.`,
  ];
  if (Array.isArray(options.missing) && options.missing.length > 0) {
    parts.push('Missing items / remaining tasks:');
    for (const item of options.missing) {
      parts.push(`- ${item}`);
    }
  }
  parts.push('Please continue to complete all remaining tasks, perform the completion self-check, and deliver the final report.');
  parts.push('不要越过任何待用户确认的授权门；如果上一条是在等用户，就原样停下。');
  return parts.join('\n');
}

/**
 * Extract last assistant text from a branch or entries array.
 */
export function extractLastAssistantText(entries) {
  if (!Array.isArray(entries)) return '';
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    let message = null;
    if (entry.type === 'message' && entry.message) {
      message = entry.message;
    } else if (entry.role === 'assistant') {
      message = entry;
    }
    if (message && message.role === 'assistant') {
      if (typeof message.content === 'string') return message.content;
      if (Array.isArray(message.content)) {
        return message.content
          .filter(part => part && (part.type === 'text' || typeof part.text === 'string'))
          .map(part => typeof part === 'string' ? part : part.text)
          .join('\n');
      }
    }
  }
  return '';
}

/**
 * Register auto-continue lifecycle hooks with Pi.
 *
 * @param {Pick<import('@earendil-works/pi-coding-agent').ExtensionAPI, 'on' | 'appendEntry'>} pi
 * @param {object} [options]
 * @param {(ctx: any) => Promise<any> | any} [options.loadConfig]
 * @param {(options: any) => Promise<any> | any} [options.evaluateCompletion]
 */
export function registerAutoContinue(pi, { loadConfig = () => ({}), evaluateCompletion: runCheck } = {}) {
  pi.on('agent_before_settle', async (event, ctx) => {
    let config = {};
    try {
      config = await loadConfig(ctx);
    } catch {
      config = {};
    }

    const branch = ctx.sessionManager?.getBranch?.() ?? [];
    // If a pstack /loop is currently active and running on the branch, let /loop handle continuation
    const hasRunningLoop = branch.some(e => e?.customType === 'pstack.loop.v1' && e?.data?.status === 'running');
    if (hasRunningLoop) return;

    const potetoMode = await isPotetoModeEnabled({ branch, ctx });

    const allEntries = [...branch, ...(event.entries ?? [])];
    // The formal gate owns continuation through its terminal report turn.
    if (formalGateState(allEntries)) return;
    const { state: branchState } = autoContinueFromBranch(allEntries);

    const assistantText = extractLastAssistantText(event.entries) || extractLastAssistantText(branch);

    let completionResult = null;
    if (typeof runCheck === 'function') {
      try {
        const effectiveEntries = (event.entries && event.entries.length) ? allEntries : branch;
        completionResult = await runCheck({ cwd: ctx.cwd, assistantText, entries: effectiveEntries });
      } catch {
        completionResult = null;
      }
    }

    const decision = decideAutoContinueStep({
      state: branchState,
      assistantText,
      config,
      potetoMode,
      outcome: event.outcome,
      completionResult,
    });

    if (decision.action === 'continue') {
      const stateDraft = {
        type: 'custom',
        customType: AUTO_CONTINUE_ENTRY,
        data: decision.nextState,
      };
      const turnDraft = {
        type: 'custom_message',
        customType: AUTO_CONTINUE_TURN_TYPE,
        content: decision.prompt,
        display: true,
      };
      return {
        entries: [...(event.entries ?? []), stateDraft, turnDraft],
        continue: true,
      };
    } else if (branchState && branchState.status === 'running') {
      const stateDraft = {
        type: 'custom',
        customType: AUTO_CONTINUE_ENTRY,
        data: decision.nextState,
      };
      return {
        entries: [...(event.entries ?? []), stateDraft],
        continue: false,
      };
    }
  });

  return pi.on('agent_settled', (event, ctx) => {
    if (!event.aborted) return;
    const branch = ctx.sessionManager?.getBranch?.() ?? [];
    const { state } = autoContinueFromBranch(branch);
    if (!state || state.status !== 'running') return;
    pi.appendEntry(AUTO_CONTINUE_ENTRY, {
      ...state,
      status: 'interrupted',
      reason: 'operator-aborted',
      updatedAt: new Date().toISOString(),
    });
  });
}
