import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { main, parsePlan, validatePlan } from './check-plan.mjs';
import { parseLoopArgs } from '../extensions/pstack/loop.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const template = readFileSync(new URL('../docs/templates/pstack-plan.md', import.meta.url), 'utf8');
const example = () => structuredClone(parsePlan(template).plan);
const contract = plan => '# Concrete plan\n\n```pstack-plan\n' + JSON.stringify(plan, null, 2) + '\n```\n';
const check = plan => validatePlan(plan);
const reject = (mutate, pattern) => {
  const plan = example();
  mutate(plan);
  assert.match(check(plan).join('\n'), pattern);
};
const temp = t => {
  const dir = mkdtempSync(join(tmpdir(), 'pstack-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const cli = (args, cwd = root) => spawnSync(process.execPath, [resolve(root, 'scripts/check-plan.mjs'), ...args], { cwd, encoding: 'utf8' });

function verified(plan, directory) {
  const pr = plan.prs[0];
  pr.state = 'verified';
  pr.head = 'a'.repeat(40);
  const paths = [
    ...pr.build, ...pr.observable, ...pr.verification.unit, ...pr.verification.live,
    ...('evidence' in pr.verification.perf ? [pr.verification.perf] : [])
  ].map(row => row.evidence);
  if (pr.review.required) paths.push(...pr.review.screenshots, pr.review.video, pr.review.approvalEvidence);
  pr.receipts = paths.map(evidence => {
    const path = join(directory, evidence);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `Verifier inspected the example artifact at ${pr.head}\n`);
    return { evidence, head: pr.head, exitCode: 0, summary: 'Fixture inspection passed at the recorded head' };
  });
  return plan;
}

test('shipped template is a valid planned contract, never a completed program', () => {
  assert.deepEqual(check(example()), []);
  assert.match(validatePlan(example(), { complete: true }).join('\n'), /completion requires verified/);
});

test('multi-phase planning produces a concrete two-PR plan and actually passes the CLI', t => {
  const dir = temp(t);
  const plan = example();
  plan.goal = 'Document checker success and error behavior in two independent pages';
  plan.repository = root;
  plan.execution.stopCommand = `node ${root}scripts/check-plan.mjs --complete ${dir}/plan.md`;
  const child = structuredClone(plan.prs[0]);
  Object.assign(child, { id: 'PR2', title: 'Explain error diagnostics', branch: 'docs/check-plan-errors', base: plan.prs[0].branch, dependsOn: ['PR1'], files: ['docs/check-plan-errors.md'] });
  plan.prs.push(child);
  const path = join(dir, 'plan.md');
  writeFileSync(path, contract(plan));
  const result = cli([path], tmpdir());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 PR sections, 0 problems \(structure\)/);
  t.diagnostic(`independent artifact ${path}; CLI exit=${result.status}; ${result.stdout.trim()}`);
  plan.prs[0].dependsOn = ['PR2'];
  const rejectedPath = join(dir, 'cyclic-plan.md');
  writeFileSync(rejectedPath, contract(plan));
  const rejected = cli([rejectedPath], tmpdir());
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /dependency cycle/);
  t.diagnostic(`independent rejection ${rejectedPath}; CLI exit=${rejected.status}; dependency cycle rejected`);
});

test('rejects unknown, self, duplicate and cyclic dependencies', () => {
  reject(p => { p.prs[0].dependsOn = ['MISSING']; }, /unknown or self dependency/);
  reject(p => { p.prs[0].dependsOn = ['PR1']; }, /unknown or self dependency/);
  reject(p => { p.prs[0].dependsOn = ['MISSING', 'MISSING']; }, /duplicate dependencies/);
  reject(p => {
    const next = structuredClone(p.prs[0]); next.id = 'PR2'; next.dependsOn = ['PR1'];
    p.prs[0].dependsOn = ['PR2']; p.prs.push(next);
  }, /dependency cycle/);
  reject(p => { p.prs.push(structuredClone(p.prs[0])); }, /duplicate PR id/);
});

test('requires live regression scenarios and concrete pass/evidence fields', () => {
  reject(p => { p.prs[0].verification.live = []; }, /requires a nonempty array/);
  reject(p => { p.prs[0].verification.live[0].regression = false; }, /requires a regression lane/);
  reject(p => { p.prs[0].verification.unit[0].command = 'TODO'; }, /without placeholders/);
  reject(p => { p.prs[0].observable[0].pass = ''; }, /requires concrete text/);
  reject(p => { p.prs[0].build[0].evidence = '../outside'; }, /relative artifact path/);
  reject(p => { p.prs[0].build[0].evidence = '/tmp/outside'; }, /relative artifact path/);
  reject(p => { p.prs[0].observable[0].evidence = p.prs[0].build[0].evidence; }, /duplicate evidence/);
});

