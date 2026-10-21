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

Use only the active Pi session branch or an operator-supplied transcript path. Match the opening request and branch metadata before reading. Do not scan unrelated sessions or workspaces. If no safe transcript path is available, pass a tight digest of the current conversation and state its limits. A digest is not a full transcript.

## 2. Spawn three reviewers in parallel

With delegation authorized, launch three read-only reviewers, using available configured review models and the distinct lenses below. If a connector is unavailable to a read-only reviewer, the parent can make an authorized read-only lookup and supply the evidence. Do not grant write tools to recover connector access. Otherwise apply these lenses sequentially and disclose self-review.

| Lens | Prompt template |
|---|---|
| Judgment | [judgment-reviewer.md](references/judgment-reviewer.md) |
| Tooling | [tooling-reviewer.md](references/tooling-reviewer.md) |
| Divergent | [divergent-reviewer.md](references/divergent-reviewer.md) |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `Task` response body.

## 3. Synthesize

Use a fresh read-only synthesizer when delegation is authorized, or synthesize locally with that limitation stated. Read [synthesizer.md](references/synthesizer.md), fill in every reviewer’s complete output, and spot-check citations using only available authorized read-only access. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Keep Backlog items local unless posting to a named tracker is explicitly authorized. Loading reflect never authorizes external messages or ticket writes.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edits use the manual Pi skill-authoring route in the [Pi adapter](../../adapters/pi/harness.md). Draft the smallest change, validate the SKILL.md against installed Pi docs, replay the motivating failure, and iterate.
- `tune description: <skill path>` means the existing skill failed to trigger. Test representative should-trigger and should-not-trigger requests against the proposed description before accepting it.
- `new skill via manual Pi authoring: <kebab-name>` is rare. Read installed Pi skills documentation, choose a discovered project-local path, write frontmatter and grounded instructions, and test discovery plus the real motivating task. Do not invent an unavailable authoring skill.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.

## Pi execution and authority

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires operator or applicable project authorization and an available pi-subagents integration. Otherwise perform the same stages sequentially and label the result self-review rather than independent review. Read the installed integration’s public instructions before launching. Use pstack.poteto-agent for isolated candidate writers and pstack.comment-sicko with its actual read-only allowlist for file reviewers. Keep one writer per directory. A source investigator may use only explicitly available read-only connectors; lack of connector access is a gap, never a reason to grant write tools.

Honor the operator’s configured roles and supported reasoning levels. Runtime-registered pstack agents bind their models through /setup-pstack: pstack.poteto-agent uses code, pstack.comment-sicko uses review, pstack.verifier uses verification, and pstack.prose-writer uses prose. This binding applies to direct calls and workflow children, including subagent({ workflow: "parallel", args: { tasks: [{ agent: "pstack.<agent>", task: "<brief>" }] } }). Do not put model in a task item or on the outer call; user subagents.agentOverrides may override the agent’s model and thinking. Do not invent per-skill configuration keys. Preserve model diversity where available; report when configured seats share a model. A rejected model stops that seat and is reported; never silently choose a fallback. Do not launch a child without authorization. Await native completion notices, not polling.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
