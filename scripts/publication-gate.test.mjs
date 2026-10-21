// Behavioral tests for the Pi publication gate. The suite never runs git or gh:
// it drives the pure parser and the exported Pi handlers with fake events.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  defaultReceiptPath,
  extractCountClaims,
  inspectCommand,
  main,
  parseTestCounts,
  recordTestRun,
  registerPublicationGate,
  testCommandOf,
  testInvocationsOf,
  validateBody,
  validateTitle,
} from '../extensions/pstack/publication-gate.mjs';

const TAP = [
  'TAP version 13',
  '# tests 3',
  '# pass 3',
  '# fail 0',
  '# skipped 0',
  'TAP version 13',
  '# tests 5',
  '# pass 4',
  '# fail 1',
  '# skipped 0',
].join('\n');

const CLEAN_TAP = ['TAP version 13', '# tests 11', '# pass 11', '# fail 0', '# skipped 0'].join('\n');

function body(verification = '- `npm run check`: exit 0.', { tradeoffs = false } = {}) {
  return [
    '## Why',
    '',
    'Malformed publication requests should not run.',
    '',
    '## What changed',
    '',
    '- Added a mechanical gate.',
    '',
    '## Scope',
    '',
    '- Covers local commits and PR creation.',
    '',
    ...(tradeoffs ? ['## Tradeoffs', '', 'Rejected a prose-only lint pass.', ''] : []),
    '## Blast Radius',
    '',
    'Touches publication commands only.',
    '',
    '## Verification',
    '',
    verification,
    '',
  ].join('\n');
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'pstack-publication-'));
  mkdirSync(join(root, '.git'));
  return root;
}

test('title gate accepts Conventional Commits and rejects malformed titles', () => {
  assert.deepEqual(validateTitle('fix(pstack): retarget opening-a-pr babysit trigger'), []);
  assert.deepEqual(validateTitle('feat(mode/state): keep branch state'), []);
  for (const bad of [
    'Update the gate',
    'fix: missing scope',
    'fix(pstack): trailing period.',
    'fix(PSTACK): uppercase scope',
    'update(pstack): unknown type',
    'fix(pstack)?: punctuation',
    'fix(pstack): ',
    'fix(pstack): <subject>',
    'fix(pstack): one\nline',
  ]) {
    assert.ok(validateTitle(bad).length > 0, `expected a rejection for ${JSON.stringify(bad)}`);
  }
});

test('body gate accepts the required order with optional Tradeoffs', () => {
  assert.deepEqual(validateBody(body(), { receipts: [] }), []);
  assert.deepEqual(validateBody(body(undefined, { tradeoffs: true }), { receipts: [] }), []);
});

test('body gate rejects a missing required heading', () => {
  const missing = body().replace('## Blast Radius\n\nTouches publication commands only.\n\n', '');
  const problems = validateBody(missing, { receipts: [] });
  assert.ok(problems.some(problem => problem.includes('missing required heading ## Blast Radius')), problems.join('\n'));
});

test('body gate rejects headings out of the fixed order', () => {
  const swapped = body().replace(
    '## Scope\n\n- Covers local commits and PR creation.\n\n## Blast Radius\n\nTouches publication commands only.',
    '## Blast Radius\n\nTouches publication commands only.\n\n## Scope\n\n- Covers local commits and PR creation.',
  );
  assert.ok(validateBody(swapped, { receipts: [] }).some(problem => problem.includes('out of order')));

  const lateTradeoffs = `${body(undefined, { tradeoffs: true }).replace('## Tradeoffs\n\nRejected a prose-only lint pass.\n\n', '')}`;
  const moved = lateTradeoffs.replace('## Verification', '## Tradeoffs\n\nRejected a prose-only lint pass.\n\n## Verification');
  assert.ok(validateBody(moved, { receipts: [] }).some(problem => problem.includes('out of order')));
});

