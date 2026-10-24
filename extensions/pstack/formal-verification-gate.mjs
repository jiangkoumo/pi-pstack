/**
 * Formal verification gate for pstack's create/maintain-formal-verification-skill.
 *
 * Implements artifact self-check and command re-run verification (B-1):
 * - Re-runs every "Run it" command in the generated SKILL.md;
 * - Captures actual execution metrics (rc, distinct states, depth, steps, members, scenarios, states);
 * - Compares actual execution metrics against descriptions in SKILL.md;
 * - Verifies complete Record section (tool version, sync commit, bounds, exclusions);
 * - Verifies final completion report with coverage scope, deliberate breakage evidence
 *   (2 break/restore cycles for create, 1 for maintain), and unverified scope;
 * - Reports exact discrepancies and formats an actionable continuation prompt when incomplete;
 * - Declares completion only when all self-checks pass and final report is delivered.
 */
import { execFile, execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { extractRunItCommands, FORMAL_VERIFICATION_ENTRY, formalGateState } from './formal-commands.mjs';
import { runProcess, runTlcVerification, renderTlcResult } from './verification-exec.mjs';
export { extractRunItCommands } from './formal-commands.mjs';
import { promisify } from 'node:util';
import {
  COMPLETION_EXIT_CODES,
  COMPLETION_STATUS,
  evaluateFormalVerificationCompletion,
  extractLastAssistantText,
  parseAutoContinueConfig,
  AUTO_CONTINUE_ENTRY,
  AUTO_CONTINUE_TURN_TYPE,
} from './auto-continue.mjs';

const execFileAsync = promisify(execFile);

export {
  COMPLETION_EXIT_CODES,
  COMPLETION_STATUS,
  evaluateFormalVerificationCompletion,
};

export const DEFAULT_SKILL_DIRS = Object.freeze(['.pi/skills', '.agents/skills']);
export const FORMAL_SKILL_NAMES = Object.freeze([
  'create-formal-verification-skill',
  'maintain-formal-verification-skill',
]);

export const FORMAL_VERIFICATION_TURN_TYPE = 'pstack.formal_verification_gate.turn.v1';

// ---------------------------------------------------------------------------
// 1. Trigger Condition Detection
// ---------------------------------------------------------------------------

/**
 * Scan workspace for modified SKILL.md files under .pi/skills or .agents/skills
 * that contain a "## Run it" section.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string[]} [options.changedFiles]
 * @param {string[]} [options.skillRoots]
 * @param {boolean} [options.scanWorkspace]
 * @returns {string[]} Array of absolute file paths
 */
export function findModifiedSkillFiles(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const skillRoots = options.skillRoots ?? DEFAULT_SKILL_DIRS;

  // 1. Explicitly passed changed files list (e.g. for unit testing or caller inspection)
  if (Array.isArray(options.changedFiles)) {
    const matched = [];
    for (const f of options.changedFiles) {
      const fullPath = isAbsolute(f) ? f : resolve(cwd, f);
      const relPath = relative(cwd, fullPath).replace(/\\/g, '/');
      const isSkillMd = /(?:^|\/)(?:\.pi|\.agents)\/skills\/[^/]+\/SKILL\.md$/i.test(relPath);
      if (isSkillMd && existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          if (/(?:^|\n)##+\s*Run\s+it\b/i.test(content)) {
            matched.push(fullPath);
          }
        } catch {}
      }
    }
    return matched;
  }

  // 2. Discover via Git status in workspace
  const matched = [];
  try {
    const gitOut = execSync('git status --porcelain -uall', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = gitOut.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const filePart = line.slice(3).trim().replace(/.*->\s*/, '');
      const rel = filePart.replace(/\\/g, '/');
      const isSkillMd = /(?:^|\/)(?:\.pi|\.agents)\/skills\/[^/]+\/SKILL\.md$/i.test(rel);
      if (isSkillMd) {
        const full = resolve(cwd, filePart);
        if (existsSync(full)) {
          const content = readFileSync(full, 'utf8');
          if (/(?:^|\n)##+\s*Run\s+it\b/i.test(content)) {
            matched.push(full);
          }
        }
      }
    }
  } catch {}

  // 3. Fallback discovery across skill roots if requested
  if (matched.length === 0 && options.scanWorkspace === true) {
    for (const root of skillRoots) {
      const fullRoot = resolve(cwd, root);
      if (!existsSync(fullRoot)) continue;
      try {
        const dirs = readdirSync(fullRoot, { withFileTypes: true });
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue;
          const skillFile = join(fullRoot, dir.name, 'SKILL.md');
          if (existsSync(skillFile)) {
            const content = readFileSync(skillFile, 'utf8');
            if (/(?:^|\n)##+\s*Run\s+it\b/i.test(content)) {
              matched.push(skillFile);
            }
          }
        }
      } catch {}
    }
  }

  return [...new Set(matched)];
}

function isPathInsideCwd(targetPath, cwd) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) return false;
  const resolved = isAbsolute(targetPath) ? resolve(targetPath) : resolve(cwd, targetPath);
  const rel = relative(cwd, resolved);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function isSkillDirWrite(targetPath, cwd) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) return false;
  const resolved = isAbsolute(targetPath) ? resolve(targetPath) : resolve(cwd, targetPath);
  const rel = relative(cwd, resolved).replace(/\\/g, '/');
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  return /^(?:\.pi|\.agents)\/skills\//i.test(rel);
}

