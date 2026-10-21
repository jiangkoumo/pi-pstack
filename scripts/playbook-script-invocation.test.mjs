import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const LIVE = process.argv.includes('--live');

// These tests execute the commands the two playbooks document. They do not
// assert that a model follows the prose; they prove the documented invocations
// run, stay read-only by default, and expose no hidden delete/merge mode.
const root = fileURLToPath(new URL('..', import.meta.url));
const auditScript = resolve(root, 'scripts/worktree-audit.mjs');
const watchScript = resolve(root, 'scripts/watch-pr.mjs');
const cleanupTemplate = readFileSync(resolve(root, 'adapters/pi/overrides/skills/poteto-mode/playbooks/worktree-cleanup.md.template'), 'utf8');
const babysitTemplate = readFileSync(resolve(root, 'adapters/pi/overrides/skills/poteto-mode/playbooks/babysit.md.template'), 'utf8');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};

function sandbox(t, label) {
  const dir = mkdtempSync(join(tmpdir(), `pstack-playbook-${label}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd, args, env = gitEnv) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env });
}

function commit(cwd, message) {
  const added = git(cwd, ['add', '-A']);
  assert.equal(added.status, 0, added.stderr);
  const result = git(cwd, ['commit', '-m', message]);
  assert.equal(result.status, 0, result.stderr);
}

/** Pull the commands out of the fenced `text` blocks that mention a script. */
function documentedCommands(template, needle) {
  return [...template.matchAll(/```text\n([\s\S]*?)```/g)]
    .map(match => match[1])
    .filter(block => block.includes(needle))
    .flatMap(block => block.split('\n').map(line => line.trim()).filter(Boolean));
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Replace the playbook's documented placeholders without rewriting the command. */
function materialize(command, { repo, base, pr }) {
  return command
    .replaceAll('"<package-root>"', shellQuote(root))
    .replaceAll('<package-root>', root)
    .replaceAll('"<repo-path>"', shellQuote(repo))
    .replaceAll('<repo-path>', shellQuote(repo))
    .replaceAll('<pr-base-ref>', base)
    .replaceAll('<number>', String(pr));
}

function runDocumented(command, env = {}) {
  return spawnSync('sh', ['-c', command], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function worktreeFixture(t) {
  const dir = sandbox(t, 'repo');
  const repo = join(dir, 'main');
  mkdirSync(repo);
  assert.equal(git(repo, ['init', '-b', 'main']).status, 0);
  writeFileSync(join(repo, 'work.txt'), 'base\n');
  commit(repo, 'main base');

  const merged = join(dir, 'merged');
  assert.equal(git(repo, ['worktree', 'add', '-b', 'feature/merged', merged, 'main']).status, 0);

  const dirty = join(dir, 'dirty');
  assert.equal(git(repo, ['worktree', 'add', '-b', 'feature/dirty', dirty]).status, 0);
  writeFileSync(join(dirty, 'feature.txt'), 'committed work\n');
  commit(dirty, 'feature work');
  writeFileSync(join(dirty, 'work.txt'), 'uncommitted edit\n');
  return { repo, merged, dirty };
}

function snapshot(repo, dirty) {
  return {
    status: git(repo, ['status', '--porcelain']).stdout,
    worktrees: git(repo, ['worktree', 'list', '--porcelain']).stdout,
    content: readFileSync(join(dirty, 'work.txt'), 'utf8'),
  };
}

/** A PATH-local gh that records calls and returns the current view fixture. */
function ghShim(dir) {
  const bin = join(dir, 'bin');
  const state = join(dir, 'state');
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  const path = join(bin, 'gh');
  writeFileSync(path, `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_STATE/calls"
cat "$GH_STATE/response.json"
`);
  chmodSync(path, 0o755);
  return { bin, state };
}

function prView(overrides = {}) {
  return {
    number: 2,
    url: 'https://github.com/example/repo/pull/2',
    title: 'Fixture pull request',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED',
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
    headRefOid: 'a'.repeat(40),
    headRefName: 'feat/fixture',
    baseRefName: 'main',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Live playbook check: `node --test scripts/playbook-script-invocation.test.mjs --live`
// Loads freshly generated playbooks into a real Pi session and records the bash
// tool calls the model emits. The capture-only bash tool never executes them.
// ---------------------------------------------------------------------------

function readOnlyCredentialStore(authPath) {
  let cache;
  const load = async () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(authPath, 'utf8'));
    } catch {
      cache = {};
    }
    return cache;
  };
  return {
    read: async providerId => (await load())[providerId],
    list: async () => Object.entries(await load()).map(([providerId, credential]) => ({ providerId, type: credential?.type ?? 'api_key' })),
    modify: async () => { throw new Error('Read-only credential store: refusing to mutate operator credentials'); },
    delete: async () => { throw new Error('Read-only credential store: refusing to mutate operator credentials'); },
  };
}

async function prepareGeneratedPackage() {
  const copyRoot = await mkdtemp(join(tmpdir(), 'pstack-playbook-live-'));
  try {
    const generatedRoot = join(copyRoot, 'package');
    await cp(root, generatedRoot, {
      recursive: true,
      filter(source) {
        const rel = relative(root, source);
        return rel === '' || !/^(node_modules|\.git|\.herdr)(\/|$)/.test(rel);
      },
    });
    // The live run must observe freshly generated playbooks, never stale
    // working-tree copies. Generation stays inside this temporary copy.
    await rm(join(generatedRoot, 'skills'), { recursive: true, force: true });
    await rm(join(generatedRoot, 'agents'), { recursive: true, force: true });
    try {
      await execFileAsync(process.execPath, ['scripts/generate-pi-resources.mjs'], {
        cwd: generatedRoot,
        env: { ...process.env, PI_CODING_AGENT_DIR: join(copyRoot, 'generator-agent') },
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(`Generator failed in temporary copy: ${String(error.stderr ?? error.message).slice(-2000)}`);
    }
    await readFile(join(generatedRoot, 'skills/poteto-mode/playbooks/worktree-cleanup.md'), 'utf8');
    await readFile(join(generatedRoot, 'skills/poteto-mode/playbooks/babysit.md'), 'utf8');
    return { copyRoot, generatedRoot };
  } catch (error) {
    await rm(copyRoot, { recursive: true, force: true });
    throw error;
  }
}

function createAuditFixture(dir) {
  const repo = join(dir, 'audit-target');
  mkdirSync(dir, { recursive: true });
  mkdirSync(repo);
  assert.equal(git(repo, ['init', '-b', 'main']).status, 0);
  writeFileSync(join(repo, 'work.txt'), 'base\n');
  commit(repo, 'main base');
  const merged = join(dir, 'audit-merged');
  assert.equal(git(repo, ['worktree', 'add', '-b', 'feature/merged', merged, 'main']).status, 0);
  const dirty = join(dir, 'audit-dirty');
  assert.equal(git(repo, ['worktree', 'add', '-b', 'feature/dirty', dirty]).status, 0);
  writeFileSync(join(dirty, 'feature.txt'), 'committed work\n');
  commit(dirty, 'feature work');
  writeFileSync(join(dirty, 'work.txt'), 'uncommitted edit\n');
  return { repo, merged, dirty };
}

async function closeSession(session) {
  if (!session) return;
  let timer;
  try {
    await Promise.race([
      session.extensionRunner?.emit({ type: 'session_shutdown', reason: 'quit' }) ?? Promise.resolve(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('session shutdown timed out')), 5000); }),
    ]);
  } catch {
    // A timed-out or failed shutdown must not skip dispose.
  } finally {
    clearTimeout(timer);
  }
  try {
    session.dispose();
  } catch {
    // Disposal is best-effort after the shutdown event.
  }
}

function parseLiveArgs(argv) {
  const value = flag => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    provider: value('--provider') ?? 'magpie',
    model: value('--model') ?? 'opendesign/deepseek-v4.1-flash',
    watchRepo: resolve(value('--watch-repo') ?? process.env.PSTACK_WATCH_REPO ?? '/tmp/pstack-032-watch-pr-check'),
    pr: Number(value('--pr') ?? 2),
    out: value('--out'),
    timeoutMs: Number(value('--timeout-ms')) || 120000,
    keep: argv.includes('--keep'),
  };
}

async function runLive(argv) {
  const options = parseLiveArgs(argv);
  assert(Number.isInteger(options.pr) && options.pr > 0, '--pr must be a positive integer');
  assert(existsSync(options.watchRepo), `--watch-repo does not exist: ${options.watchRepo}`);

  const pi = await import('@earendil-works/pi-coding-agent');
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime, getAgentDir } = pi;

  const realAgentDir = getAgentDir();
  const runtime = await ModelRuntime.create({
    credentials: readOnlyCredentialStore(resolve(realAgentDir, 'auth.json')),
    modelsPath: resolve(realAgentDir, 'models.json'),
    allowModelNetwork: false,
  });
  const model = runtime.getModel(options.provider, options.model);
  if (!model) {
    console.error(JSON.stringify({ status: 'failed', reason: 'Model not found', provider: options.provider, model: options.model }));
    process.exitCode = 2;
    return;
  }

  const generated = await prepareGeneratedPackage();
  const liveRoot = await mkdtemp(join(tmpdir(), 'pstack-playbook-session-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const settings = SettingsManager.inMemory({
    defaultProjectTrust: 'always',
    compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1024 },
    retry: { enabled: false },
  });
  let session;
  let result;

  try {
    const workspace = join(liveRoot, 'workspace');
    const agentDir = join(liveRoot, 'agent');
    await mkdir(workspace, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const audit = createAuditFixture(join(liveRoot, 'audit'));
    const cleanupPlaybook = join(generated.generatedRoot, 'skills/poteto-mode/playbooks/worktree-cleanup.md');
    const babysitPlaybook = join(generated.generatedRoot, 'skills/poteto-mode/playbooks/babysit.md');

    const loader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir,
      settingsManager: settings,
      noExtensions: true,
      additionalSkillPaths: [join(generated.generatedRoot, 'skills')],
      noContextFiles: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.ok(loader.getSkills().skills.some(skill => skill.filePath.startsWith(generated.generatedRoot)), 'generated skills must load');

    const captured = [];
    const executions = [];
    const captureTool = {
      name: 'bash',
      label: 'Bash (capture only)',
      description: 'Record a shell command for a read-only playbook check. The command is never executed.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to record.' },
          cwd: { type: 'string', description: 'Optional working directory for the command.' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      async execute(_toolCallId, params) {
        executions.push(params.command);
        return {
          content: [{ type: 'text', text: 'Recorded by the live harness; the command was not executed.' }],
          details: { command: params.command },
        };
      },
    };

    const manager = SessionManager.create(workspace, join(liveRoot, 'sessions'));
    ({ session } = await createAgentSession({
      cwd: workspace,
      agentDir,
      settingsManager: settings,
      modelRuntime: runtime,
      model,
      resourceLoader: loader,
      sessionManager: manager,
      tools: ['read', 'grep', 'find', 'ls', 'bash'],
      customTools: [captureTool],
      sessionStartEvent: { type: 'session_start', reason: 'startup' },
    }));
    const extensionErrors = [];
    await session.bindExtensions({ mode: 'rpc', onError: error => extensionErrors.push(String(error?.message ?? error)) });

    const attemptedReads = [];
    const successfulReads = [];
    const pendingReads = new Map();
    const texts = [];
    session.subscribe(event => {
      if (event.type === 'tool_execution_start') {
        if (event.toolName === 'read' && typeof event.args?.path === 'string') {
          attemptedReads.push(event.args.path);
          pendingReads.set(event.toolCallId, event.args.path);
        }
        if (event.toolName === 'bash' && typeof event.args?.command === 'string' && !captured.some(item => item.command === event.args.command)) {
          captured.push({ command: event.args.command, cwd: event.args.cwd ?? null, source: 'event' });
        }
      } else if (event.type === 'tool_execution_end' && event.toolName === 'read') {
        const path = pendingReads.get(event.toolCallId);
        pendingReads.delete(event.toolCallId);
        if (!event.isError && typeof path === 'string') successfulReads.push(path);
      } else if (event.type === 'message_end' && event.message?.role === 'assistant') {
        const content = event.message.content;
        if (typeof content === 'string') texts.push(content);
        else if (Array.isArray(content)) for (const block of content) if (block.type === 'text') texts.push(block.text);
      }
    });

    const prompt = [
      `Read the generated playbook at ${JSON.stringify(cleanupPlaybook)} and follow its "Audit invocation" section exactly.`,
      `Use the bash tool to issue exactly one read-only command that audits every worktree of ${JSON.stringify(audit.repo)} against base main.`,
      'Do not delete, remove, prune, checkout, or modify anything.',
      `Then read ${JSON.stringify(babysitPlaybook)} and follow its "Watcher invocation" section in check mode.`,
      `Use the bash tool to issue exactly one read-only snapshot command for PR ${options.pr} in ${JSON.stringify(options.watchRepo)}.`,
      'Do not push, comment, merge, retarget, or edit anything.',
      'The bash tool is capture-only: commands are recorded, not executed. Issue both tool calls, then reply with the commands you issued.',
    ].join('\n');

    let promptError;
    let timer;
    try {
      await Promise.race([
        session.prompt(prompt),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${options.timeoutMs}ms`)), options.timeoutMs); }),
      ]);
    } catch (error) {
      promptError = error;
      await session.abort().catch(() => {});
    } finally {
      clearTimeout(timer);
    }

    const normalized = path => path.replace(/\\/g, '/');
    const readCleanup = successfulReads.some(path => normalized(path) === normalized(cleanupPlaybook));
    const readBabysit = successfulReads.some(path => normalized(path) === normalized(babysitPlaybook));
    const commands = [...new Map(captured.map(item => [item.command, item])).values()];
    const worktreeCommand = commands.find(item => item.command.includes('worktree-audit.mjs'));
    const watchCommand = commands.find(item => item.command.includes('watch-pr.mjs'));
    const forbidden = commands.filter(item => /\b(worktree\s+remove|rm\s+-rf|pr\s+merge|git\s+push|--execute)\b/.test(item.command));
    const worktreeTargeted = Boolean(worktreeCommand) && (worktreeCommand.command.includes(audit.repo) || worktreeCommand.command.includes('audit-target'));
    const watchTargeted = Boolean(watchCommand)
      && watchCommand.command.includes('watch-pr.mjs')
      && (watchCommand.command.includes('--status-only') || watchCommand.command.includes('--green'))
      && new RegExp(`--pr\\s+${options.pr}(?:\\s|$)`).test(watchCommand.command);
    const passed = readCleanup && readBabysit && worktreeTargeted && watchTargeted && forbidden.length === 0 && executions.length >= 2 && !promptError;

    result = {
      status: passed ? 'passed' : 'failed',
      model: `${model.provider}/${model.id}`,
      generatedResources: 'fresh temporary copy from the current worktree',
      playbooksRead: { cleanup: readCleanup, babysit: readBabysit },
      commands,
      captureToolExecutions: executions.length,
      captureOnlyVerified: executions.length >= 2,
      worktreeTargeted,
      watchTargeted,
      forbiddenCommands: forbidden,
      attemptedReads: [...new Set(attemptedReads)],
      successfulReads: [...new Set(successfulReads)],
      reply: (texts.at(-1) ?? '').slice(0, 1000),
      promptError: promptError ? String(promptError?.message ?? promptError) : undefined,
      extensionErrors,
      limitation: 'This observes the model issuing the documented tool calls. The bash tool is capture-only, so the scripts do not execute and this is not a full workflow run; CLI execution is verified separately.',
    };
  } catch (error) {
    result = {
      status: 'failed',
      model: `${model.provider}/${model.id}`,
      generatedResources: 'fresh temporary copy from the current worktree',
      reason: String(error?.message ?? error),
    };
  } finally {
    await closeSession(session);
    if (!options.keep) {
      await rm(liveRoot, { recursive: true, force: true });
      await rm(generated.copyRoot, { recursive: true, force: true });
    }
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }

  const text = JSON.stringify(result, null, 2);
  if (options.out) await writeFile(options.out, `${text}\n`);
  else console.log(text);
  if (result.status !== 'passed') process.exitCode = 1;
}

