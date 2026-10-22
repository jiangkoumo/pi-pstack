import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_CONTINUE_ENTRY,
  AUTO_CONTINUE_TURN_TYPE,
  DEFAULT_MAX_AUTO_CONTINUE_TURNS,
  MIN_AUTO_CONTINUE_TURNS,
  MAX_AUTO_CONTINUE_TURNS,
  detectUnfinishedExpression,
  evaluateCompletion,
  evaluateFormalVerificationCompletion,
  evaluatePublicationCompletion,
  evaluateUnfinishedExpressionCompletion,
  parseAutoContinueConfig,
  decideAutoContinueStep,
  createInitialAutoContinueState,
  autoContinueFromBranch,
  renderAutoContinuePrompt,
  registerAutoContinue,
  registerCompletionChecker,
} from '../extensions/pstack/auto-continue.mjs';

test('detectUnfinishedExpression detects English forward-looking continuation phrases', () => {
  // The exact real-world case from Issue 30 / p-queue formal verification
  const pqueueCase = "Now let me rewrite SKILL.md to match the corrected model, the fixed scripts, and the review's accuracy findings.";
  const r1 = detectUnfinishedExpression(pqueueCase);
  assert.equal(r1.incomplete, true);
  assert.match(r1.reason, /Now let me rewrite/i);

  // Other forward-looking phrases
  const cases = [
    { text: 'Now I will execute the TLC model checker on the target spec.', pattern: /Now I will/i },
    { text: 'Next, I will verify the counterexample in the code.', pattern: /Next/i },
    { text: 'Next step is to write the Record section in the skill.', pattern: /Next step/i },
    { text: 'Next, we need to inspect the failure output.', pattern: /Next/i },
    { text: 'I will now proceed to test the second deliberate break.', pattern: /I will now/i },
    { text: "Let's proceed to running the verification commands.", pattern: /Let's proceed/i },
    { text: 'Continuing with the formal verification model updates...', pattern: /Continuing with/i },
    { text: 'Now to rewrite the verification skill for the repo.', pattern: /Now to rewrite/i },
  ];

  for (const c of cases) {
    const res = detectUnfinishedExpression(c.text);
    assert.equal(res.incomplete, true, `Expected incomplete for: ${c.text}`);
    assert.match(res.reason, c.pattern);
  }
});

test('detectUnfinishedExpression detects Chinese forward-looking continuation phrases', () => {
  const cases = [
    { text: '接下来要做形式化验证技能的完成自检', pattern: /接下来要做/ },
    { text: '接下来我们将重新跑一遍 Run it 命令并核对数量', pattern: /接下来我们将/ },
    { text: '下一步是补齐 Record 一节的内容', pattern: /下一步是/ },
    { text: '下一步需要执行故意改坏代码的两次验证', pattern: /下一步需要/ },
    { text: '现在开始运行两次 break/restore 验证', pattern: /现在开始/ },
    { text: '还有未完成任务需要继续处理', pattern: /未完成任务/ },
  ];

  for (const c of cases) {
    const res = detectUnfinishedExpression(c.text);
    assert.equal(res.incomplete, true, `Expected incomplete for: ${c.text}`);
    assert.match(res.reason, c.pattern);
  }
});

test('detectUnfinishedExpression detects Markdown task lists with unchecked items', () => {
  const checklist = `
## Progress
- [x] Create initial TLA+ specification
- [ ] Re-run every "Run it" command from SKILL.md
- [ ] Write Record section
- [ ] Final completion report with break/restore evidence
`;
  const res = detectUnfinishedExpression(checklist);
  assert.equal(res.incomplete, true);
  assert.equal(res.uncheckedTasks.length, 3);
  assert.equal(res.uncheckedTasks[0], 'Re-run every "Run it" command from SKILL.md');
  assert.equal(res.uncheckedTasks[1], 'Write Record section');
  assert.equal(res.uncheckedTasks[2], 'Final completion report with break/restore evidence');
  assert.match(res.reason, /3 unchecked task/);
});

test('detectUnfinishedExpression detects waiting/continuation signals', () => {
  const waitingEn = 'Waiting for continuation signal to proceed with TLC execution...';
  const r1 = detectUnfinishedExpression(waitingEn);
  assert.equal(r1.incomplete, true);
  assert.match(r1.reason, /waiting for continuation/i);

  const waitingZh = '已完成第一阶段，请回复继续以执行后续自检。';
  const r2 = detectUnfinishedExpression(waitingZh);
  assert.equal(r2.incomplete, true);
  assert.match(r2.reason, /请回复继续/);
});

test('detectUnfinishedExpression returns clean on completed messages', () => {
  const completedText = `
I have verified the target invariant.
All 18 steps and 55 members match the model output.
The two break-and-restore checks caught the bugs with non-zero exit code.
Here is the final report:
- Scope: queue concurrency and drain invariants
- Break evidence: Break 1 caught violation (exit 1), Break 2 caught deadlock (exit 1)
- Left out: network failure recovery
`;
  const r1 = detectUnfinishedExpression(completedText);
  assert.equal(r1.incomplete, false);

  const allChecked = `
- [x] Step 1 complete
- [x] Step 2 complete
- [x] Step 3 complete
`;
  const r2 = detectUnfinishedExpression(allChecked);
  assert.equal(r2.incomplete, false);

  assert.equal(detectUnfinishedExpression('').incomplete, false);
  assert.equal(detectUnfinishedExpression('   ').incomplete, false);
});

test('evaluateCompletion handles assistant_expression check type', async () => {
  const incomplete = await evaluateCompletion('assistant_expression', {
    assistantText: 'Now let me rewrite SKILL.md to match the corrected model.',
  });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.exitCode, 1);
  assert.ok(incomplete.missing.length > 0);

  const complete = await evaluateCompletion('assistant_expression', {
    assistantText: 'All verification steps completed and confirmed.',
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.exitCode, 0);
  assert.equal(complete.missing.length, 0);
});

test('evaluateCompletion handles publication check type (opening-a-pr/feature)', async () => {
  // Unauthorized -> blocked
  const unauthorized = await evaluateCompletion('publication', { authorized: false });
  assert.equal(unauthorized.status, 'blocked');
  assert.equal(unauthorized.exitCode, 126);
  assert.equal(unauthorized.complete, false);

  // Authorized with mock run: branch unpushed
  const mockRunUnpushed = async (cmd, args) => {
    if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
      return { code: 0, stdout: 'abc1234', stderr: '' };
    }
    if (cmd === 'git' && args.includes('@{upstream}')) {
      return { code: 1, stdout: '', stderr: 'fatal: no upstream configured' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const unpushed = await evaluateCompletion('publication', { authorized: true, run: mockRunUnpushed });
  assert.equal(unpushed.status, 'incomplete');
  assert.equal(unpushed.exitCode, 1);
  assert.ok(unpushed.missing.some(m => m.includes('branch pushed')));
});

test('evaluateFormalVerificationCompletion: detects missing run, count mismatch, incomplete record, and missing report', () => {
  const skillTextWithCounts = `
# Verify p-queue

## Run it
\`\`\`bash
verification_exec --spec Model.tla --config Model.cfg
\`\`\`

The model checks 16 steps, 54 members, and 10 scenarios without invariant violation.

## Record
- Tool version: TLC 2.18
- Sync commit: abc1234
- Bounds: 3 workers
- Assumptions: FIFO channel
- Left out: process crash recovery
`;

  // Case 1: Command never re-run
  const res1 = evaluateFormalVerificationCompletion({
    skillText: skillTextWithCounts,
    commandRuns: [],
    reportText: 'Final report with coverage and breaks',
  });
  assert.equal(res1.complete, false);
  assert.ok(res1.missing.some(m => m.includes('Re-run command')));

  // Case 2: Command re-run, but output counts (18 steps / 55 members / 12 scenarios)
  // do not match SKILL.md (16 steps / 54 members / 10 scenarios)
  const res2 = evaluateFormalVerificationCompletion({
    skillText: skillTextWithCounts,
    commandRuns: [{
      command: 'verification_exec --spec Model.tla --config Model.cfg',
      exitCode: 0,
      output: 'TLC completed. Explored 18 steps, 55 members, 12 scenarios. 0 errors.',
      counts: { steps: 18, members: 55, scenarios: 12 },
    }],
    reportText: `
Final report:
- Coverage: p-queue concurrency
- Deliberate break 1: removed mutex check, counterexample found, exit 1
- Deliberate break 2: inverted priority order, counterexample found, exit 1
- Restored: both breaks restored cleanly
- Unverified: network partitions
`,
  });
  assert.equal(res2.complete, false);
  assert.ok(res2.missing.some(m => m.includes('quantities') || m.includes('mismatch') || m.includes('steps')));

  // Case 3: Missing Record section
  const skillWithoutRecord = `
# Verify p-queue

## Run it
\`\`\`bash
verification_exec --spec Model.tla --config Model.cfg
\`\`\`
The model checks 18 steps, 55 members, and 12 scenarios.
`;
  const res3 = evaluateFormalVerificationCompletion({
    skillText: skillWithoutRecord,
    commandRuns: [{
      command: 'verification_exec --spec Model.tla --config Model.cfg',
      exitCode: 0,
      output: 'Explored 18 steps, 55 members, 12 scenarios.',
      counts: { steps: 18, members: 55, scenarios: 12 },
    }],
    reportText: `
Final report:
- Coverage: p-queue concurrency
- Break 1: removed mutex, exit 1
- Break 2: inverted priority, exit 1
- Unverified: partitions
`,
  });
  assert.equal(res3.complete, false);
  assert.ok(res3.missing.some(m => m.includes('Record')));

  // Case 4: Missing deliberate break evidence in report (create requires 2 breaks)
  const skillCorrect = `
# Verify p-queue

## Run it
\`\`\`bash
verification_exec --spec Model.tla --config Model.cfg
\`\`\`
The model checks 18 steps, 55 members, and 12 scenarios.

## Record
- Tool version: TLC 2.18 (Java 17)
- Command: verification_exec --spec Model.tla --config Model.cfg
- Sync commit: c0ffee1
- Bounds: 3 workers, 10 items
- Assumptions: reliable in-memory queue
- Left out: persistence and disk serialization
`;
  const res4 = evaluateFormalVerificationCompletion({
    skillText: skillCorrect,
    commandRuns: [{
      command: 'verification_exec --spec Model.tla --config Model.cfg',
      exitCode: 0,
      output: 'Explored 18 steps, 55 members, 12 scenarios.',
      counts: { steps: 18, members: 55, scenarios: 12 },
    }],
    reportText: 'I am done with the skill.', // missing coverage, 2 breaks, unverified
  });
  assert.equal(res4.complete, false);
  assert.ok(res4.missing.some(m => m.includes('deliberate break') || m.includes('breakage')));

  // Case 5: All criteria satisfied!
  const res5 = evaluateFormalVerificationCompletion({
    skillText: skillCorrect,
    commandRuns: [{
      command: 'verification_exec --spec Model.tla --config Model.cfg',
      exitCode: 0,
      output: 'Explored 18 steps, 55 members, 12 scenarios.',
      counts: { steps: 18, members: 55, scenarios: 12 },
    }],
    reportText: `
Final Completion Report:
- Coverage scope: verifies p-queue concurrency invariant
- Deliberate breakage evidence:
  * Break 1: removed lock check in dequeue(); counterexample reported deadlock, exit 1. Restored.
  * Break 2: reordered priority comparator; counterexample reported invariant violation, exit 1. Restored.
- Unverified: persistence and recovery after crash.
`,
  });
  assert.equal(res5.complete, true);
  assert.equal(res5.status, 'complete');
  assert.equal(res5.exitCode, 0);
  assert.equal(res5.missing.length, 0);
});

test('detectUnfinishedExpression ignores continuation phrases inside code blocks', () => {
  const codeOnly = `
Here is the implementation:
\`\`\`ts
// Now let me rewrite this function
function calculate() {
  return 42;
}
\`\`\`
All tests pass and verification is complete.
`;
  const res = detectUnfinishedExpression(codeOnly);
  assert.equal(res.incomplete, false);
});

test('evaluateFormalVerificationCompletion distinguishes create (2 breaks) and maintain (1 break)', () => {
  const skill = `
# Skill
## Run it
\`\`\`bash
verification_exec --spec Model.tla --config Model.cfg
\`\`\`
## Record
- Tool version: TLC 2.18
- Sync commit: 1234567
- Bounds: 3
- Assumptions: none
- Left out: none
`;
  const singleBreakReport = `
Report:
- Scope: mutex
- Deliberate break 1: removed check, counterexample seen, exit 1
- Restored cleanly
- Unverified: none
`;

  // For create: requires 2 breaks -> should fail with single break
  const createRes = evaluateFormalVerificationCompletion({
    kind: 'create',
    skillText: skill,
    commandRuns: [{ command: 'verification_exec', exitCode: 0, output: 'ok' }],
    reportText: singleBreakReport,
  });
  assert.equal(createRes.complete, false);
  assert.ok(createRes.missing.some(m => m.includes('two break and restore cycles')));

  // For maintain: 1 break is sufficient -> should pass
  const maintainRes = evaluateFormalVerificationCompletion({
    kind: 'maintain',
    skillText: skill,
    commandRuns: [{ command: 'verification_exec', exitCode: 0, output: 'ok' }],
    reportText: singleBreakReport,
  });
  assert.equal(maintainRes.complete, true);
});

test('evaluateFormalVerificationCompletion: handles TLC unavailable', () => {
  // With required statement -> blocked
  const res1 = evaluateFormalVerificationCompletion({
    tlcAvailable: false,
    reportText: '未做形式化验证，原因是缺少 TLC。进行了生成式输入测试。',
  });
  assert.equal(res1.status, 'blocked');
  assert.equal(res1.exitCode, 126);
  assert.equal(res1.complete, false);

  // Without required statement -> incomplete
  const res2 = evaluateFormalVerificationCompletion({
    tlcAvailable: false,
    reportText: 'TLC was not found on this machine.',
  });
  assert.equal(res2.status, 'incomplete');
  assert.equal(res2.complete, false);
  assert.ok(res2.missing.some(m => m.includes('未做形式化验证，原因是缺少 TLC')));
});

test('custom completion checker registration and dispatch', async () => {
  registerCompletionChecker('custom_audit', ctx => {
    if (ctx.audited) return { status: 'complete', exitCode: 0, missing: [], reason: 'audit pass' };
    return { status: 'incomplete', exitCode: 1, missing: ['audit trail'], reason: 'audit fail' };
  });

  const r1 = await evaluateCompletion('custom_audit', { audited: true });
  assert.equal(r1.complete, true);
  assert.equal(r1.status, 'complete');

  const r2 = await evaluateCompletion('custom_audit', { audited: false });
  assert.equal(r2.complete, false);
  assert.equal(r2.status, 'incomplete');
  assert.deepEqual(r2.missing, ['audit trail']);
});

test('parseAutoContinueConfig parses boolean, object, and clamps turn limits', () => {
  assert.deepEqual(parseAutoContinueConfig(undefined), { enabled: true, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });
  assert.deepEqual(parseAutoContinueConfig(null), { enabled: true, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });
  assert.deepEqual(parseAutoContinueConfig(true), { enabled: true, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });
  assert.deepEqual(parseAutoContinueConfig(false), { enabled: false, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });

  assert.deepEqual(parseAutoContinueConfig({ autoContinue: false }), { enabled: false, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });
  assert.deepEqual(parseAutoContinueConfig({ autoContinue: true }), { enabled: true, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });
  assert.deepEqual(parseAutoContinueConfig({ autoContinue: { enabled: false } }), { enabled: false, maxTurns: DEFAULT_MAX_AUTO_CONTINUE_TURNS });
  assert.deepEqual(parseAutoContinueConfig({ autoContinue: { enabled: true, maxTurns: 5 } }), { enabled: true, maxTurns: 5 });

  // Clamp maxTurns bounds [MIN_AUTO_CONTINUE_TURNS, MAX_AUTO_CONTINUE_TURNS]
  assert.equal(parseAutoContinueConfig({ autoContinue: { maxTurns: 0 } }).maxTurns, MIN_AUTO_CONTINUE_TURNS);
  assert.equal(parseAutoContinueConfig({ autoContinue: { maxTurns: 100 } }).maxTurns, MAX_AUTO_CONTINUE_TURNS);
  assert.equal(parseAutoContinueConfig({ autoContinue: { maxTurns: -5 } }).maxTurns, MIN_AUTO_CONTINUE_TURNS);
});

test('decideAutoContinueStep controls continuation and enforces max turns limit', () => {
  const config = { enabled: true, maxTurns: 3 };

  // 1. Unfinished expression -> continue from turn 1 to turn 2
  const state1 = createInitialAutoContinueState({ maxTurns: 3 });
  const d1 = decideAutoContinueStep({
    state: state1,
    config,
    assistantText: 'Now let me rewrite SKILL.md to match the corrected model.',
  });
  assert.equal(d1.action, 'continue');
  assert.equal(d1.nextState.turn, 2);
  assert.match(d1.prompt, /auto-continue/i);

  // 2. Continues from turn 2 to turn 3
  const d2 = decideAutoContinueStep({
    state: d1.nextState,
    config,
    assistantText: '接下来要做形式化验证的自检。',
  });
  assert.equal(d2.action, 'continue');
  assert.equal(d2.nextState.turn, 3);

  // 3. At turn 3 (maxTurns = 3) -> stops and enforces budget limit
  const d3 = decideAutoContinueStep({
    state: d2.nextState,
    config,
    assistantText: 'Now let me run the TLC checks again.',
  });
  assert.equal(d3.action, 'stop');
  assert.equal(d3.nextState.status, 'stopped');
  assert.match(d3.nextState.reason, /max-turns-reached|budget-exhausted/);

  // 4. Clean text without unfinished expressions -> stops with completed
  const dClean = decideAutoContinueStep({
    state: state1,
    config,
    assistantText: 'Formal verification complete. All counts match and report is delivered.',
  });
  assert.equal(dClean.action, 'stop');
  assert.equal(dClean.nextState.status, 'completed');

  // 5. autoContinue disabled -> stops immediately
  const dDisabled = decideAutoContinueStep({
    state: state1,
    config: { enabled: false, maxTurns: 3 },
    assistantText: 'Now let me rewrite SKILL.md.',
  });
  assert.equal(dDisabled.action, 'stop');
  assert.equal(dDisabled.nextState.status, 'completed');
  assert.equal(dDisabled.nextState.reason, 'auto-continue-disabled');

  // 6. Aborted outcome -> stops with operator-aborted
  const dAborted = decideAutoContinueStep({
    state: state1,
    config,
    outcome: 'aborted',
    assistantText: 'Now let me do something.',
  });
  assert.equal(dAborted.action, 'stop');
  assert.equal(dAborted.nextState.status, 'stopped');
  assert.equal(dAborted.nextState.reason, 'operator-aborted');
});

test('autoContinueFromBranch recovers state and handles malformed branch', () => {
  const state = createInitialAutoContinueState({ maxTurns: 4 });
  const entries = [
    { type: 'message', message: { role: 'user', content: 'run verification' } },
    { type: 'custom', customType: AUTO_CONTINUE_ENTRY, data: state },
  ];
  const { active, state: recovered } = autoContinueFromBranch(entries);
  assert.equal(active, true);
  assert.equal(recovered.runId, state.runId);
  assert.equal(recovered.maxTurns, 4);

  // Malformed entry throws
  const badEntries = [{ type: 'custom', customType: AUTO_CONTINUE_ENTRY, data: { version: 99 } }];
  assert.throws(() => autoContinueFromBranch(badEntries), /Unsupported or malformed/);

  // No entries
  assert.deepEqual(autoContinueFromBranch([]), { active: false, state: null });
  assert.deepEqual(autoContinueFromBranch(null), { active: false, state: null });
});

test('registerAutoContinue integrates with Pi lifecycle (before_settle and settled)', async () => {
  const handlers = new Map();
  const branch = [];
  const pi = {
    on: (evt, fn) => { handlers.set(evt, fn); return () => handlers.delete(evt); },
    appendEntry: (customType, data) => branch.push({ type: 'custom', customType, data }),
  };

  registerAutoContinue(pi, {
    loadConfig: () => ({ autoContinue: { enabled: true, maxTurns: 2 } }),
  });

  assert.ok(handlers.has('agent_before_settle'));
  assert.ok(handlers.has('agent_settled'));

  const ctx = {
    sessionManager: { getBranch: () => branch },
  };

  // Turn 1 before_settle with unfinished assistant message:
  const event1 = {
    outcome: 'completed',
    entries: [
      { type: 'message', message: { role: 'assistant', content: 'Now let me rewrite SKILL.md to match the corrected model.' } },
    ],
  };

  const res1 = await handlers.get('agent_before_settle')(event1, ctx);
  assert.equal(res1.continue, true);
  assert.ok(res1.entries.some(e => e.customType === AUTO_CONTINUE_ENTRY));
  assert.ok(res1.entries.some(e => e.customType === AUTO_CONTINUE_TURN_TYPE));

  // Update branch with res1 entries
  branch.push(...res1.entries);

  // Turn 2 before_settle:
  const event2 = {
    outcome: 'completed',
    entries: [
      { type: 'message', message: { role: 'assistant', content: 'Next, I will re-run the verification.' } },
    ],
  };
  const res2 = await handlers.get('agent_before_settle')(event2, ctx);
  assert.equal(res2.continue, false); // hit maxTurns = 2
  assert.ok(res2.entries.some(e => e.customType === AUTO_CONTINUE_ENTRY && e.data.status === 'stopped'));

  // Test agent_settled on abort
  handlers.get('agent_settled')({ aborted: true }, ctx);
  const lastEntry = branch.at(-1);
  assert.equal(lastEntry.data.status, 'interrupted');
});