function checkRunItSkillFile(targetPath, cwd) {
  if (!isSkillDirWrite(targetPath, cwd)) return null;
  const resolved = isAbsolute(targetPath) ? resolve(targetPath) : resolve(cwd, targetPath);
  const rel = relative(cwd, resolved).replace(/\\/g, '/');
  if (!/(?:^|\/)(?:\.pi|\.agents)\/skills\/[^/]+\/SKILL\.md$/i.test(rel)) return null;
  if (!existsSync(resolved)) return null;
  try {
    const content = readFileSync(resolved, 'utf8');
    if (/(?:^|\n)##+\s*Run\s+it\b/i.test(content)) {
      return resolved;
    }
  } catch {}
  return null;
}

function parseStrongUserEvidence(text) {
  if (typeof text !== 'string') return null;
  const command = text.match(/^\s*\/skill:(create|maintain)-formal-verification-skill(?=\s|$)/);
  if (command) {
    return { kind: command[1], reason: 'User requested ' + command[1] + '-formal-verification-skill' };
  }
  const loaded = text.match(/^<skill name="((?:create|maintain)-formal-verification-skill)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n[\s\S]+)?\s*$/);
  if (loaded) {
    return { kind: loaded[1].split('-')[0], reason: 'Session loaded ' + loaded[1] };
  }
  return null;
}

function extractUserText(message) {
  if (typeof message === 'string') return message;
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) {
    return message.content.filter(p => p?.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n');
  }
  return '';
}

function extractToolCalls(message) {
  const calls = [];
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part?.type === 'toolCall' && part.name) calls.push(part);
    }
  }
  if (Array.isArray(message?.toolCalls)) {
    for (const call of message.toolCalls) {
      if (call?.name) calls.push(call);
    }
  }
  if (Array.isArray(message?.nestedCalls?.calls)) {
    for (const call of message.nestedCalls.calls) {
      if (call?.name && (call.status === undefined || call.status === 'ok')) calls.push(call);
    }
  }
  return calls;
}

function resolveSkillFromWorkspace({ cwd, writeEdits = [], changedFiles, scanWorkspace = true }) {
  for (const item of [...writeEdits].reverse()) {
    const p = item.path;
    const resolved = resolve(cwd, p);
    const rel = relative(cwd, resolved).replace(/\\/g, '/');
    if (/(?:^|\/)(?:\.pi|\.agents)\/skills\/[^/]+\/SKILL\.md$/i.test(rel) && existsSync(resolved)) {
      return resolved;
    }
  }
  const modified = findModifiedSkillFiles({ cwd, changedFiles, scanWorkspace: false });
  if (modified.length > 0) return modified[0];
  if (scanWorkspace) {
    const scanned = findModifiedSkillFiles({ cwd, changedFiles, scanWorkspace: true });
    if (scanned.length > 0) return scanned[0];
  }
  return null;
}