test('measured perf gate needs metric, probe, baseline and numeric-rule text; exemption needs reason', () => {
  const plan = example();
  plan.prs[0].verification.perf = { metric: 'elapsed ms', probe: 'Alternate trunk/head CLI runs five times', baseline: 'Record trunk milliseconds before the first head run', rule: 'Head median must be at most 1.10 times trunk', evidence: 'evidence/PR1/perf.log' };
  assert.deepEqual(check(plan), []);
  delete plan.prs[0].verification.perf.baseline;
  assert.match(check(plan).join('\n'), /perf.baseline/);
  reject(p => { p.prs[0].verification.perf = { notApplicable: '' }; }, /notApplicable/);
  reject(p => { p.prs[0].verification.perf.probe = 'npm test'; }, /cannot coexist/);
});

test('interaction review requires screenshots, video and operator approval evidence', () => {
  reject(p => { p.prs[0].review = { required: true }; }, /review.screenshots/);
  const plan = example();
  plan.prs[0].review = { required: true, screenshots: ['evidence/PR1/review.png'], video: 'evidence/PR1/review.mp4', approvalEvidence: 'evidence/PR1/approval.md' };
  assert.deepEqual(check(plan), []);
  delete plan.prs[0].review.approvalEvidence;
  assert.match(check(plan).join('\n'), /approvalEvidence/);
});

test('requires bounded execution, explicit-go and all reserved operation gates', () => {
  reject(p => { p.execution.maxTurns = 101; }, /1\.\.100/);
  reject(p => { p.execution.maxParallel = 0; }, /1\.\.10/);
  reject(p => { p.execution.approval = 'automatic'; }, /explicit-go-required/);
  reject(p => { p.execution.playbook = 'scripts/orch/orch.ts'; }, /bundled/);
  reject(p => { p.execution.reservedActions = ['commit']; }, /missing merge authorization gate/);
  reject(p => { p.prs[0].merge.gate = 'automatic'; }, /explicit-authorization/);
});

test('fenced examples and HTML comments cannot impersonate a plan contract', () => {
  const block = contract(example());
  assert.throws(() => parsePlan('````markdown\n' + block + '\n````'), /found 0/);
  assert.throws(() => parsePlan('<!--\n' + block + '\n-->'), /found 0/);
  assert.throws(() => parsePlan(block + block), /found 2/);
  assert.throws(() => parsePlan('```pstack-plan\n{}'), /Unclosed/);
  assert.throws(() => parsePlan('```pstack-plan\n{invalid}\n```'), /Invalid plan JSON/);
  assert.deepEqual(parsePlan(block.replaceAll('```', '~~~')).plan, example());
});

for (const marker of ['`', '~']) {
  test(`plan fences accept longer ${marker} delimiters and closers`, () => {
    const plan = example();
    plan.goal = 'Document ``code with `nested` backticks`` and punctuation: a, b; c.';
    const markdown = `${marker.repeat(4)}pstack-plan\n${JSON.stringify(plan)}\n${marker.repeat(5)}\n`;
    assert.deepEqual(parsePlan(markdown), { plan, line: 1 });
    assert.deepEqual(check(parsePlan(markdown).plan), []);
    assert.throws(() => parsePlan(markdown.replace(marker.repeat(5), marker.repeat(3))), /Unclosed/);
    const other = marker === '`' ? '~' : '`';
    assert.throws(() => parsePlan(markdown.replace(marker.repeat(5), other.repeat(5))), /Unclosed/);
  });

  test(`shorter and mismatched fences cannot expose a contract inside a ${marker} example`, () => {
    const other = marker === '`' ? '~' : '`';
    const hidden = `${marker.repeat(5)}markdown\n${marker.repeat(3)}\n${other.repeat(5)}\n${contract(example())}\n${marker.repeat(5)}\n`;
    assert.throws(() => parsePlan(hidden), /found 0/);
    assert.deepEqual(parsePlan(hidden + contract(example())).plan, example());
  });
}

test('malformed JSON shapes yield diagnostics rather than crashing', () => {
  for (const value of [null, [], 42, {}, { ...example(), prs: [null, 7] }]) assert.ok(check(value).length);
  reject(p => { p.prs[0].verification = { unit: [null], live: [7] }; }, /requires an object/);
});

test('complete CLI resolves evidence from the plan, not cwd; never executes plan commands', t => {
  const dir = temp(t);
  const plan = verified(example(), dir);
  plan.execution.stopCommand = 'exit 99';
  plan.prs[0].verification.unit[0].command = 'exit 99';
  const path = join(dir, 'plan.md');
  writeFileSync(path, contract(plan));
  const result = cli([path, '--complete'], tmpdir());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 problems \(complete\)/);
});

