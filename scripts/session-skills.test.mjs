import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  listSubagentTranscripts,
  listWorkspaceSessions,
  readSessionHeader,
  readSessionName,
  resolveSessionRoot,
  workspaceSessionDir,
  workspaceSlug,
} from './session-context.mjs';
import { validateSkillDirectory } from './skill-authoring.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pstack-sessions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function sessionFile(dir, name, { cwd, mtime, sessionName } = {}) {
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  const header = { type: 'session', version: 3, id: name.split('_')[1].replace(/\.jsonl$/, ''), timestamp: '2026-01-01T00:00:00.000Z', cwd };
  const lines = [JSON.stringify(header), JSON.stringify({ type: 'message', id: 'a1', parentId: null, timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'user', content: 'fixture', timestamp: 1 } })];
  if (sessionName) lines.push(JSON.stringify({ type: 'session_info', id: 'a2', parentId: 'a1', timestamp: '2026-01-01T00:00:02.000Z', name: sessionName }));
  await writeFile(path, lines.join('\n') + '\n');
  if (mtime) await utimes(path, mtime, mtime);
  return path;
}

test('workspace slug follows Pi session directory encoding', () => {
  assert.equal(workspaceSlug('/Users/you/proj'), '--Users-you-proj--');
  assert.equal(workspaceSlug('/Users/you/proj:cache'), '--Users-you-proj-cache--');
  assert.equal(workspaceSlug('/tmp/a\\b'), '--tmp-a-b--');
});

test('session root honors the Pi session and agent directory overrides', () => {
  assert.equal(resolveSessionRoot({ HOME: '/home/u' }), resolve('/home/u/.pi/agent/sessions'));
  assert.equal(resolveSessionRoot({ HOME: '/home/u', PI_CODING_AGENT_DIR: '/srv/pi' }), resolve('/srv/pi/sessions'));
  assert.equal(resolveSessionRoot({ HOME: '/home/u', PI_CODING_AGENT_DIR: '/srv/pi', PI_CODING_AGENT_SESSION_DIR: '/var/sessions' }), resolve('/var/sessions'));
});

test('lists only current-cwd sessions, newest first, excluding the current session', async t => {
  const root = await fixture(t);
  const cwd = '/fixture/work/current';
  const dir = workspaceSessionDir(cwd, { root });
  const older = await sessionFile(dir, '2026-01-01T00-00-00-000Z_11111111-1111-1111-1111-111111111111.jsonl', { cwd, mtime: new Date('2026-01-01T00:00:00Z'), sessionName: 'older thread' });
  const newer = await sessionFile(dir, '2026-01-02T00-00-00-000Z_22222222-2222-2222-2222-222222222222.jsonl', { cwd, mtime: new Date('2026-01-02T00:00:00Z') });
  await sessionFile(join(root, workspaceSlug('/fixture/work/other')), '2026-01-03T00-00-00-000Z_33333333-3333-3333-3333-333333333333.jsonl', { cwd: '/fixture/work/other', mtime: new Date('2026-01-03T00:00:00Z') });
  await writeFile(join(dir, 'notes.txt'), 'not a session');

  const all = await listWorkspaceSessions(cwd, { root });
  assert.deepEqual(all.map(session => session.path), [newer, older]);
  assert.equal(all[0].id, '22222222-2222-2222-2222-222222222222');

  const excludingCurrent = await listWorkspaceSessions(cwd, { root, exclude: [newer] });
  assert.deepEqual(excludingCurrent.map(session => session.path), [older]);

  const header = await readSessionHeader(newer);
  assert.equal(header.cwd, cwd);
  assert.equal(await readSessionName(older), 'older thread');
  assert.equal(await readSessionName(newer), null);
});

test('listing sessions is read-only and never creates a missing workspace directory', async t => {
  const root = await fixture(t);
  const cwd = '/fixture/work/missing';
  const dir = workspaceSessionDir(cwd, { root });
  assert.deepEqual(await listWorkspaceSessions(cwd, { root }), []);
  await assert.rejects(stat(dir), { code: 'ENOENT' });

  const existing = await sessionFile(dir, '2026-01-01T00-00-00-000Z_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl', { cwd });
  const before = await readdir(dir);
  const beforeMtime = (await stat(existing)).mtimeMs;
  await listWorkspaceSessions(cwd, { root });
  assert.deepEqual(await readdir(dir), before);
  assert.equal((await stat(existing)).mtimeMs, beforeMtime);
});

test('lists subagent transcripts for the current workspace only, newest first', async t => {
  const root = await fixture(t);
  const cwd = '/fixture/work/current';
  const artifacts = join(workspaceSessionDir(cwd, { root }), 'subagent-artifacts');
  await mkdir(artifacts, { recursive: true });
  const first = join(artifacts, '01fc543f-e287-4a25-b226-77aa36ca28dd_reviewer_transcript.jsonl');
  const second = join(artifacts, '02fc543f-e287-4a25-b226-77aa36ca28dd_worker_transcript.jsonl');
  await writeFile(first, '{}\n');
  await writeFile(second, '{}\n');
  await utimes(first, new Date('2026-02-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));
  await utimes(second, new Date('2026-02-02T00:00:00Z'), new Date('2026-02-02T00:00:00Z'));
  await writeFile(join(artifacts, '01fc543f-e287-4a25-b226-77aa36ca28dd_reviewer_meta.json'), '{}');

  const other = join(root, workspaceSlug('/fixture/work/other'), 'subagent-artifacts');
  await mkdir(other, { recursive: true });
  await writeFile(join(other, '03fc543f-e287-4a25-b226-77aa36ca28dd_worker_transcript.jsonl'), '{}\n');

  const transcripts = await listSubagentTranscripts(cwd, { root });
  assert.deepEqual(transcripts.map(item => item.path), [second, first]);
  assert.deepEqual(transcripts.map(item => item.agent), ['worker', 'reviewer']);
});

test('authoring validation accepts a portable skill and rejects broken structure', async t => {
  const parent = await fixture(t);
  const good = join(parent, 'my-skill');
  await mkdir(join(good, 'references'), { recursive: true });
  await writeFile(join(good, 'references', 'notes.md'), '# Notes\n');
  await writeFile(join(good, 'SKILL.md'), '---\nname: my-skill\ndescription: Use for fixture work.\nlicense: MIT\n---\n\nRead [notes](references/notes.md).\n');
  const accepted = await validateSkillDirectory(good);
  assert.equal(accepted.ok, true, accepted.errors.join('\n'));
  assert.equal(accepted.name, 'my-skill');
  assert.equal(accepted.links.length, 1);

  const bad = join(parent, 'wrong-name');
  await mkdir(bad, { recursive: true });
  await writeFile(join(bad, 'SKILL.md'), '---\nname: broken-skill\ndescription: Use for broken fixtures.\n---\n\nRead [missing](references/missing.md) and [escape](../outside.md).\n');
  const rejected = await validateSkillDirectory(bad);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join('\n'), /Directory name wrong-name differs from skill name broken-skill/);
  assert.match(rejected.errors.join('\n'), /Broken skill link: references\/missing\.md/);
  assert.match(rejected.errors.join('\n'), /Broken skill link: \.\.\/outside\.md/);

  const missing = await validateSkillDirectory(join(parent, 'absent'));
  assert.equal(missing.ok, false);
  assert.match(missing.errors[0], /Missing SKILL\.md/);
});