function judgeSkillStatus(targetSkillPath, cwd) {
  if (!targetSkillPath || !existsSync(targetSkillPath)) return null;
  let content = '';
  try { content = readFileSync(targetSkillPath, 'utf8'); } catch {}
  const hasSyncCommit = /(?:sync\s*commit|commit\s*[:\s]+[0-9a-f]{7,40}|同步提交)/i.test(content);

  // "已有 sync 记录并被修改是 maintain"
  if (hasSyncCommit) {
    return 'maintain';
  }

  const rel = relative(cwd, targetSkillPath).replace(/\\/g, '/');
  let isTracked = false;
  let isUntrackedOrAdded = false;

  try {
    const gitOut = execSync(`git status --porcelain -uall -- "${rel}"`, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const lsOut = execSync(`git ls-files -- "${rel}"`, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    isTracked = Boolean(lsOut);
    if (gitOut.startsWith('??') || gitOut.startsWith('A')) {
      isUntrackedOrAdded = true;
    }
  } catch {}

  // "新建是 create"
  if (isUntrackedOrAdded || !isTracked) {
    return 'create';
  }

  if (content.includes('## Run it')) return 'create';

  return null;
}

/**
 * Detect whether the formal verification gate should trigger.
 *
 * Trigger conditions:
 * 1. Explicit kind/skillName, a user /skill: command or Pi loading wrapper;
 * 2. Candidate read of a formal verification SKILL.md upgraded in the same round
 *    by workspace file modification (write/edit) or modified skill containing "## Run it";
 * 3. OR modified `.pi/skills/<name>/SKILL.md` (or `.agents/skills/<name>/SKILL.md`) in workspace
 *    containing a `## Run it` section.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {'create'|'maintain'} [options.kind]
 * @param {string} [options.skillName]
 * @param {string} [options.prompt]
 * @param {string} [options.assistantText]
 * @param {any[]} [options.entries]
 * @param {string[]} [options.changedFiles]
 * @returns {{ triggered: boolean, kind: 'create'|'maintain'|null, skillPath?: string, skillPaths?: string[], reason: string }}
 */
export function detectFormalVerificationTrigger(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());

  // Explicit caller parameters describe the current task and override history.
  const explicitKind = ['create', 'maintain'].includes(options.kind) ? options.kind
    : FORMAL_SKILL_NAMES.includes(options.skillName) ? options.skillName.split('-')[0] : null;
  if (explicitKind) {
    return { triggered: true, kind: explicitKind,
      reason: explicitKind + '-formal-verification-skill explicitly requested' };
  }

  const entries = Array.isArray(options.entries) ? options.entries : [];
  let lastUserIdx = -1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const message = entry?.message ?? entry;
    if (message?.role === 'user' || entry?.role === 'user' || entry?.type === 'user_message') {
      lastUserIdx = i;
    }
  }

  const currentRoundEntries = lastUserIdx >= 0 ? entries.slice(lastUserIdx) : entries;

  let latestEvidence = null;
  let activeCandidateReads = [];
  const skillDirWrites = [];

  for (const entry of currentRoundEntries) {
    const message = entry?.message ?? entry;
    if (message?.role === 'user' || entry?.role === 'user' || entry?.type === 'user_message') {
      const text = extractUserText(message);
      const strong = parseStrongUserEvidence(text);
      if (strong) {
        latestEvidence = { triggered: true, kind: strong.kind, reason: strong.reason };
        activeCandidateReads = [];
      }
    }

    const calls = extractToolCalls(message);
    for (const call of calls) {
      if (call.name === 'read') {
        const path = typeof call.arguments?.path === 'string' ? call.arguments.path.replace(/\\/g, '/') : '';
        const match = path.match(/(?:^|\/)skills\/(create|maintain)-formal-verification-skill\/SKILL\.md$/);
        if (match) {
          activeCandidateReads.push({ kind: match[1], path });
        }
      } else if (call.name === 'write' || call.name === 'edit') {
        const path = typeof call.arguments?.path === 'string' ? call.arguments.path.replace(/\\/g, '/') : '';
        if (isSkillDirWrite(path, cwd)) {
          skillDirWrites.push({ path });
          const runItSkill = checkRunItSkillFile(path, cwd);

          if (activeCandidateReads.length > 0) {
            // 证据 2：本轮 read 形式化 SKILL.md 之后，又有 write/edit 写到当前 cwd 的 .pi/skills/** 或 .agents/skills/**
            const kinds = new Set(activeCandidateReads.map(c => c.kind));
            if (kinds.size === 1) {
              const chosen = activeCandidateReads.at(-1);
              latestEvidence = {
                triggered: true,
                kind: chosen.kind,
                skillPath: runItSkill || resolve(cwd, path),
                reason: `Session read ${chosen.path} upgraded with workspace skill write/edit`,
              };
            } else {
              // Ambiguous: resolve by workspace target skill state
              const targetSkill = runItSkill || resolveSkillFromWorkspace({ cwd, writeEdits: skillDirWrites, changedFiles: options.changedFiles });
              const statusKind = judgeSkillStatus(targetSkill, cwd);
              if (statusKind) {
                latestEvidence = {
                  triggered: true,
                  kind: statusKind,
                  skillPath: targetSkill,
                  reason: `Session candidate reads resolved to ${statusKind} by workspace target skill state`,
                };
              } else {
                latestEvidence = null;
              }
            }
            activeCandidateReads = [];
          } else if (runItSkill) {
            // 证据 3：本轮有 write/edit 写到当前 cwd 里某个含 "## Run it" 的技能文件
            const statusKind = judgeSkillStatus(runItSkill, cwd) || 'create';
            latestEvidence = {
              triggered: true,
              kind: statusKind,
              skillPath: runItSkill,
              reason: `Workspace formal verification skill containing "## Run it" modified by tool call: ${relative(cwd, runItSkill)}`,
            };
          }
        }
      }
    }
  }

  // A separately supplied prompt is the current user input, after history.
  if (typeof options.prompt === 'string') {
    const promptStrong = parseStrongUserEvidence(options.prompt);
    if (promptStrong) {
      latestEvidence = { triggered: true, kind: promptStrong.kind, reason: promptStrong.reason };
      activeCandidateReads = [];
    }
  }

  // Explicit changedFiles without entries (e.g. offline testing harness for modified skills)
  if (!latestEvidence && Array.isArray(options.changedFiles) && currentRoundEntries.length === 0) {
    for (const f of options.changedFiles) {
      const runItSkill = checkRunItSkillFile(f, cwd);
      if (runItSkill) {
        const statusKind = judgeSkillStatus(runItSkill, cwd) || 'create';
        return {
          triggered: true,
          kind: statusKind,
          skillPath: runItSkill,
          skillPaths: [runItSkill],
          reason: `Workspace formal verification skill containing "## Run it" modified: ${relative(cwd, runItSkill)}`,
        };
      }
    }
  }

  if (latestEvidence) return latestEvidence;

  return {
    triggered: false,
    kind: null,
    reason: 'No formal verification skill loaded or modified in session',
  };
}

// ---------------------------------------------------------------------------
// 2. Command Extraction & Execution
// ---------------------------------------------------------------------------

export const DEFAULT_FORMAL_COMMAND_TIMEOUT_MS = 30_000;