test('body gate rejects unknown, duplicate, empty and placeholder sections', () => {
  assert.ok(validateBody(`${body()}\n## Tests\n\n- pass`, { receipts: [] }).some(problem => problem.includes('not part of the fixed order')));
  assert.ok(validateBody(body().replace('## Scope', '## Why'), { receipts: [] }).some(problem => problem.includes('more than once')));
  assert.ok(validateBody(body().replace('Touches publication commands only.', ''), { receipts: [] }).some(problem => problem.includes('must not be empty')));
  assert.ok(validateBody(body().replace('Touches publication commands only.', '<who this touches>'), { receipts: [] }).some(problem => problem.includes('placeholder')));
  assert.ok(validateBody(body().replace('## Why', '**Why**'), { receipts: [] }).some(problem => problem.includes('missing required heading ## Why')));
});

test('non-publication commands are allowed untouched', () => {
  for (const command of [
    'git status --short',
    'git log --grep commit',
    'git show commit',
    'npm test',
    'node --test scripts/loop.test.mjs',
    'echo building',
  ]) {
    assert.equal(inspectCommand(command, { cwd: repo(), receipts: [] }).status, 'allow', command);
  }
});

test('a commit with a bad title is blocked and a compliant title passes', () => {
  const cwd = repo();
  const bad = inspectCommand('git commit -m "Update the gate"', { cwd, receipts: [] });
  assert.equal(bad.status, 'block');
  assert.match(bad.reason, /Conventional Commits/);
  assert.equal(inspectCommand('git commit -m "fix(pstack): close the publication gate"', { cwd, receipts: [] }).status, 'allow');
});