test('completion rejects stale heads, failed exits, missing receipts and missing artifacts', t => {
  const dir = temp(t);
  const plan = verified(example(), dir);
  const options = { complete: true, planPath: join(dir, 'plan.md') };
  const stale = structuredClone(plan); stale.prs[0].head = 'b'.repeat(40);
  assert.match(validatePlan(stale, options).join('\n'), /stale receipt head/);
  const failed = structuredClone(plan); failed.prs[0].receipts[0].exitCode = 1;
  assert.match(validatePlan(failed, options).join('\n'), /exitCode must be 0/);
  const missing = structuredClone(plan); missing.prs[0].receipts.pop();
  assert.match(validatePlan(missing, options).join('\n'), /missing receipt/);
  rmSync(join(dir, plan.prs[0].receipts[0].evidence));
  assert.match(validatePlan(plan, options).join('\n'), /missing evidence file/);
});

test('completion rejects a verified child when its dependency is blocked', t => {
  const dir = temp(t);
  const plan = verified(example(), dir);
  const child = structuredClone(plan.prs[0]);
  child.id = 'PR2';
  child.dependsOn = ['PR1'];
  plan.prs.push(child);
  plan.prs[0].state = 'blocked';
  assert.match(validatePlan(plan, { complete: true, planPath: join(dir, 'plan.md') }).join('\n'), /prs\[0\]: completion requires verified/);
  const path = join(dir, 'plan.md');
  writeFileSync(path, contract(plan));
  assert.equal(cli(['--complete', path]).status, 1);
});

test('completion includes interaction approval artifacts and rejects blocked verdicts', t => {
  const dir = temp(t);
  const plan = example();
  plan.prs[0].review = { required: true, screenshots: ['evidence/PR1/screen.png'], video: 'evidence/PR1/demo.mp4', approvalEvidence: 'evidence/PR1/approval.md' };
  verified(plan, dir);
  const options = { complete: true, planPath: join(dir, 'plan.md') };
  assert.deepEqual(validatePlan(plan, options), []);
  plan.prs[0].state = 'blocked';
  assert.match(validatePlan(plan, options).join('\n'), /completion requires verified/);
});

test('documented Pi loops parse with the actual runtime and valid shell quoting', () => {
  for (const name of ['orchestrate', 'babysit']) {
    const markdown = readFileSync(resolve(root, `skills/poteto-mode/playbooks/${name}.md`), 'utf8');
    const line = markdown.split('\n').find(line => line.startsWith('/loop run '));
    assert.ok(line, name);
    const parsed = parseLoopArgs(line.slice('/loop '.length));
    assert.equal(parsed.action, 'run');
    assert.ok(parsed.maxTurns <= 8);
    const syntax = spawnSync('bash', ['-n', '-c', parsed.until.command], { cwd: root, encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
});

test('documented babysit predicate accepts only a pinned, clean, thread-free snapshot', () => {
  const markdown = readFileSync(resolve(root, 'skills/poteto-mode/playbooks/babysit.md'), 'utf8');
  const line = markdown.split('\n').find(line => line.startsWith('/loop run '));
  const { until } = parseLoopArgs(line.slice('/loop '.length));
  // Simulate gh at its process boundary; exercise the actual documented shell,
  // substitutions, GraphQL variable escaping and handling of gh exit codes.
  const stub = `gh() {
    case "$*" in
      *'pr checks'*) return "\${CHECK_EXIT:-0}" ;;
      *'api graphql'*)
        case "$*" in *'query($owner:String!,$repo:String!,$pr:Int!,$endCursor:String)'*) ;; *) return 42 ;; esac
        case "$*" in *'--paginate --slurp'*) ;; *) return 43 ;; esac
        printf '%s' "\${THREADS_CLEAR-true}" ;;
      *'--json headRefOid'*) printf '%s' "\${PIN:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}" ;;
      *'--json state,isDraft'*) printf '%s' "\${FINAL_CLEAR:-true}" ;;
      *) return 44 ;;
    esac
  }
  `;
  const command = stub + until.command.replace('cd /absolute/repository', 'cd .');
  const run = env => spawnSync('bash', ['-c', command], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  const passing = run({});
  assert.equal(passing.status, 0, passing.stderr);
  for (const env of [
    { CHECK_EXIT: '8' }, { CHECK_EXIT: '1' }, { CHECK_EXIT: '4' },
    { THREADS_CLEAR: 'false' }, { THREADS_CLEAR: '' },
    { FINAL_CLEAR: 'false' }, { PIN: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
  ]) assert.notEqual(run(env).status, 0, JSON.stringify(env));
});

test('CLI has stable exit codes and field diagnostics', t => {
  const dir = temp(t);
  const path = join(dir, 'bad.md');
  writeFileSync(path, contract({}));
  const rejected = cli([path]);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /bad.md:3: schemaVersion/);
  assert.equal(cli([]).status, 2);
  assert.equal(cli(['--unknown']).status, 2);
  assert.equal(cli([path, '--complete', '--complete']).status, 2);
  assert.equal(cli([join(dir, 'missing.md')]).status, 2);
  writeFileSync(path, '```pstack-plan\nnot json\n```');
  assert.equal(cli([path]).status, 1);
  const messages = [];
  assert.equal(main([], { out: x => messages.push(x), err: x => messages.push(x) }), 2);
  assert.match(messages.join('\n'), /Usage:/);
});