/** Execute shell commands from the owning repository; TLC uses the tool backend. */
export function createFormalCommandRunner(pi, { loadConfig = () => ({}) } = {}) {
  return async (command, { cwd, ctx, timeoutMs = DEFAULT_FORMAL_COMMAND_TIMEOUT_MS } = {}) => {
    if (/^verification_exec\s/.test(command)) {
      const invocation = command.replace(/^verification_exec\s+/, '').trim();
      let request;
      if (invocation.startsWith('{')) {
        request = JSON.parse(invocation);
      } else {
        const tokens = invocation.split(/\s+/);
        request = { command: 'tlc', options: [] };
        while (tokens.length) {
          const token = tokens.shift();
          if (token === '--spec') request.spec = tokens.shift();
          else if (token === '--config') request.config = tokens.shift();
          else throw new Error('Use verification_exec with a JSON TLC request or --spec and --config.');
        }
      }
      if (request.command !== 'tlc') throw new Error('verification_exec requires command="tlc".');
      const result = await runTlcVerification(request, { cwd, config: await loadConfig(ctx), timeoutMs });
      return { exitCode: result.exitCode ?? 126, output: renderTlcResult(result),
        blocked: result.status === 'unavailable', reason: result.reason };
    }
    const result = await runProcess('bash', ['-c', command], { cwd, env: process.env, timeoutMs });
    return {
      exitCode: result.timedOut ? 124 : (result.exitCode ?? 127),
      stdout: result.stdout, stderr: result.stderr || result.launchError || '',
    };
  };
}

function skillRepositoryRoot(skillPath, fallback) {
  if (!skillPath) return fallback;
  let directory = dirname(resolve(fallback, skillPath));
  while (directory !== dirname(directory)) {
    if (/^(?:\.pi|\.agents)$/.test(directory.split(/[\\/]/).at(-1))) return dirname(directory);
    directory = dirname(directory);
  }
  return fallback;
}

/**
 * Extract key metrics from text (command output or SKILL.md description).
 *
 * Captures:
 * - rc / exitCode
 * - distinct (distinct states)
 * - depth (state graph depth)
 * - steps
 * - members
 * - scenarios
 * - states
 *
 * @param {string} text
 * @returns {{ rc?: number, distinct?: number, depth?: number, steps?: number, members?: number, scenarios?: number, states?: number }}
 */
export function extractMetrics(text) {
  const metrics = {};
  const t = String(text ?? '');

  // Distinct states
  const distinctPattern = /(?:(\d+)\s+distinct(?:\s+states?)?|\bdistinct(?:\s+states?)?[:=\s]+(\d+))/i;
  const distinctMatch = t.match(distinctPattern);
  if (distinctMatch) {
    const val = distinctMatch.slice(1).find(v => v !== undefined);
    if (val !== undefined) metrics.distinct = Number(val);
  }

  // Depth
  const depthPattern = /(?:(?:the\s+)?depth\s+of\s+(?:the\s+)?complete\s+state\s+graph\s+is\s+(\d+)|(?:max\s+)?depth[:=\s]+(\d+)|\bdepth\s+of\s+(\d+)|\b(\d+)\s+depth\b)/i;
  const depthMatch = t.match(depthPattern);
  if (depthMatch) {
    const val = depthMatch.slice(1).find(v => v !== undefined);
    if (val !== undefined) metrics.depth = Number(val);
  }

  // Steps
  const stepMatch = t.match(/(\d+)\s+steps?\b|steps?[:=\s]+(\d+)/i);
  if (stepMatch) {
    const val = stepMatch.slice(1).find(v => v !== undefined);
    if (val !== undefined) metrics.steps = Number(val);
  }

  // Members
  const memberMatch = t.match(/(\d+)\s+members?\b|members?[:=\s]+(\d+)/i);
  if (memberMatch) {
    const val = memberMatch.slice(1).find(v => v !== undefined);
    if (val !== undefined) metrics.members = Number(val);
  }

  // Scenarios
  const scenarioMatch = t.match(/(\d+)\s+scenarios?\b|scenarios?[:=\s]+(\d+)/i);
  if (scenarioMatch) {
    const val = scenarioMatch.slice(1).find(v => v !== undefined);
    if (val !== undefined) metrics.scenarios = Number(val);
  }

  // States: prefer "states generated" or explicit "states:" over general
  const totalStateMatch = t.match(/(\d+)\s+states?\s+generated/i) || t.match(/(?:total\s+)?states?[:=\s]+(\d+)/i);
  if (totalStateMatch) {
    metrics.states = Number(totalStateMatch[1]);
  } else {
    const generalStateMatch = t.match(/(\d+)\s+states?\b/i);
    if (generalStateMatch) {
      metrics.states = Number(generalStateMatch[1]);
    }
  }

  // rc / exitCode
  const rcMatch = t.match(/(?:exit\s*(?:code|status)?|rc)[:=\s]+(\d+)/i);
  if (rcMatch) {
    metrics.rc = Number(rcMatch[1]);
  }

  return metrics;
}

/**
 * Compare expected metrics from SKILL.md against actual metrics from command output.
 *
 * @param {object} expected - Metrics described in SKILL.md
 * @param {object} actual - Metrics observed from command execution output
 * @returns {string[]} List of discrepancy descriptions
 */