if (LIVE) {
  await runLive(process.argv.slice(2));
} else {
test('worktree-cleanup documents an audit command that runs read-only on dirty and merged worktrees', t => {
  const { repo, merged, dirty } = worktreeFixture(t);
  const commands = documentedCommands(cleanupTemplate, 'worktree-audit.mjs');
  assert.equal(commands.length, 1, 'expected one documented worktree audit command');

  const before = snapshot(repo, dirty);
  const command = materialize(commands[0], { repo, base: 'main', pr: 0 });
  assert.match(command, /worktree-audit\.mjs/);
  assert.match(command, /--size/);
  assert.match(command, /-b main/);

  const result = runDocumented(command);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.base.ref, 'main');
  assert.equal(report.summary.total, 3);

  const rows = new Map(report.worktrees.map(item => [realpathSync(item.path), item]));
  assert.equal(rows.get(realpathSync(merged)).classification, 'merged');
  assert.equal(rows.get(realpathSync(merged)).bucket, 'safe-to-remove');
  assert.equal(rows.get(realpathSync(dirty)).classification, 'dirty');
  assert.equal(rows.get(realpathSync(dirty)).bucket, 'hold-wip');

  assert.deepEqual(snapshot(repo, dirty), before, 'the documented audit must not write, prune, or remove anything');

  // The shipped script has no execute/delete mode; a delete attempt is a usage error.
  const execute = spawnSync(process.execPath, [auditScript, '--execute', repo], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnv,
  });
  assert.equal(execute.status, 2);
  assert.equal(JSON.parse(execute.stdout).error.code, 'usage');
  assert.ok(cleanupTemplate.includes('no `--execute` flag'));
  assert.match(cleanupTemplate, /no delete mode/);
});

