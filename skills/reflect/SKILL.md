---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
license: MIT
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's transcript in the Pi session path the system prompt names. Do not glob across unrelated project sessions or `~/.cursor/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects.

Read the active session file with `read`. When the host stores JSONL sessions in that shape, that covers the legacy flat (`<id>.jsonl`), current nested (`<id>/<id>.jsonl`), and subagent (`<parent>/subagents/<child>.jsonl`) layouts. For each candidate, read the first JSONL line. Take the file whose first entry contains the conversation's opening user prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three `subagent` calls in one parallel workflow, agent mode (`readonly: true`), one registered pstack agent each. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references, and readonly strips MCPs, so the lead passes that evidence inline when those tools are unavailable.

Each reviewer and the synthesizer name a role line in `/setup-pstack` and a default. Set `model` to that line's value, or to the default if the rule or the line is missing. Leave `model` unset when the value is `inherit`, so that seat runs on the parent model. If the host rejects a configured model slug, use the default and say so. If it rejects the default, use the closest valid configured model slug of the same family from its error message. Never treat an alias entry as a rejected model or apply either fallback to it. Pick each subagent's thinking for the job, per the Subagents section of the **poteto-mode** skill.

| Lens | Role line | Prompt template |
|---|---|---|
| Judgment | `judgment` | [judgment-reviewer.md](references/judgment-reviewer.md) |
| Tooling | `verification` | [tooling-reviewer.md](references/tooling-reviewer.md) |
| Divergent | `strongest` | [divergent-reviewer.md](references/divergent-reviewer.md) |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `subagent` response body.

## 3. Synthesize

One `subagent` call, `subagent_type` read-only, `model` from the `judgment` role line, agent mode (`readonly: true`). It spot-verifies citations through MCP where available, and readonly strips MCPs. Pass [synthesizer.md](references/synthesizer.md) verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to the Pi authoring-a-skill playbook and run its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to the Pi authoring-a-skill playbook and run its description-optimization loop.
- `new skill via create-skill: <kebab-name>`: hand creation to the Pi authoring-a-skill playbook. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires current operator or applicable project authorization and a compatible pi-subagents integration. If unavailable or unauthorized, perform authorized stages locally, disclose self-review and missing independence, and report any required independent stage as open. Use only registered pstack.* agents. Models and thinking bind through /setup-pstack roles and user agentOverrides; never put model in a task item or on the outer subagent call. Report unavailable or identical configured models; do not silently substitute. Await native completion notices and collect every required result before synthesis.

Use read for file contents, grep/find/ls for search and directories, and ffgrep/fffind when available. Batch independent reads with codemode when available. Use edit/write only for authorized changes; bash executes programs and Git in an explicit working directory, never reads or searches files. Keep one writer per worktree and isolate candidate output paths. Read-only reviewers never receive bash, edit, write, or nested delegation. Loading this skill grants no new permission: push, PR creation, merge, external messages, and destructive operations require explicit authorization in the current session. Commit only when authorized.

Launch the three readers in one call, and keep `cwd` on the outer call when they must share a directory:

```js
subagent({ workflow: "parallel", args: { tasks: [
  { agent: "pstack.judgment-agent", task: "<references/judgment-reviewer.md with transcript or digest>" },
  { agent: "pstack.verifier", task: "<references/tooling-reviewer.md with transcript or digest>" },
  { agent: "pstack.strongest-agent", task: "<references/divergent-reviewer.md with transcript or digest>" }
] } })
```

Backlog filing is an external write. Prepare the backlog items locally and file only with explicit current-session authorization. Read-only synthesis returns proposed edits; the parent applies only the explicitly approved subset. Reviewing a worktree uses the outer `subagent` `cwd`, or an absolute path in the task text; `cwd` inside a task item is rejected.
