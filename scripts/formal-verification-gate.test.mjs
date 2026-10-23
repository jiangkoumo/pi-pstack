import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createJiti } from 'jiti';
import { createServer } from 'node:http';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { disposeTestSession, withTimeout, closeTestServer } from './test-session-lifecycle.mjs';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  COMPLETION_EXIT_CODES,
  COMPLETION_STATUS,
  compareMetrics,
  createFormalCommandRunner,
  detectFormalVerificationTrigger,
  evaluateFormalVerificationGate,
  extractMetrics,
  extractRunItCommands,
  findModifiedSkillFiles,
  registerFormalVerificationGate,
  renderFormalVerificationContinuationPrompt,
  rerunVerificationCommands,
} from '../extensions/pstack/formal-verification-gate.mjs';

function createTempDir(prefix = 'pstack-fv-test-') {
  const dir = join(tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ===========================================================================
// Acceptance Criteria 1: 触发条件检测 (Trigger Condition Detection)
// ===========================================================================

test('trigger: detects create-formal-verification-skill via prompt or entries', () => {
  // Via prompt
  const resPrompt = detectFormalVerificationTrigger({
    prompt: '/skill:create-formal-verification-skill prove queue concurrency invariants',
  });
  assert.equal(resPrompt.triggered, true);
  assert.equal(resPrompt.kind, 'create');

  // Via session entries
  const resEntries = detectFormalVerificationTrigger({
    entries: [
      { role: 'user', content: 'Let us run /create-formal-verification-skill for state machine' },
      { role: 'assistant', content: 'Starting formal verification generation...' },
    ],
  });
  assert.equal(resEntries.triggered, true);
  assert.equal(resEntries.kind, 'create');

  // Via explicit parameter
  const resParam = detectFormalVerificationTrigger({
    skillName: 'create-formal-verification-skill',
  });
  assert.equal(resParam.triggered, true);
  assert.equal(resParam.kind, 'create');
});

test('trigger: detects maintain-formal-verification-skill via prompt or entries', () => {
  // Via prompt
  const resPrompt = detectFormalVerificationTrigger({
    prompt: '/skill:maintain-formal-verification-skill check drift after refactor',
  });
  assert.equal(resPrompt.triggered, true);
  assert.equal(resPrompt.kind, 'maintain');

  // Via session entries
  const resEntries = detectFormalVerificationTrigger({
    entries: [
      { role: 'user', content: 'Please execute maintain-formal-verification-skill' },
    ],
  });
  assert.equal(resEntries.triggered, true);
  assert.equal(resEntries.kind, 'maintain');

  // Via explicit kind
  const resKind = detectFormalVerificationTrigger({ kind: 'maintain' });
  assert.equal(resKind.triggered, true);
  assert.equal(resKind.kind, 'maintain');
});

test('trigger: resolves to create when create-formal-verification-skill is loaded even if body text mentions maintain', () => {
  const cfvContent = `
<skill name="create-formal-verification-skill" location="/path/to/skills/create-formal-verification-skill/SKILL.md">
Tell the user what you verified.
Point the user at \`/maintain-formal-verification-skill\` for bringing the verification back in line.
</skill>
Work on queue invariants
`;

  const res = detectFormalVerificationTrigger({
    entries: [
      { role: 'user', content: cfvContent },
      { role: 'assistant', content: 'Starting formal verification generation...' },
    ],
  });

  assert.equal(res.triggered, true);
  assert.equal(res.kind, 'create', 'Must be create, not maintain, because create-formal-verification-skill was the loaded skill');
});

test('trigger: detects modified .pi/skills/*/SKILL.md containing "## Run it"', () => {
  const tempDir = createTempDir('pstack-trigger-test-');
  try {
    const skillDir = join(tempDir, '.pi/skills/verify-queue');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, `
# Verify Queue
## Run it
\`\`\`bash
verification_exec --spec Queue.tla
\`\`\`
`, 'utf8');

    const res = detectFormalVerificationTrigger({
      cwd: tempDir,
      changedFiles: ['.pi/skills/verify-queue/SKILL.md'],
    });

    assert.equal(res.triggered, true);
    assert.equal(res.kind, 'create');
    assert.ok(res.skillPath.includes('.pi/skills/verify-queue/SKILL.md'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('trigger: detects modified .agents/skills/*/SKILL.md containing "## Run it"', () => {
  const tempDir = createTempDir('pstack-agents-trigger-');
  try {
    const skillDir = join(tempDir, '.agents/skills/verify-cache');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, `
# Verify Cache
## Run it
\`\`\`sh
tlc Cache.tla
\`\`\`
`, 'utf8');

    const res = detectFormalVerificationTrigger({
      cwd: tempDir,
      changedFiles: ['.agents/skills/verify-cache/SKILL.md'],
    });

    assert.equal(res.triggered, true);
    assert.ok(res.skillPath.includes('.agents/skills/verify-cache/SKILL.md'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('trigger: ignores unrelated files and skills lacking "## Run it"', () => {
  const tempDir = createTempDir('pstack-non-trigger-');
  try {
    // 1. Skill file without "## Run it"
    const skillDir = join(tempDir, '.pi/skills/ordinary-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, '# Ordinary Skill\nJust tests, no model check.', 'utf8');

    const resSkill = detectFormalVerificationTrigger({
      cwd: tempDir,
      changedFiles: ['.pi/skills/ordinary-skill/SKILL.md'],
    });
    assert.equal(resSkill.triggered, false);

    // 2. Unrelated source file
    const resSrc = detectFormalVerificationTrigger({
      cwd: tempDir,
      changedFiles: ['src/index.ts', 'README.md'],
    });
    assert.equal(resSrc.triggered, false);

    // 3. Regular chat prompt
    const resChat = detectFormalVerificationTrigger({
      prompt: 'Refactor the authentication middleware',
    });
    assert.equal(resChat.triggered, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// Acceptance Criteria 2: 提取 "## Run it" 命令并在生成目录下重跑并捕获指标
// ===========================================================================

test('commands: extracts single and multiple commands from "## Run it" code fences and lines', () => {
  const skill = `
# Queue Invariant Verification

## Overview
Model check the bounded queue.

## Run it
\`\`\`bash
# Run the formal model checker
verification_exec --spec Model.tla --config Model.cfg

# Verify concrete script counts
node scripts/check-counts.mjs
\`\`\`

## Record
- Tool: TLC 2.18
`;

  const commands = extractRunItCommands(skill);
  assert.deepEqual(commands, [
    'verification_exec --spec Model.tla --config Model.cfg',
    'node scripts/check-counts.mjs',
  ]);
});

test('commands: ignores unlabelled output fences but accepts direct tool invocations', () => {
  const skillUnlabelled = `
## Run it
\`\`\`
tlc -cleanup Model.tla
\`\`\`
`;
  assert.deepEqual(extractRunItCommands(skillUnlabelled), []);

  const skillDirect = `
## Run it
Run the checker using:
verification_exec --spec Spec.tla
`;
  assert.deepEqual(extractRunItCommands(skillDirect), ['verification_exec --spec Spec.tla']);
});

test('commands: scopes shell fences, joins continuations, and retains explicit structured TLC calls', () => {
  const text = [
    '```bash', 'node unrelated.mjs', '```', '## Run it',
    '```bash', 'node formal/check.mjs \\', '  --verbose', '```',
    '```text', 'done: 7 scenarios', '```',
    '```', 'verification_exec {"command":"tlc","spec":"M.tla","config":"M.cfg"}', '```',
    '## Record', '```sh', 'node excluded.mjs', '```',
  ].join('\n');
  assert.deepEqual(extractRunItCommands(text), [
    'node formal/check.mjs --verbose',
    'verification_exec {"command":"tlc","spec":"M.tla","config":"M.cfg"}',
  ]);
});

test('rerun: executes commands in directory and captures output metrics', async () => {
  const commands = [
    'verification_exec --spec Model.tla --config Model.cfg',
    'node test-summary.js',
  ];

  const executedCwd = [];
  const runner = async (cmd, { cwd }) => {
    executedCwd.push({ cmd, cwd });
    if (cmd.includes('verification_exec')) {
      return {
        exitCode: 0,
        output: `
TLC Version 2.18
The depth of the complete state graph is 8.
54 states generated, 42 distinct states found.
Checked 16 steps, 54 members, and 10 scenarios without error.
Exit code: 0
`,
      };
    }
    return {
      exitCode: 0,
      output: 'Test script passed with 10 scenarios verified. rc: 0',
    };
  };

  const results = await rerunVerificationCommands(commands, {
    cwd: '/mock/workspace/skill',
    runner,
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].exitCode, 0);
  assert.equal(results[0].rc, 0);
  assert.equal(results[0].metrics.depth, 8);
  assert.equal(results[0].metrics.distinct, 42);
  assert.equal(results[0].metrics.steps, 16);
  assert.equal(results[0].metrics.members, 54);
  assert.equal(results[0].metrics.scenarios, 10);
  assert.equal(results[0].metrics.states, 54);
  assert.equal(executedCwd[0].cwd, '/mock/workspace/skill');
});

test('rerun: handles runner command failure and captures non-zero rc', async () => {
  const runner = async () => ({
    exitCode: 1,
    output: 'Error: invariant violated. 1 error found. rc: 1',
  });

  const results = await rerunVerificationCommands(['verification_exec --spec Model.tla'], { runner });
  assert.equal(results[0].exitCode, 1);
  assert.equal(results[0].rc, 1);
  assert.equal(results[0].metrics.rc, 1);
});

// ===========================================================================
// Acceptance Criteria 3: 指标（rc、distinct/depth/steps/members/scenarios）比对与差异报告
// ===========================================================================

test('metrics: extracts all key metrics from text', () => {
  const text = `
Model check report:
- Depth of the complete state graph is 12.
- 105 states generated, 84 distinct states found.
- Verified 32 steps across 108 members and 20 scenarios.
- Exit code: 0
`;
  const m = extractMetrics(text);
  assert.equal(m.depth, 12);
  assert.equal(m.states, 105);
  assert.equal(m.distinct, 84);
  assert.equal(m.steps, 32);
  assert.equal(m.members, 108);
  assert.equal(m.scenarios, 20);
  assert.equal(m.rc, 0);
});

test('metrics: compares and flags distinct states mismatch', () => {
  const expected = { distinct: 42 };
  const actual = { distinct: 20 };
  const diffs = compareMetrics(expected, actual);
  assert.equal(diffs.length, 1);
  assert.ok(diffs[0].includes('distinct states mismatch: output had 20, but SKILL.md claims 42'));
});

test('metrics: compares and flags depth mismatch', () => {
  const expected = { depth: 8 };
  const actual = { depth: 5 };
  const diffs = compareMetrics(expected, actual);
  assert.equal(diffs.length, 1);
  assert.ok(diffs[0].includes('depth mismatch: output had 5, but SKILL.md claims 8'));
});

test('metrics: compares and flags steps, members, scenarios mismatches', () => {
  const expected = { steps: 16, members: 54, scenarios: 10 };
  const actual = { steps: 18, members: 55, scenarios: 12 };
  const diffs = compareMetrics(expected, actual);
  assert.equal(diffs.length, 3);
  assert.ok(diffs.some(d => d.includes('steps mismatch: output had 18, but SKILL.md claims 16')));
  assert.ok(diffs.some(d => d.includes('members mismatch: output had 55, but SKILL.md claims 54')));
  assert.ok(diffs.some(d => d.includes('scenarios mismatch: output had 12, but SKILL.md claims 10')));
});

test('metrics: compares and flags exit code / rc mismatch', () => {
  const expected = { rc: 0 };
  const actual = { rc: 1 };
  const diffs = compareMetrics(expected, actual);
  assert.equal(diffs.length, 1);
  assert.ok(diffs[0].includes('exit code mismatch: output had 1, but SKILL.md claims 0'));
});

test('metrics: returns empty array when all metrics match perfectly', () => {
  const expected = { rc: 0, depth: 8, distinct: 42, steps: 16, members: 54, scenarios: 10 };
  const actual = { rc: 0, depth: 8, distinct: 42, steps: 16, members: 54, scenarios: 10 };
  const diffs = compareMetrics(expected, actual);
  assert.deepEqual(diffs, []);
});

// ===========================================================================
// Acceptance Criteria 4: 自检未通过时生成包含精确差异的续跑提示
// ===========================================================================

test('prompt: formats continuation prompt with exact metric discrepancies and missing items', () => {
  const prompt = renderFormalVerificationContinuationPrompt({
    kind: 'create',
    discrepancies: [
      'distinct states mismatch: output had 20, but SKILL.md claims 42',
      'depth mismatch: output had 5, but SKILL.md claims 8',
    ],
    missing: [
      'Record section missing sync commit',
      'Final report missing evidence of deliberate breakage',
    ],
  });

  assert.ok(prompt.includes('[pstack formal-verification-gate: incomplete]'));
  assert.ok(prompt.includes('Metric discrepancies between SKILL.md and re-run output:'));
  assert.ok(prompt.includes('distinct states mismatch: output had 20, but SKILL.md claims 42'));
  assert.ok(prompt.includes('depth mismatch: output had 5, but SKILL.md claims 8'));
  assert.ok(prompt.includes('Record section missing sync commit'));
  assert.ok(prompt.includes('Final report missing evidence of deliberate breakage'));
  assert.ok(prompt.includes('Please re-run all "Run it" commands'));
});

test('gate: rejects when metric discrepancies exist and returns incomplete status', async () => {
  const skill = `
# Verify Worker Pool
## Run it
\`\`\`bash
verification_exec --spec Pool.tla --config Pool.cfg
\`\`\`
The model explores 42 distinct states at depth 8. Checked 16 steps, 54 members, and 10 scenarios.
rc: 0

## Record
- Tool version: TLC 2.18
- Sync commit: a1b2c3d
- Bounds: 3 workers
- Assumptions: reliable delivery
- Left out: network split
`;

  // Actual run outputs 20 distinct states, depth 5, 18 steps
  const runner = async () => ({
    exitCode: 0,
    output: `
TLC completed.
The depth of the complete state graph is 5.
20 distinct states found.
Explored 18 steps, 55 members, 12 scenarios.
rc: 0
`,
  });

  const res = await evaluateFormalVerificationGate({
    skillText: skill,
    runner,
    reportText: `
Final Report:
- Coverage: pool invariants
- Deliberate break 1: removed mutex, counterexample seen, exit 1
- Deliberate break 2: inverted check, counterexample seen, exit 1
- Restored: all restored
- Unverified: network splits
`,
  });

  assert.equal(res.complete, false);
  assert.equal(res.status, COMPLETION_STATUS.INCOMPLETE);
  assert.equal(res.exitCode, COMPLETION_EXIT_CODES.incomplete);
  assert.ok(res.discrepancies.some(d => d.includes('distinct states mismatch')));
  assert.ok(res.discrepancies.some(d => d.includes('depth mismatch')));
  assert.ok(res.prompt.includes('distinct states mismatch'));
  assert.ok(res.prompt.includes('depth mismatch'));
});

test('gate: rejects when a Run it command failed with non-zero exit code', async () => {
  const skill = `
# Verify Mutex
## Run it
\`\`\`bash
verification_exec --spec Mutex.tla
\`\`\`
Checks 10 scenarios. rc: 0
## Record
- Tool version: TLC 2.18
- Sync commit: c0ffee1
- Bounds: 2
- Assumptions: none
- Left out: none
`;

  const runner = async () => ({
    exitCode: 1,
    output: 'TLC error: invariant violation found. exit 1',
  });

  const res = await evaluateFormalVerificationGate({
    skillText: skill,
    runner,
    reportText: `
Report:
- Coverage: mutex
- Break 1: broken, counterexample seen, exit 1
- Break 2: broken again, counterexample seen, exit 1
- Restored: cleanly
- Unverified: none
`,
  });

  assert.equal(res.complete, false);
  assert.equal(res.status, COMPLETION_STATUS.INCOMPLETE);
  assert.ok(res.missing.some(m => m.includes('exit code')));
});

test('gate: rejects when deliberate breakage evidence is missing', async () => {
  const skill = `
# Verify Queue
## Run it
\`\`\`bash
verification_exec --spec Queue.tla
\`\`\`
## Record
- Tool version: TLC 2.18
- Sync commit: 1234567
- Bounds: 3 items
- Assumptions: single producer
- Left out: disk storage
`;

  const runner = async () => ({
    exitCode: 0,
    output: 'All checks passed. exit 0',
  });

  // For create: needs 2 breaks
  const resCreate = await evaluateFormalVerificationGate({
    kind: 'create',
    skillText: skill,
    runner,
    reportText: 'I finished the task with full coverage. Unverified: none.',
  });

  assert.equal(resCreate.complete, false);
  assert.ok(resCreate.missing.some(m => m.includes('deliberate breakage')));
  assert.ok(resCreate.prompt.includes('deliberate breakage'));

  // For maintain: needs 1 break
  const resMaintain = await evaluateFormalVerificationGate({
    kind: 'maintain',
    skillText: skill,
    runner,
    reportText: 'Finished maintenance. Coverage: good. Unverified: none.',
  });

  assert.equal(resMaintain.complete, false);
  assert.ok(resMaintain.missing.some(m => m.includes('deliberate break')));
});

// ===========================================================================
// Acceptance Criteria 5: 全部符合并有最终报告时判定通过
// ===========================================================================

test('gate: create flow passes when all metrics match, Record complete, and 2 breaks in final report', async () => {
  const skill = `
# Formal Verification of Priority Queue

## Run it
\`\`\`bash
verification_exec --spec PQueue.tla --config PQueue.cfg
\`\`\`

The model checks 16 steps, 54 members, and 10 scenarios without invariant violation.
Estimates: 42 distinct states at depth 8.
Exit code: 0

## Record
- Tool version: TLC 2.18 (OpenJDK 17)
- Sync commit: 7f272ab5ff2254c0dc2537b7977e88ede1cd55e8
- Bounds: concurrency 2, queue length 5
- Assumptions: FIFO event ordering
- Left out: process crash recovery and disk durability
`;

  const runner = async () => ({
    exitCode: 0,
    output: `
TLC 2.18
The depth of the complete state graph is 8.
54 states generated, 42 distinct states found.
Explored 16 steps, 54 members, 10 scenarios.
Model checking completed. 0 errors found.
Exit code: 0
`,
  });

  const report = `
## Final Completion Report

### Coverage Scope
Guards against concurrency limit violations in priority queue event processing.

### Deliberate Breakage Evidence
1. Break 1: Deleted active-slot reservation check in enqueue(); TLC found counterexample with 3 active jobs (> concurrency limit 2), exit 1. Restored.
2. Break 2: Inverted priority comparator in drain(); TLC detected invariant violation with counterexample trace, exit 1. Restored.

### Unverified Scope
Process crash recovery, network split partitions, and disk persistence remain unverified.
`;

  const res = await evaluateFormalVerificationGate({
    kind: 'create',
    skillText: skill,
    runner,
    reportText: report,
  });

  assert.equal(res.complete, true);
  assert.equal(res.status, COMPLETION_STATUS.COMPLETE);
  assert.equal(res.exitCode, COMPLETION_EXIT_CODES.complete);
  assert.equal(res.missing.length, 0);
  assert.equal(res.discrepancies.length, 0);
  assert.ok(res.reason.includes('All formal verification completion criteria satisfied'));
});

test('gate: maintain flow passes with 1 deliberate break and matching metrics', async () => {
  const skill = `
# Maintain Verify Priority Queue

## Run it
\`\`\`bash
verification_exec --spec PQueue.tla --config PQueue.cfg
\`\`\`
Checked 16 steps, 54 members, 10 scenarios.
Distinct states: 42, depth: 8.
rc: 0

## Record
- Tool version: TLC 2.18
- Sync commit: c0ffee1
- Bounds: 3 items
- Assumptions: standard queue
- Left out: none
`;

  const runner = async () => ({
    exitCode: 0,
    output: `
Checked 16 steps, 54 members, 10 scenarios.
The depth of the complete state graph is 8.
42 distinct states found.
rc: 0
`,
  });

  const report = `
Final Report:
- Coverage: verified drift triage on updated PQueue
- Deliberate break 1: mutated lock assertion, counterexample found, exit 1
- Restored: cleanly restored
- Unverified: none
`;

  const res = await evaluateFormalVerificationGate({
    kind: 'maintain',
    skillText: skill,
    runner,
    reportText: report,
  });

  assert.equal(res.complete, true);
  assert.equal(res.status, COMPLETION_STATUS.COMPLETE);
  assert.equal(res.exitCode, COMPLETION_EXIT_CODES.complete);
  assert.equal(res.missing.length, 0);
});

test('gate: handles TLC unavailable gracefully with fallback statement', async () => {
  // With required statement -> blocked (exit 126)
  const resBlocked = await evaluateFormalVerificationGate({
    tlcAvailable: false,
    reportText: '未做形式化验证，原因是缺少 TLC。改用生成式输入测试。',
  });
  assert.equal(resBlocked.complete, false);
  assert.equal(resBlocked.status, COMPLETION_STATUS.BLOCKED);
  assert.equal(resBlocked.exitCode, COMPLETION_EXIT_CODES.blocked);

  // Without required statement -> incomplete (exit 1)
  const resIncomplete = await evaluateFormalVerificationGate({
    tlcAvailable: false,
    reportText: 'No TLC was installed on this host.',
  });
  assert.equal(resIncomplete.complete, false);
  assert.equal(resIncomplete.status, COMPLETION_STATUS.INCOMPLETE);
  assert.equal(resIncomplete.exitCode, COMPLETION_EXIT_CODES.incomplete);
  assert.ok(resIncomplete.missing.some(m => m.includes('未做形式化验证，原因是缺少 TLC')));
});

test('gate: end-to-end integration with workspace file discovery and assistantText', async () => {
  const tempDir = createTempDir('pstack-e2e-gate-');
  try {
    const skillDir = join(tempDir, '.pi/skills/verify-queue-concurrency');
    mkdirSync(skillDir, { recursive: true });
    const skillFile = join(skillDir, 'SKILL.md');

    writeFileSync(skillFile, `
# Verify Queue Concurrency

## Run it
\`\`\`bash
verification_exec --spec Model.tla --config Model.cfg
\`\`\`
The model explores 42 distinct states at depth 8.
16 steps, 54 members, 10 scenarios checked.

## Record
- Tool version: TLC 2.18
- Sync commit: deadbeef123
- Bounds: concurrency 2
- Assumptions: ordered
- Left out: crash
`, 'utf8');

    const runner = async () => ({
      exitCode: 0,
      output: `
The depth of the complete state graph is 8.
42 distinct states found.
Explored 16 steps, 54 members, 10 scenarios.
exit 0
`,
    });

    const assistantText = `
Final Completion Report:
- Coverage scope: queue concurrency
- Deliberate breakage evidence:
  1. Break 1: removed guard, counterexample triggered deadlock, exit 1. Restored.
  2. Break 2: flipped priority flag, counterexample seen, exit 1. Restored.
- Unverified scope: crash recovery.
`;

    // Trigger detection works on workspace
    const trigger = detectFormalVerificationTrigger({
      cwd: tempDir,
      changedFiles: ['.pi/skills/verify-queue-concurrency/SKILL.md'],
    });
    assert.equal(trigger.triggered, true);

    // Evaluate gate with discovered skill file
    const res = await evaluateFormalVerificationGate({
      cwd: tempDir,
      skillPath: trigger.skillPath,
      assistantText,
      runner,
    });

    assert.equal(res.complete, true);
    assert.equal(res.status, 'complete');
    assert.equal(res.exitCode, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// Acceptance Criteria 6: Pi Lifecycle 钩子集成 (Lifecycle Hook Integration)
// ===========================================================================

test('lifecycle: registerFormalVerificationGate attaches to before_settle and continues turn when incomplete', async () => {
  const events = [];
  const fakePi = {
    on: (eventName, handler) => {
      events.push({ eventName, handler });
    },
  };

  registerFormalVerificationGate(fakePi, {
    runner: async () => ({
      exitCode: 0,
      output: '20 distinct states, depth 5.', // mismatches SKILL.md
    }),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, 'agent_before_settle');

  const handler = events[0].handler;

  // Session loaded create-formal-verification-skill
  const event = {
    entries: [
      { role: 'user', content: '/skill:create-formal-verification-skill' },
      {
        role: 'assistant',
        content: `
I generated the skill:
## Run it
\`\`\`bash
verification_exec --spec Model.tla
\`\`\`
Distinct states: 42, depth: 8.
## Record
- Tool version: TLC 2.18
- Sync commit: abc1234
- Bounds: 3
- Assumptions: none
- Left out: none
`,
      },
    ],
  };

  const ctx = {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => event.entries },
  };

  const settleDecision = await handler(event, ctx);
  assert.ok(settleDecision);
  assert.equal(settleDecision.continue, true);
  assert.ok(settleDecision.entries.some(e => e.customType === 'pstack.formal_verification_gate.turn.v1'));
});

test('lifecycle: registerFormalVerificationGate does not intercept when gate is not triggered', async () => {
  const events = [];
  const fakePi = {
    on: (eventName, handler) => {
      events.push({ eventName, handler });
    },
  };

  registerFormalVerificationGate(fakePi);
  const handler = events[0].handler;

  const event = {
    entries: [
      { role: 'user', content: 'Please fix typo in README.md' },
      { role: 'assistant', content: 'Fixed the typo in README.md.' },
    ],
  };

  const ctx = {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => event.entries },
  };

  const settleDecision = await handler(event, ctx);
  assert.equal(settleDecision, undefined);
});

test('findModifiedSkillFiles discovers untracked .pi/skills/*/SKILL.md in a git repository', () => {
  const tempDir = createTempDir('pstack-untracked-git-');
  try {
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });
    const skillDir = join(tempDir, '.pi/skills/x');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, `
# Verification Skill
## Run it
\`\`\`bash
verification_exec --spec Model.tla
\`\`\`
`, 'utf8');

    // Without -uall, git status --porcelain shows "?? .pi/"
    // With -uall, git status --porcelain -uall shows "?? .pi/skills/x/SKILL.md"
    const found = findModifiedSkillFiles({ cwd: tempDir });
    assert.equal(found.length, 1);
    assert.equal(found[0], resolve(skillPath));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('lifecycle: registerFormalVerificationGate triggers with empty event.entries in -p mode when branch contains trigger', async () => {
  const events = [];
  const fakePi = {
    on: (eventName, handler) => {
      events.push({ eventName, handler });
    },
  };

  registerFormalVerificationGate(fakePi, {
    runner: async () => ({
      exitCode: 0,
      output: '20 distinct states, depth 5.',
    }),
  });

  assert.equal(events.length, 1);
  const handler = events[0].handler;

  // In -p mode, event.entries is []
  const event = {
    entries: [],
  };

  const branch = [
    { role: 'user', content: '/skill:create-formal-verification-skill' },
    {
      role: 'assistant',
      content: `
I generated the skill:
## Run it
\`\`\`bash
verification_exec --spec Model.tla
\`\`\`
Distinct states: 42, depth: 8.
## Record
- Tool version: TLC 2.18
- Sync commit: abc1234
- Bounds: 3
- Assumptions: none
- Left out: none
`,
    },
  ];

  const ctx = {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => branch },
  };

  const settleDecision = await handler(event, ctx);
  assert.ok(settleDecision, 'Gate must intercept even when event.entries is empty in -p mode');
  assert.equal(settleDecision.continue, true);
  assert.ok(settleDecision.entries.some(e => e.customType === 'pstack.formal_verification_gate.turn.v1'));
});

const finalReport = `Coverage scope: queue concurrency.
Break 1: removed guard, counterexample detected, exit 1, restored.
Break 2: inverted predicate, counterexample detected, exit 1, restored.
Unverified scope: crash recovery.`;

const productionPstack = (await createJiti(import.meta.url).import('../extensions/pstack/index.ts')).default;
async function productionFixture(run) {
  const cwd = createTempDir('pstack-formal-production-');
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(cwd, 'agent');
  const handlers = [];
  let branch = [{ role: 'user', content: '/skill:create-formal-verification-skill' }];
  const skillDir = join(cwd, '.pi/skills/x');
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(join(cwd, 'formal'));
  const script = join(cwd, 'formal/check.mjs');
  const marker = join(cwd, 'runs.txt');
  writeFileSync(marker, '');
  const passingScript = "import { appendFileSync } from 'node:fs';\nappendFileSync('runs.txt', 'run\\n');\nconsole.log('done: 7 scenarios, 67152 schedules, 149159 property checks');\n";
  const failingScript = passingScript + 'process.exit(1);\n';
  writeFileSync(script, passingScript);
  const runCount = () => readFileSync(marker, 'utf8').split('\n').filter(Boolean).length;
  const skillPath = join(skillDir, 'SKILL.md');
  const skill = `# Queue verification
## Run it
\`\`\`bash
node formal/check.mjs
\`\`\`
Expected output:
\`\`\`
done: 7 scenarios, 67152 schedules, 149159 property checks
\`\`\`
## Record
Tool version: Node 22. Sync commit: deadbeef. Bounds: 2 workers.
Assumptions: ordered. Exclusions: crash recovery.
`;
  writeFileSync(skillPath, skill);
  const ctx = { cwd, isProjectTrusted: () => true, sessionManager: { getBranch: () => branch } };
  productionPstack({
    on: (name, handler) => { if (name === 'agent_before_settle') handlers.push(handler); },
    registerCommand() {}, registerTool() {},

  });
  async function settle(report = finalReport) {
    branch.push({ role: 'assistant', content: report });
    let event = { entries: [], continue: false, outcome: 'completed' };
    for (const handler of handlers) {
      const result = await handler(event, ctx);
      if (result) event = { ...event, ...result };
    }
    branch.push(...event.entries);
    return event;
  }
  try { await run({ cwd, script, skillPath, skill, settle, runCount, branch, passingScript, failingScript }); }
  finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('production registration: real root command passes, output example is not executed', () => productionFixture(async h => {
  const decision = await h.settle();
  assert.equal(decision.continue, false);
  assert.equal(h.runCount(), 1);
  assert.equal(decision.entries.find(e => e.customType === 'pstack.formal_verification_gate.v1')?.data.status, 'complete');
}));

test('production registration: Record break cycles pass without repeating evidence in the final report', () => productionFixture(async h => {
  writeFileSync(h.skillPath, h.skill + `
### Deliberate breakage
Break cycle 1: removed rate-limit guard, counterexample detected, exit code 1, restored.
Break cycle 2: inverted interval-cap check, counterexample detected, exit code 1, restored.
`);
  const result = await h.settle('Coverage scope: rate limiting. Breakage evidence is recorded in SKILL.md. Unverified scope: crash recovery.');
  assert.equal(result.continue, false);
  assert.equal(result.entries.at(-1).data.status, 'complete');
  assert.equal(h.runCount(), 1);
}));

test('production registration: identical failures stop after a final unverified report prompt', () => productionFixture(async h => {
  writeFileSync(h.script, h.failingScript);
  assert.equal((await h.settle()).continue, true);
  const terminal = await h.settle();
  assert.equal(terminal.continue, true);
  assert.match(terminal.entries.at(-1).content, /未验证/);
  assert.match(terminal.entries.at(-1).content, /unchanged-missing/);
  const count = h.runCount();
  for (let i = 0; i < 5; i++) assert.equal((await h.settle('Next I will fix remaining work.')).continue, false);
  assert.equal(h.runCount(), count, 'terminal report must not re-execute commands');
}));

test('production registration: changing missing items still obeys configured shared maxTurns', () => productionFixture(async h => {
  mkdirSync(join(h.cwd, '.pi'), { recursive: true });
  writeFileSync(join(h.cwd, '.pi/pstack.json'), JSON.stringify({ version: 1, roles: {}, autoContinue: { enabled: true, maxTurns: 3 } }));
  writeFileSync(h.script, h.failingScript);
  for (let turn = 1; turn <= 3; turn++) {
    writeFileSync(h.skillPath, h.skill.replace('node formal/check.mjs', `node formal/check.mjs ${turn}`));
    const decision = await h.settle('Next I will finish the work.');
    assert.equal(decision.continue, true);
    assert.equal(decision.entries.filter(e => e.customType === 'pstack.auto_continue.turn.v1').length, 0);
    if (turn === 3) assert.match(decision.entries.at(-1).content, /max-turns/);
  }
  assert.equal((await h.settle()).continue, false);
  assert.equal(h.runCount(), 3);
}));

test('production registration: a new user message resets the stopped gate', () => productionFixture(async h => {
  writeFileSync(h.script, h.failingScript);
  await h.settle();
  await h.settle();
  assert.equal((await h.settle()).continue, false);
  writeFileSync(h.script, h.passingScript);
  h.branch.push({ role: 'user', content: 'Run create-formal-verification-skill to verify the restored commands again.' });
  const result = await h.settle();
  assert.equal(result.continue, false);
  assert.equal(result.entries.at(-1).data.status, 'complete');
  assert.equal(h.runCount(), 3);
}));

test('production registration: historical skill references do not trigger a new unrelated request', () => productionFixture(async h => {
  await h.settle();
  rmSync(h.skillPath);
  h.branch.push({ role: 'user', content: 'Explain a JavaScript closure.' });
  const result = await h.settle('A closure captures variables from its enclosing scope.');
  assert.equal(result.continue, false);
  assert.equal(result.entries.length, 0);
  assert.equal(h.runCount(), 1);
}));

test('production registration: invalid config produces one blocked report instead of throwing', () => productionFixture(async h => {
  writeFileSync(join(h.cwd, '.pi/pstack.json'), '{broken');
  const result = await h.settle();
  assert.match(result.entries.at(-1).content, /Configuration unavailable/);
  assert.equal(h.runCount(), 0);
  assert.equal((await h.settle()).continue, false);
}));

test('production registration: active loop cannot override formal terminal state', () => productionFixture(async h => {
  h.branch.push({ type: 'custom', customType: 'pstack.loop.v1', data: { version: 1, status: 'running' } });
  const result = await h.settle();
  assert.equal(result.continue, false);
  assert.equal(h.runCount(), 1);
  for (let i = 0; i < 3; i++) assert.equal((await h.settle()).continue, false);
  assert.equal(h.runCount(), 1);
}));

test('gate: unavailable TLC returns its explicit blocked reason', async () => {
  const result = await evaluateFormalVerificationGate({
    skillText: '## Run it\n```sh\nverification_exec --spec M.tla --config M.cfg\n```',
    runner: async () => ({ exitCode: 126, blocked: true, reason: '未做形式化验证，原因是缺少 TLC' }),
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.missing, ['未做形式化验证，原因是缺少 TLC']);
});

test('runner: preserves shell quoting and kills the process tree on real timeout', async () => {
  const runner = createFormalCommandRunner({});
  const result = await runner('NAME="two words"; printf "%s" "$NAME" && sleep 30 & wait', { cwd: process.cwd(), timeoutMs: 200 });
  assert.equal(result.stdout, 'two words');
  assert.equal(result.exitCode, 124);
});

test('runner: verification_exec TLC uses the configured backend, never a shell executable', async () => {
  let loaded = 0;
  const runner = createFormalCommandRunner({ exec: () => assert.fail('TLC must not use shell') }, {
    loadConfig: async () => { loaded++; throw Error('fixture TLC config unavailable'); },
  });
  await assert.rejects(runner('verification_exec {"command":"tlc","spec":"Model.tla","config":"Model.cfg"}', { cwd: process.cwd() }), /fixture TLC config unavailable/);
  assert.equal(loaded, 1);
});

test('actual Pi host: production index executes real commands and settles failed gates', { timeout: 30000 }, () => productionFixture(async h => {
  const agentDir = join(h.cwd, 'agent');
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, 'pstack.json'), JSON.stringify({ version: 1, roles: {}, autoContinue: { enabled: true, maxTurns: 3 } }));
  let requests = 0;
  let stoppedPrompt = '';
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests++;
    if (raw.includes('unchanged-missing')) stoppedPrompt = raw;
    const base = { id: 'formal-host', object: 'chat.completion.chunk', created: 1, model: 'parent' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: finalReport }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  let session;
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const modelsPath = join(agentDir, 'models.json');
    writeFileSync(modelsPath, JSON.stringify({ providers: { fixture: {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'test-only',
      models: [{ id: 'parent', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 2048,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    } } }));
    const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath, allowModelNetwork: false });
    for (const failing of [false, true]) {
      const marker = join(h.cwd, 'runs.txt');
      writeFileSync(marker, '');
      writeFileSync(h.script, `import { appendFileSync } from 'node:fs';\nappendFileSync('runs.txt', 'run\\n');\nconsole.log('7 scenarios');\nprocess.exit(${failing ? 1 : 0});\n`);
      const settingsManager = SettingsManager.inMemory({ defaultProjectTrust: 'never', compaction: { enabled: false }, retry: { enabled: false } });
      const loader = new DefaultResourceLoader({ cwd: h.cwd, agentDir, settingsManager, noExtensions: true,
        additionalExtensionPaths: [resolve('extensions/pstack/index.ts')], noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true });
      await loader.reload();
      assert.deepEqual(loader.getExtensions().errors, []);
      const errors = [];
      ({ session } = await createAgentSession({ cwd: h.cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'parent'),
        resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(h.cwd), tools: [] }));
      await session.bindExtensions({ mode: 'rpc', onError: error => errors.push(error) });
      const before = requests;
      await withTimeout(session.prompt('Run create-formal-verification-skill for this queue.'), 10000, 'formal host settle');
      await session.waitForIdle();
      assert.equal(requests - before, failing ? 3 : 1);
      assert.equal(readFileSync(marker, 'utf8'), failing ? 'run\nrun\n' : 'run\n');
      assert.deepEqual(errors, []);
      if (failing) assert.match(stoppedPrompt, /未验证/);
      await disposeTestSession(session);
      session = undefined;
    }
  } finally {
    await disposeTestSession(session);
    await closeTestServer(server);
  }
}));