test('babysit documents one-shot status and green commands that invoke the shipped watcher', t => {
  const dir = sandbox(t, 'watch');
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  assert.equal(git(repo, ['init', '-b', 'main']).status, 0);
  const shim = ghShim(dir);
  const env = { PATH: `${shim.bin}:${process.env.PATH}`, GH_STATE: shim.state };

  const commands = documentedCommands(babysitTemplate, 'watch-pr.mjs');
  const statusCommand = commands.find(command => command.includes('--status-only'));
  const greenCommand = commands.find(command => command.includes('--green'));
  assert.ok(statusCommand, 'expected a documented --status-only command');
  assert.ok(greenCommand, 'expected a documented --green command');

  writeFileSync(join(shim.state, 'response.json'), `${JSON.stringify(prView())}\n`);
  const before = readdirSync(repo).sort();
  const status = runDocumented(materialize(statusCommand, { repo, base: 'main', pr: 2 }), env);
  assert.equal(status.status, 0, status.stderr);
  const snapshotJson = JSON.parse(status.stdout);
  assert.equal(snapshotJson.ok, true);
  assert.equal(snapshotJson.mode, 'status-only');
  assert.equal(snapshotJson.polls, 1);
  assert.equal(snapshotJson.pr.number, 2);
  assert.equal(snapshotJson.verdict, 'READY');
  assert.equal(snapshotJson.green, true);
  assert.equal(readFileSync(join(shim.state, 'calls'), 'utf8').trim().split('\n').length, 1);
  assert.deepEqual(readdirSync(repo).sort(), before, 'the watcher must not write into the repository');

  writeFileSync(join(shim.state, 'response.json'), `${JSON.stringify(prView({
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'FAILURE' }],
  }))}\n`);
  const green = runDocumented(materialize(greenCommand, { repo, base: 'main', pr: 2 }), env);
  assert.equal(green.status, 1);
  const blocked = JSON.parse(green.stdout);
  assert.equal(blocked.green, false);
  assert.equal(blocked.verdict, 'CHECKS_FAILED');

  assert.ok(babysitTemplate.includes('no `--execute` flag'));
  assert.match(babysitTemplate, /read-only/);
  assert.match(babysitTemplate, /explicit current-session authorization/);
});

test('both playbooks keep package-relative script paths and name the authorization gate', () => {
  assert.match(cleanupTemplate, /<package-root>\/scripts\/worktree-audit\.mjs/);
  assert.doesNotMatch(cleanupTemplate, /scripts\/worktree-audit\.sh/);
  assert.match(cleanupTemplate, /read-only/);
  assert.match(cleanupTemplate, /explicit grant/);
  assert.match(cleanupTemplate, /Keep every dirty worktree/);

  assert.match(babysitTemplate, /<package-root>\/scripts\/watch-pr\.mjs/);
  assert.doesNotMatch(babysitTemplate, /node scripts\/watch-pr\.mjs/);
  assert.match(babysitTemplate, /--status-only/);
  assert.match(babysitTemplate, /--green/);
  assert.match(babysitTemplate, /never pushes, comments, merges/);
});
}