test('ordinary commit bodies are not forced into the PR heading shape', () => {
  const cwd = repo();
  assert.equal(inspectCommand('git commit -m "fix(pstack): close the gate" -m "Fixes #12"', { cwd, receipts: [] }).status, 'allow');
  assert.equal(inspectCommand('git commit -m "fix(pstack): close the gate" -m "999 pass, 0 fail"', { cwd, receipts: [] }).status, 'allow');
  const quoted = body().replace(/'/g, "'\\''");
  assert.equal(inspectCommand(`git commit -m "fix(pstack): close the gate" -m '${quoted}'`, { cwd, receipts: [] }).status, 'allow');

  const strict = inspectCommand('git commit -m "fix(pstack): close the gate" -m "Fixes #12"', { cwd, receipts: [], requireCommitBody: true });
  assert.equal(strict.status, 'block');
  assert.match(strict.reason, /## Why/);
  const strictGood = inspectCommand(`git commit -m "fix(pstack): close the gate" -m '${quoted}'`, { cwd, receipts: [], requireCommitBody: true });
  assert.equal(strictGood.status, 'allow', strictGood.reason);
});

test('commit message files are read, and unverifiable message sources are blocked', () => {
  const cwd = repo();
  writeFileSync(join(cwd, 'message.txt'), 'fix(pstack): close the gate\n\n' + body());
  assert.equal(inspectCommand('git commit -F message.txt', { cwd, receipts: [] }).status, 'allow');
  assert.equal(inspectCommand('git commit --file=message.txt', { cwd, receipts: [] }).status, 'allow');
  assert.equal(inspectCommand('git commit -F message.txt --amend', { cwd, receipts: [] }).status, 'allow');
  for (const command of [
    'git commit -F -',
    'git commit',
    'git commit --amend',
    'git commit --no-edit',
    'git commit --amend --no-edit',
    'git commit -C HEAD',
    'git commit --fixup HEAD',
    'git commit --edit -m "fix(pstack): x"',
    'git commit -m "fix(pstack): x" -F message.txt',
    'git commit -F missing.txt',
  ]) {
    assert.equal(inspectCommand(command, { cwd, receipts: [] }).status, 'block', command);
  }
});

test('PRs require a title and a body with the fixed headings', () => {
  const cwd = repo();
  writeFileSync(join(cwd, 'pr.md'), body());
  assert.equal(inspectCommand('gh pr create --title "feat(pstack): gate PRs" --body-file pr.md', { cwd, receipts: [] }).status, 'allow');
  assert.equal(inspectCommand('gh pr create --title "feat(pstack): gate PRs" --body-file=pr.md', { cwd, receipts: [] }).status, 'allow');

  const cases = [
    ['gh pr create --body-file pr.md', 'needs --title'],
    ['gh pr create --title "feat(pstack): gate PRs"', 'no verifiable body'],
    ['gh pr create --title "feat(pstack): gate PRs" --body "short"', '## Why'],
    ['gh pr create --title "feat: gate PRs" --body-file pr.md', 'Conventional Commits'],
    ['gh pr create --title "feat(pstack): gate PRs" --body-file missing.md', 'does not exist'],
    ['gh pr create --title "feat(pstack): gate PRs" --body-file -', 'stdin'],
    ['gh pr create --fill', '--fill'],
    ['gh pr create --title "feat(pstack): gate PRs" --body-file pr.md --body other', 'not both'],
  ];
  for (const [command, reason] of cases) {
    const result = inspectCommand(command, { cwd, receipts: [] });
    assert.equal(result.status, 'block', command);
    assert.match(result.reason, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${command}\n${result.reason}`);
  }
});

test('wrapped and chained requests are inspected, and hidden requests fail closed', () => {
  const cwd = repo();
  assert.equal(inspectCommand('sudo git commit -m "Update"', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('sudo -u deploy git commit -m "Update"', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('env FOO=1 git commit -m "Update"', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('bash -c \'git commit -m "Update"\'', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('bash -lc \'git commit -m "Update"\'', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('git status && git commit -m "Update"', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('echo "git commit -m Update"', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('echo "$(git commit -m Update)"', { cwd, receipts: [] }).status, 'block');
  assert.equal(inspectCommand('git commit -m "fix(pstack): ok" && gh pr create --title "feat(pstack): x"', { cwd, receipts: [] }).status, 'block');
});

test('a linked worktree whose gitdir is outside the workspace uses a temp store', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pstack-linked-'));
  const outside = mkdtempSync(join(tmpdir(), 'pstack-gitdir-'));
  writeFileSync(join(cwd, '.git'), `gitdir: ${outside}\n`);
  const receiptPath = defaultReceiptPath(cwd);
  assert.ok(receiptPath.includes('pstack-publication'), receiptPath);
  assert.ok(!receiptPath.startsWith(outside), receiptPath);
  assert.equal(inspectCommand('git status', { cwd }).status, 'allow');
  try {
    recordTestRun({ command: 'npm run check', output: CLEAN_TAP, cwd });
    assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).runs[0].pass, 11);
  } finally {
    rmSync(receiptPath, { force: true });
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('test summaries aggregate and receipts record actual runs', () => {
  assert.deepEqual(parseTestCounts(TAP), { tests: 8, pass: 7, fail: 1, skipped: 0 });
  assert.deepEqual(parseTestCounts(CLEAN_TAP), { tests: 11, pass: 11, fail: 0, skipped: 0 });
  assert.equal(parseTestCounts('no summary here'), null);
  assert.deepEqual(extractCountClaims('13 tests, 13 pass, 0 fail'), { tests: 13, pass: 13, fail: 0 });
  assert.deepEqual(extractCountClaims('307/307'), { pass: 307, tests: 307 });
  assert.equal(testCommandOf('npm run check'), 'npm run check');
  assert.equal(testCommandOf('npm run check > check.log 2>&1'), 'npm run check');
  assert.equal(testCommandOf('NODE_ENV=development npm test'), 'npm test');
  assert.equal(testCommandOf('node --test scripts/loop.test.mjs'), 'node --test scripts/loop.test.mjs');
  assert.equal(testCommandOf('git status'), null);

  const cwd = repo();
  const run = recordTestRun({ command: 'npm run check', output: CLEAN_TAP, cwd });
  assert.equal(run.tests, 11);
  const stored = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8'));
  assert.equal(stored.runs.length, 1);
  assert.equal(stored.runs[0].command, 'npm run check');
  assert.deepEqual(stored.runs[0].argv, ['npm', 'run', 'check']);
});

test('test counts must match the last actual run of the cited command', () => {
  const cwd = repo();
  recordTestRun({ command: 'npm run check', output: ['# tests 10', '# pass 10', '# fail 0', '# skipped 0'].join('\n'), cwd });
  const current = body('- `npm run check`: 10 pass, 0 fail.');
  assert.deepEqual(validateBody(current, { receipts: JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs }), []);

  recordTestRun({ command: 'npm run check', output: CLEAN_TAP, cwd });
  const receipts = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs;
  const stale = validateBody(current, { receipts });
  assert.ok(stale.some(problem => problem.includes('stale')), stale.join('\n'));
  assert.deepEqual(validateBody(body('- `npm run check`: 11 pass, 0 fail.'), { receipts }), []);
  assert.ok(validateBody(body('- `npm run check`: 12 pass, 0 fail.'), { receipts }).some(problem => problem.includes('reported 11')));
  assert.ok(validateBody(body('- `npm run check`: 11 pass, 2 fail.'), { receipts }).some(problem => problem.includes('fail')));

  const subtree = body('- `node --test scripts/loop.test.mjs`: 3 pass, 0 fail.');
  recordTestRun({ command: 'node --test scripts/loop.test.mjs', output: ['# tests 3', '# pass 3', '# fail 0', '# skipped 0'].join('\n'), cwd });
  const withSubtree = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs;
  assert.deepEqual(validateBody(subtree, { receipts: withSubtree }), []);

  const noReceipt = validateBody(body('- `npm run check`: 11 pass, 0 fail.'), { receipts: [] });
  assert.ok(noReceipt.some(problem => problem.includes('no recorded run')), noReceipt.join('\n'));
});

test('counts match the exact argv, so a different test filter is a different run', () => {
  const cwd = repo();
  recordTestRun({
    command: 'node --test scripts/x.test.mjs --test-name-pattern=alpha',
    output: ['# tests 3', '# pass 3', '# fail 0', '# skipped 0'].join('\n'),
    cwd,
  });
  const receipts = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs;
  const exact = body('- `node --test scripts/x.test.mjs --test-name-pattern=alpha`: 3 pass, 0 fail.');
  assert.deepEqual(validateBody(exact, { receipts }), []);

  const otherFilter = body('- `node --test scripts/x.test.mjs --test-name-pattern=beta`: 3 pass, 0 fail.');
  assert.ok(validateBody(otherFilter, { receipts }).some(problem => problem.includes('no recorded run')), otherFilter);

  const missingFlag = body('- `node --test scripts/x.test.mjs`: 3 pass, 0 fail.');
  assert.ok(validateBody(missingFlag, { receipts }).some(problem => problem.includes('no recorded run')));

  recordTestRun({ command: 'npm run check', output: CLEAN_TAP, cwd });
  const withCheck = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs;
  const wrongArgs = body('- `npm run check -- --filter=other`: 11 pass, 0 fail.');
  assert.ok(validateBody(wrongArgs, { receipts: withCheck }).some(problem => problem.includes('no recorded run')));
});

test('a command with several test invocations is refused a receipt', () => {
  const cwd = repo();
  assert.equal(testInvocationsOf('npm test && node --test scripts/other.test.mjs').length, 2);
  assert.equal(recordTestRun({ command: 'npm test && node --test scripts/other.test.mjs', output: TAP, cwd }), null);
  assert.equal(existsSync(join(cwd, '.git', 'pstack-publication-receipts.json')), false);
  assert.equal(recordTestRun({ command: 'npm test; npm run check', output: TAP, cwd }), null);

  const one = recordTestRun({ command: 'npm test && echo done', output: CLEAN_TAP, cwd });
  assert.ok(one);
  assert.equal(one.command, 'npm test');
});

test('a failed latest run cannot back a green count claim', () => {
  const cwd = repo();
  recordTestRun({ command: 'npm test', output: CLEAN_TAP, ok: false, cwd });
  const receipts = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs;
  const problems = validateBody(body('- `npm test`: 11 pass, 0 fail.'), { receipts });
  assert.ok(problems.some(problem => problem.includes('failed')), problems.join('\n'));
});

test('common wrappers and shell-escaped executables are still inspected', () => {
  const cwd = repo();
  for (const command of [
    'nice git commit -m "Update the gate"',
    'nice -n 10 git commit -m "Update the gate"',
    'nice g\\it commit -m "Update the gate"',
    'nice g""it commit -m "Update the gate"',
    'stdbuf -o0 git commit -m "Update the gate"',
    'timeout 5 git commit -m "Update the gate"',
    'timeout -s KILL 5 git commit -m "Update the gate"',
  ]) {
    assert.equal(inspectCommand(command, { cwd, receipts: [] }).status, 'block', command);
  }
  assert.equal(inspectCommand('nice git status', { cwd, receipts: [] }).status, 'allow');
});

test('in-command git aliases cannot hide commit', () => {
  const cwd = repo();
  for (const command of [
    'git -c alias.ci=commit ci -m "Update the gate"',
    'git -c alias.ci=commit ci -m "fix(pstack): ok"',
    'git -c "alias.ci=commit" ci -m "Update the gate"',
  ]) {
    assert.equal(inspectCommand(command, { cwd, receipts: [] }).status, 'block', command);
  }
  assert.equal(inspectCommand('git -c color.ui=false status', { cwd, receipts: [] }).status, 'allow');
});

test('gh api pull-request writes are refused and point at gh pr create', () => {
  const cwd = repo();
  for (const command of [
    'gh api repos/owner/repo/pulls -f title=bad -f body=nope -f head=branch -f base=main',
    'gh api -X POST repos/owner/repo/pulls -f title=bad',
    'gh api --method PATCH repos/owner/repo/pulls/7 -f body=nope',
    'gh api graphql -f query=mutation -f title=bad',
    'gh api graphql --input mutation.json',
    'gh api --input pr.json repos/owner/repo/pulls',
  ]) {
    const result = inspectCommand(command, { cwd, receipts: [] });
    assert.equal(result.status, 'block', command);
    assert.match(result.reason, /gh pr create/, `${command}\n${result.reason}`);
  }
  assert.equal(inspectCommand('gh api repos/owner/repo/pulls', { cwd, receipts: [] }).status, 'allow');
  assert.equal(inspectCommand('gh api repos/owner/repo/issues --jq "[.[].title]"', { cwd, receipts: [] }).status, 'allow');
  assert.equal(inspectCommand('gh api graphql -X POST -f query=query{viewer{login}}', { cwd, receipts: [] }).status, 'allow');
});

test('variable-expanded executables cannot silently carry a publication request', () => {
  const cwd = repo();
  for (const command of [
    'g=git; $g commit -m "Update the gate"',
    'x=gh; $x pr create --title bad --body nope',
    'g=git; "$g" commit -m "Update the gate"',
    'g=git; ${g} commit -m "Update the gate"',
    '$(which git) commit -m "Update the gate"',
  ]) {
    assert.equal(inspectCommand(command, { cwd, receipts: [] }).status, 'block', command);
  }
  assert.equal(inspectCommand('g=git; $g status', { cwd, receipts: [] }).status, 'allow');
});

test('verification_exec results record a receipt from structured details', async () => {
  const cwd = repo();
  const handlers = {};
  const pi = { on(name, handler) { (handlers[name] ??= []).push(handler); } };
  registerPublicationGate(pi, { cwd });
  const rendered = [
    'COMMAND: npm test',
    'STATUS: passed',
    'EXIT CODE: 0',
    '',
    'STDOUT:',
    CLEAN_TAP,
    '',
    'STDERR:',
    '(empty)',
  ].join('\n');
  await handlers.tool_result[0]({
    toolName: 'verification_exec',
    input: { command: 'npm test' },
    content: [{ type: 'text', text: rendered }],
    details: { ok: true, status: 'passed', exitCode: 0, sandbox: 'test', category: 'test' },
    isError: false,
  }, { cwd });
  const stored = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8'));
  assert.equal(stored.runs[0].command, 'npm test');
  assert.equal(stored.runs[0].ok, true);
  assert.equal(stored.runs[0].pass, 11);
  assert.deepEqual(validateBody(body('- `npm test`: 11 pass, 0 fail.'), { receipts: stored.runs }), []);

  const failedRendered = rendered.replace('STATUS: passed', 'STATUS: failed').replace('EXIT CODE: 0', 'EXIT CODE: 1');
  await handlers.tool_result[0]({
    toolName: 'verification_exec',
    input: { command: 'npm test' },
    content: [{ type: 'text', text: failedRendered }],
    details: { ok: true, status: 'failed', exitCode: 1, sandbox: 'test', category: 'test' },
    isError: false,
  }, { cwd });
  const afterFailed = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8')).runs;
  assert.equal(afterFailed.at(-1).ok, false);
});

test('a corrupt receipt store blocks publications but not unrelated commands', () => {
  const cwd = repo();
  writeFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), '{not json');
  assert.equal(inspectCommand('git status', { cwd }).status, 'allow');
  const result = inspectCommand('git commit -m "fix(pstack): ok"', { cwd });
  assert.equal(result.status, 'block');
  assert.match(result.reason, /receipt store could not be read/);
});

test('the Pi handler blocks bad requests and records real test results', async () => {
  const cwd = repo();
  const handlers = {};
  const pi = { on(name, handler) { (handlers[name] ??= []).push(handler); } };
  registerPublicationGate(pi, { cwd });
  assert.equal(handlers.tool_call.length, 1);
  assert.equal(handlers.tool_result.length, 1);

  const blocked = await handlers.tool_call[0]({ toolName: 'bash', input: { command: 'git commit -m "Update"' } }, { cwd });
  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /Conventional Commits/);
  assert.equal(await handlers.tool_call[0]({ toolName: 'bash', input: { command: 'git commit -m "fix(pstack): ok"' } }, { cwd }), undefined);
  assert.equal(await handlers.tool_call[0]({ toolName: 'read', input: { path: 'x' } }, { cwd }), undefined);

  await handlers.tool_result[0]({ toolName: 'bash', input: { command: 'npm run check' }, content: [{ type: 'text', text: CLEAN_TAP }], isError: false }, { cwd });
  const stored = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8'));
  assert.equal(stored.runs[0].pass, 11);

  writeFileSync(join(cwd, 'full.log'), CLEAN_TAP);
  await handlers.tool_result[0]({
    toolName: 'bash',
    input: { command: 'npm run check' },
    content: [{ type: 'text', text: 'truncated output without a summary' }],
    details: { fullOutputPath: join(cwd, 'full.log') },
    isError: false,
  }, { cwd });
  const afterFull = JSON.parse(readFileSync(join(cwd, '.git', 'pstack-publication-receipts.json'), 'utf8'));
  assert.equal(afterFull.runs.at(-1).pass, 11);

  const enabled = [];
  registerPublicationGate({ on: (name, handler) => enabled.push(handler) }, { cwd, enabled: () => false });
  assert.equal(await enabled[0]({ toolName: 'bash', input: { command: 'git commit -m "Update"' } }, { cwd }), undefined);
});

test('the CLI reports the same verdicts with stable exit codes', () => {
  const cwd = process.cwd();
  const out = [];
  const err = [];
  const io = { out: line => out.push(line), err: line => err.push(line) };
  assert.equal(main(['inspect', '--command', 'git commit -m "Update"'], io), 1);
  assert.equal(main(['inspect', '--command', 'git status'], io), 0);
  assert.equal(main(['check', '--kind', 'commit', '--title', 'fix(pstack): ok'], io), 0);
  assert.equal(main(['check', '--kind', 'commit', '--title', 'fix(pstack): ok', '--body', 'Fixes #12'], io), 0);
  assert.equal(main(['check', '--kind', 'commit', '--title', 'update gate'], io), 1);
  assert.equal(main(['check', '--kind', 'pr', '--title', 'fix(pstack): ok'], io), 1);
  assert.equal(main(['check', '--kind', 'pr'], io), 2);
  assert.equal(main([], io), 2);

  const root = repo();
  const outputFile = join(root, 'tap.txt');
  writeFileSync(outputFile, CLEAN_TAP);
  const mixedFile = join(root, 'mixed.txt');
  writeFileSync(mixedFile, TAP);
  try {
    process.chdir(root);
    assert.equal(main(['record', '--command', 'npm run check', '--output-file', outputFile], io), 0);
    const stored = JSON.parse(readFileSync(join(root, '.git', 'pstack-publication-receipts.json'), 'utf8'));
    assert.equal(stored.runs[0].pass, 11);
    assert.equal(main(['record', '--command', 'npm test && node --test other.mjs', '--output-file', mixedFile], io), 1);
    assert.ok(err.some(line => line.includes('more than one test invocation')), err.join('\n'));
  } finally {
    process.chdir(cwd);
  }
  assert.ok(out.length > 0);
  assert.ok(err.length > 0);
});