export function compareMetrics(expected = {}, actual = {}) {
  const discrepancies = [];

  const checks = [
    { key: 'rc', label: 'exit code' },
    { key: 'distinct', label: 'distinct states' },
    { key: 'depth', label: 'depth' },
    { key: 'steps', label: 'steps' },
    { key: 'members', label: 'members' },
    { key: 'scenarios', label: 'scenarios' },
    { key: 'states', label: 'states' },
  ];

  for (const { key, label } of checks) {
    if (expected[key] !== undefined && actual[key] !== undefined) {
      if (expected[key] !== actual[key]) {
        discrepancies.push(
          `${label} mismatch: output had ${actual[key]}, but SKILL.md claims ${expected[key]}`
        );
      }
    }
  }

  return discrepancies;
}

/**
 * Re-run a list of verification commands in the specified directory.
 *
 * @param {string[]} commands - Commands to execute
 * @param {object} [options]
 * @param {string} [options.cwd] - Target working directory
 * @param {Function} [options.runner] - Injected runner `(cmd, { cwd }) => Promise<{ exitCode, stdout, stderr, output }>`
 * @returns {Promise<Array<{ command: string, exitCode: number, rc: number, stdout: string, stderr: string, output: string, metrics: object }>>}
 */
export async function rerunVerificationCommands(commands, options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const runner = options.runner;
  const results = [];

  for (const cmd of commands) {
    if (!cmd || typeof cmd !== 'string') continue;
    let runResult;

    if (typeof runner === 'function') {
      try {
        const res = await runner(cmd, { cwd });
        const stdout = String(res.stdout ?? res.output ?? '');
        const stderr = String(res.stderr ?? '');
        const output = String(res.output ?? `${stdout}\n${stderr}`.trim());
        const exitCode = typeof res.exitCode === 'number' ? res.exitCode : (res.rc ?? 0);
        runResult = {
          command: cmd,
          exitCode,
          rc: exitCode,
          stdout,
          stderr,
          output,
          blocked: Boolean(res.blocked),
          reason: res.reason,
          metrics: {
            ...extractMetrics(output),
            rc: exitCode,
            ...(res.counts ?? {}),
            ...(res.metrics ?? {}),
          },
        };
      } catch (err) {
        runResult = {
          command: cmd,
          exitCode: 1,
          rc: 1,
          stdout: '',
          stderr: String(err?.message ?? err),
          output: String(err?.message ?? err),
          metrics: { rc: 1 },
          error: err,
        };
      }
    } else {
      // Default execution via node child_process
      try {
        const [prog, ...args] = cmd.split(/\s+/);
        const { stdout, stderr } = await execFileAsync(prog, args, { cwd, timeout: 30000 });
        const output = `${stdout}\n${stderr}`.trim();
        runResult = {
          command: cmd,
          exitCode: 0,
          rc: 0,
          stdout,
          stderr,
          output,
          metrics: {
            ...extractMetrics(output),
            rc: 0,
          },
        };
      } catch (err) {
        const exitCode = typeof err.code === 'number' ? err.code : 1;
        const stdout = String(err.stdout ?? '');
        const stderr = String(err.stderr ?? err.message ?? '');
        const output = `${stdout}\n${stderr}`.trim();
        runResult = {
          command: cmd,
          exitCode,
          rc: exitCode,
          stdout,
          stderr,
          output,
          metrics: {
            ...extractMetrics(output),
            rc: exitCode,
          },
        };
      }
    }

    results.push(runResult);
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Continuation Prompt Rendering
// ---------------------------------------------------------------------------

/**
 * Format a clear and actionable auto-continue prompt describing the exact differences
 * and remaining items when self-check is incomplete.
 *
 * @param {object} options
 * @param {string[]} [options.missing]
 * @param {string[]} [options.discrepancies]
 * @param {'create'|'maintain'} [options.kind]
 * @returns {string}
 */
export function renderFormalVerificationContinuationPrompt(options = {}) {
  const missing = Array.isArray(options.missing) ? options.missing : [];
  const discrepancies = Array.isArray(options.discrepancies) ? options.discrepancies : [];
  const kind = options.kind === 'maintain' ? 'maintain' : 'create';
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const relSkillPath = options.skillPath ? relative(cwd, resolve(cwd, options.skillPath)).replace(/\\/g, '/')
    : typeof options.relSkillPath === 'string' ? options.relSkillPath : '';

  const scopeHeader = relSkillPath
    ? `[Scope: current workspace repository (${cwd}) only. Target skill: ${relSkillPath}]\n检查范围只限当前 cwd 仓库，目标 skill: ${relSkillPath}。`
    : `[Scope: current workspace repository (${cwd}) only]\n检查范围只限当前 cwd 仓库。`;

  const parts = [
    `[pstack formal-verification-gate: incomplete]`,
    scopeHeader,
    `Self-check failed for ${kind}-formal-verification-skill: verification artifact self-check did not pass.`,
  ];

  if (discrepancies.length > 0) {
    parts.push('');
    parts.push('Metric discrepancies between SKILL.md and re-run output:');
    for (const d of discrepancies) {
      parts.push(`- ${d}`);
    }
  }

  if (missing.length > 0) {
    parts.push('');
    parts.push('Unresolved requirements / missing items:');
    for (const m of missing) {
      parts.push(`- ${m}`);
    }
  }

  parts.push('');
  parts.push(
    'Please re-run all "Run it" commands in the generated directory, align the metrics in SKILL.md with the actual command outputs, verify the Record section is complete, and provide the final report with coverage, deliberate breakage evidence, and unverified scope.'
  );

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 4. Primary Gate Evaluation Entry Point
// ---------------------------------------------------------------------------

/**
 * Complete formal verification gate evaluator.
 *
 * Orchestrates:
 * 1. Skill file and command resolution;
 * 2. Re-running every "Run it" command;
 * 3. Exact metric cross-checking (rc, distinct, depth, steps, members, scenarios, states);
 * 4. Record section verification;
 * 5. Final report verification (coverage, deliberate breakage evidence, unverified scope);
 * 6. Detailed discrepancy extraction and continuation prompt generation.
 *
 * @param {object} options
 * @param {string} [options.cwd] - Workspace root directory
 * @param {string} [options.skillText] - SKILL.md markdown text
 * @param {string} [options.skillPath] - Path to SKILL.md file
 * @param {string} [options.reportText] - Final completion report text
 * @param {string} [options.assistantText] - Assistant message text containing the report
 * @param {any[]} [options.entries] - Transcript entries array
 * @param {'create'|'maintain'} [options.kind] - Skill kind
 * @param {boolean} [options.tlcAvailable] - Whether TLC tool is available
 * @param {any[]} [options.commandRuns] - Pre-recorded command runs
 * @param {Function} [options.runner] - Injected command runner
 * @param {string[]} [options.changedFiles] - Changed files for discovery
 * @returns {Promise<{ complete: boolean, status: string, exitCode: number, missing: string[], discrepancies: string[], prompt?: string, reason: string, details: object }>}
 */
export async function evaluateFormalVerificationGate(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const kind = options.kind === 'maintain' ? 'maintain' : 'create';
  const tlcAvailable = options.tlcAvailable !== false;

  // 1. Resolve skill text & skill path
  let skillText = String(options.skillText ?? '').trim();
  let skillPath = options.skillPath ?? null;

  if (skillPath) {
    const fullPath = isAbsolute(skillPath) ? resolve(skillPath) : resolve(cwd, skillPath);
    if (!isPathInsideCwd(fullPath, cwd)) {
      skillPath = null;
      skillText = '';
    } else if (existsSync(fullPath)) {
      skillPath = fullPath;
      if (!skillText) {
        try { skillText = readFileSync(fullPath, 'utf8'); } catch {}
      }
    } else {
      skillPath = null;
    }
  }

  if (!skillText && !skillPath) {
    const candidatePaths = findModifiedSkillFiles({
      cwd,
      changedFiles: options.changedFiles,
      scanWorkspace: true,
    });
    if (candidatePaths.length > 0) {
      skillPath = candidatePaths[0];
      try { skillText = readFileSync(skillPath, 'utf8'); } catch {}
    }
  }

  // 2. Resolve report text
  let reportText = String(options.reportText ?? '').trim();
  if (!reportText) {
    if (typeof options.assistantText === 'string') {
      reportText = options.assistantText.trim();
    } else if (Array.isArray(options.entries)) {
      reportText = extractLastAssistantText(options.entries).trim();
    }
  }

  // 3. Extract "Run it" commands
  const runItCommands = extractRunItCommands(skillText);

  // 4. Command re-execution
  let commandRuns = Array.isArray(options.commandRuns) ? [...options.commandRuns] : [];

  if (typeof options.runner === 'function' && runItCommands.length > 0) {
    const executionCwd = skillRepositoryRoot(skillPath, cwd);
    const executedRuns = await rerunVerificationCommands(runItCommands, { cwd: executionCwd, runner: options.runner });
    for (const execRun of executedRuns) {
      const idx = commandRuns.findIndex(r => r?.command === execRun.command);
      if (idx !== -1) {
        commandRuns[idx] = execRun;
      } else {
        commandRuns.push(execRun);
      }
    }
  }

  // Normalize counts for command runs to bridge TLC output metrics with auto-continue's extractQuantities
  const skillMetrics = extractMetrics(skillText);
  for (const run of commandRuns) {
    if (!run) continue;
    const runOutput = run.output ?? `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    const runMetrics = {
      ...extractMetrics(runOutput),
      ...(run.metrics ?? {}),
    };
    const counts = { ...(run.counts ?? {}) };
    if (counts.steps === undefined && runMetrics.steps !== undefined) counts.steps = runMetrics.steps;
    if (counts.members === undefined && runMetrics.members !== undefined) counts.members = runMetrics.members;
    if (counts.scenarios === undefined && runMetrics.scenarios !== undefined) counts.scenarios = runMetrics.scenarios;
    if (counts.states === undefined) {
      if (skillMetrics.states !== undefined) {
        counts.states = runMetrics.states;
      } else if (skillMetrics.distinct !== undefined) {
        counts.states = runMetrics.distinct;
      }
    }
    run.counts = counts;
  }

  const blockedRun = commandRuns.find(run => run?.blocked);
  if (blockedRun) {
    return {
      complete: false, status: COMPLETION_STATUS.BLOCKED, exitCode: COMPLETION_EXIT_CODES.blocked,
      missing: [blockedRun.reason || '未做形式化验证，原因是缺少 TLC'],
      discrepancies: [], reason: blockedRun.reason, details: { kind },
    };
  }

  // 5. Evaluate baseline criteria via evaluateFormalVerificationCompletion
  const baseResult = evaluateFormalVerificationCompletion({
    skillText,
    reportText,
    commandRuns,
    kind,
    tlcAvailable,
  });

  // Check if blocked due to TLC
  if (baseResult.status === COMPLETION_STATUS.BLOCKED) {
    return {
      type: 'formal_verification',
      complete: false,
      status: COMPLETION_STATUS.BLOCKED,
      exitCode: COMPLETION_EXIT_CODES.blocked,
      missing: baseResult.missing,
      discrepancies: [],
      reason: baseResult.reason,
      details: { kind, tlcAvailable: false },
    };
  }

  // Check if target artifact is missing in current cwd workspace
  if (!skillPath && !skillText) {
    const missingItems = baseResult.missing?.length > 0 && !tlcAvailable
      ? baseResult.missing
      : ['当前工作区没有形式化验证产物；如果本轮未执行该技能，请如实说明并结束，不要到其他目录寻找或修改文件'];
    const message = missingItems[0];
    return {
      type: 'formal_verification',
      complete: false,
      targetArtifactMissing: true,
      status: COMPLETION_STATUS.INCOMPLETE,
      exitCode: COMPLETION_EXIT_CODES.incomplete,
      missing: missingItems,
      discrepancies: [],
      prompt: message,
      reason: message,
      details: { kind, targetArtifactMissing: true },
    };
  }

  const missing = [...(baseResult.missing || [])];
  const discrepancies = [];

  // 6. Deep metric cross-checking and exit code validation
  if (skillText && commandRuns.length > 0) {
    // Run it checks the restored artifact. Record may describe intentionally
    // failing mutation runs; their exit codes must not redefine a passing run.
    const skillMetrics = { ...extractMetrics(skillText), rc: 0 };

    for (const run of commandRuns) {
      if (!run || typeof run.command !== 'string') continue;

      // Validate execution exit code
      const runRc = run.exitCode !== undefined ? run.exitCode : (run.rc !== undefined ? run.rc : 0);
      const expectedRc = skillMetrics.rc !== undefined ? skillMetrics.rc : 0;
      if (runRc !== expectedRc) {
        const msg = `Command execution exit code (${runRc}) does not match expected exit code (${expectedRc}) for: ${run.command}`;
        discrepancies.push(msg);
        missing.push(msg);
      }

      // Validate detailed metrics
      const runOutputMetrics = {
        ...extractMetrics(run.output ?? `${run.stdout ?? ''}\n${run.stderr ?? ''}`),
        ...(run.counts ?? {}),
        ...(run.metrics ?? {}),
      };

      const metricDiffs = compareMetrics(skillMetrics, runOutputMetrics);
      for (const diff of metricDiffs) {
        discrepancies.push(diff);
        missing.push(diff);
      }
    }
  }

  // 7. Check if blocked due to TLC
  if (baseResult.status === COMPLETION_STATUS.BLOCKED) {
    return {
      type: 'formal_verification',
      complete: false,
      status: COMPLETION_STATUS.BLOCKED,
      exitCode: COMPLETION_EXIT_CODES.blocked,
      missing: baseResult.missing,
      discrepancies: [],
      reason: baseResult.reason,
      details: { kind, tlcAvailable: false },
    };
  }

  // 8. Deduplicate missing items and discrepancies
  const uniqueMissing = [...new Set(missing)];
  const uniqueDiscrepancies = [...new Set(discrepancies)];

  if (uniqueMissing.length > 0) {
    const prompt = renderFormalVerificationContinuationPrompt({
      missing: uniqueMissing,
      discrepancies: uniqueDiscrepancies,
      kind,
      cwd,
      skillPath,
    });
    return {
      type: 'formal_verification',
      complete: false,
      skillPath,
      status: COMPLETION_STATUS.INCOMPLETE,
      exitCode: COMPLETION_EXIT_CODES.incomplete,
      missing: uniqueMissing,
      discrepancies: uniqueDiscrepancies,
      prompt,
      reason: `Formal verification self-check incomplete: ${uniqueMissing.join('; ')}`,
      details: { kind, skillPath, missing: uniqueMissing, discrepancies: uniqueDiscrepancies },
    };
  }

  return {
    type: 'formal_verification',
    complete: true,
    skillPath,
    status: COMPLETION_STATUS.COMPLETE,
    exitCode: COMPLETION_EXIT_CODES.complete,
    missing: [],
    discrepancies: [],
    reason: 'All formal verification completion criteria satisfied: commands re-run with matching quantities, Record section complete, and final report with breakage evidence delivered.',
    details: { kind, skillPath },
  };
}

// ---------------------------------------------------------------------------
// 5. Host Hook Registration
// ---------------------------------------------------------------------------

/**
 * Register formal verification gate lifecycle hooks on the host Pi instance.
 *
 * @param {Pick<import('@earendil-works/pi-coding-agent').ExtensionAPI, 'on' | 'exec'>} pi
 * @param {object} [options]
 * @param {Function} [options.runner]
 * @param {boolean} [options.tlcAvailable]
 */
export function registerFormalVerificationGate(pi, options = {}) {
  const loadConfig = options.loadConfig ?? (() => ({}));
  const runner = options.runner ?? createFormalCommandRunner(pi, { loadConfig });
  return pi.on('agent_before_settle', async (event, ctx) => {
    if (event.outcome && event.outcome !== 'completed') return;
    const cwd = options.cwd ?? ctx?.cwd ?? process.cwd();
    const branch = ctx?.sessionManager?.getBranch?.() ?? [];
    const entries = [...branch, ...(event.entries ?? [])];
    const previous = formalGateState(entries);
    // A terminal report is allowed exactly once. Only a new user request resets it.
    if (previous && previous.status !== 'running') return { entries: event.entries ?? [], continue: false };
    const assistantText = extractLastAssistantText(event.entries) || extractLastAssistantText(branch);
    let requestStart = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]?.role === 'user' || entries[i]?.message?.role === 'user' || entries[i]?.type === 'user_message') requestStart = i;
    }
    const trigger = detectFormalVerificationTrigger({ cwd, entries: entries.slice(requestStart), assistantText });
    if (!trigger.triggered) return;

    let config;
    let configError;
    try { config = await loadConfig(ctx); }
    catch (error) { configError = `Configuration unavailable: ${String(error?.message ?? error)}`; }
    const { maxTurns } = parseAutoContinueConfig(config);
    const evaluation = configError ? {
      complete: false, status: COMPLETION_STATUS.BLOCKED, missing: [configError],
    } : await evaluateFormalVerificationGate({
      cwd,
      kind: trigger.kind,
      skillPath: trigger.skillPath,
      entries,
      assistantText,
      runner: (command, execution) => runner(command, { ...execution, ctx }),
      tlcAvailable: options.tlcAvailable,
    });

    if (evaluation.targetArtifactMissing) {
      const stateDraft = {
        type: 'custom',
        customType: FORMAL_VERIFICATION_ENTRY,
        data: { version: 1, turn: 1, maxTurns, missing: evaluation.missing, status: 'target-artifact-missing' },
      };
      const drafts = (event.entries ?? []).filter(e => ![AUTO_CONTINUE_ENTRY, AUTO_CONTINUE_TURN_TYPE].includes(e.customType));
      return {
        entries: [...drafts, stateDraft, {
          type: 'custom_message',
          customType: FORMAL_VERIFICATION_TURN_TYPE,
          content: '当前工作区没有形式化验证产物；如果本轮未执行该技能，请如实说明并结束，不要到其他目录寻找或修改文件',
          display: true,
        }],
        continue: false,
      };
    }

    const missing = [...evaluation.missing].sort();
    const turn = (previous?.turn ?? 0) + 1;
    const unchanged = previous && JSON.stringify(previous.missing) === JSON.stringify(missing);
    const terminal = evaluation.complete || evaluation.status === COMPLETION_STATUS.BLOCKED || unchanged || turn >= maxTurns;
    const reason = evaluation.complete ? 'complete' : evaluation.status === COMPLETION_STATUS.BLOCKED
      ? 'blocked' : unchanged ? 'unchanged-missing' : turn >= maxTurns ? 'max-turns' : 'incomplete';
    const stateDraft = {
      type: 'custom', customType: FORMAL_VERIFICATION_ENTRY,
      data: { version: 1, turn, maxTurns, missing, status: terminal ? reason : 'running' },
    };
    // Remove a generic continuation proposed earlier at this boundary. The formal
    // gate owns this request's budget and final reporting turn.
    const drafts = (event.entries ?? []).filter(e => ![AUTO_CONTINUE_ENTRY, AUTO_CONTINUE_TURN_TYPE].includes(e.customType));
    if (evaluation.complete) return { entries: [...drafts, stateDraft], continue: false };

    const resolvedSkill = trigger.skillPath || evaluation.skillPath || (evaluation.details && evaluation.details.skillPath);
    const relSkillPath = resolvedSkill ? relative(cwd, resolve(cwd, resolvedSkill)).replace(/\\/g, '/') : '';
    const scopeNote = relSkillPath
      ? `[Scope: current workspace repository (${cwd}) only. Target skill: ${relSkillPath}]\n检查范围只限当前 cwd 仓库，目标 skill: ${relSkillPath}。`
      : `[Scope: current workspace repository (${cwd}) only]\n检查范围只限当前 cwd 仓库。`;

    const content = terminal
      ? [`[pstack formal verification stopped: ${reason}]`,
        scopeNote,
        'Stop verification attempts. Deliver the final report now; explicitly label these items as 未验证 / unverified:',
        ...missing.map(item => `- ${item}`),
        'Do not claim a formal pass or modify artifacts to satisfy this gate. No further automatic retry is allowed for this request.'].join('\n')
      : evaluation.prompt;
    return {
      entries: [...drafts, stateDraft, {
        type: 'custom_message', customType: FORMAL_VERIFICATION_TURN_TYPE, content, display: true,
      }],
      continue: true,
    };
  });
}
