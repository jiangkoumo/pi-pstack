---
name: recall
description: "Reconstruct your recent working context from your own chat history, live state, and the shared record (user reports, prior fixes, incidents), then hand back a tight current-state brief. Use for 'recall my work on X', 'catch me up', 'what have I been working on', 'where did I leave off', before starting or resuming work."
disable-model-invocation: true
license: MIT
---

# Recall

**Before you start or resume work, you rebuild the user's recent working context and hand back a tight capsule of where things stand now and what to do next.**

Keep it tight and on-topic. Read only what the in-scope threads need, then stop.

Your context lives in two records. Your own chat history holds what you did and decided. The shared record holds everything that happened around the same code under other names: the symptoms users keep reporting, the fixes that shipped and got reverted, the errors still firing in prod. That second record is what the **why** skill searches, across source control, the issue tracker, chat and issue channels, long-form docs, and error tracking. A feature with a long bug tail keeps most of its story there, so don't reconstruct it from your transcripts alone.

Transcripts live at `$PI_CODING_AGENT_DIR/sessions/--<cwd-slug>--/<timestamp>_<uuid>.jsonl`, where `<cwd-slug>` is the workspace path with the leading slash dropped and each "/", "\", or ":" turned into "-" (so `/Users/you/proj` becomes `--Users-you-proj--`). Every line is one session entry; a `message` entry wraps one chat message. `PI_CODING_AGENT_SESSION_DIR` overrides the session root when the operator sets it.

1. Classify, then route. One specific prior chat to resume is the `session-pickup` playbook, not this. Turning habits into a durable skill is `automate-me`. A human-readable summary of your work is a different task. Recall loads working context across recent chats before you act. If the user already gave you a full state capsule (paths, branch, the change), use it and skip the mining.
2. Lock the scope before searching. Pin the window ("recent" is a real range, default the last 7 days), the topic if named, and the workspace (default the active one. Never read another project's transcripts without being asked). State the scope back. Never quietly turn "all" into "recent N".
3. Fan out across your chat history. Spawn parallel subagents on the configured verification role, each taking a slice of the corpus. Tell every subagent to order candidates by real modification time (`ls -t`) and never by UUID name, grep the topic first and then read only the matching chats and only their relevant regions, and skip the current chat plus obvious noise (subagent, eval, and test chats). Each returns the same schema, one block per chat: topic, the user's goal, decisions, open threads, struggles and corrections, and artifacts (PRs, tickets, branches), each citing the chat UUID. For one or two chats, skip the fan-out and search directly. The raw transcripts stay in the subagents. The main thread gets only their findings. Pick each subagent's thinking level for the job, per the Subagents section of the **poteto-mode** skill.
4. Sweep the shared record whenever the topic names a feature, file, subsystem, area, or bug. This is the default, not a judgment call, and "my work on X" does not exempt it. Hand it to the **why** skill's source investigators, but steer their question from "why was this built this way" to "what's the current state, what's been tried and didn't hold, and what are users still reporting". Reuse its per-source playbooks, run the investigators in parallel with the chat-history mining, and inherit its posture: one investigator per source, null results are findings, skip an unavailable MCP and say so. Fold what comes back into the brief. Skip this step only for pure activity recall with no named target ("what did I do this week"), where your own history and live state are the entire answer.
5. Verify against live state. Take the PRs, branches, and tickets that the mining and the sweep surfaced and check them with `git` and `gh`. When the answer hinges on what an agent actually did (the tools it ran, files it read, errors it hit), read the full transcript, not just a trimmed local copy.
6. Write the brief to the contract below. Group by thread. Stay on the named topic.

## Output contract

Lead with the capsule, then the thread status, then the problems, then the next move. Deeper detail goes below or gets cut.

- **Capsule.** At most 5 bullets. What this work is and where it stands overall.
- **Threads.** One line each, prefixed with exactly one status tag: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, or `[planned, not started]`. A thread with no tag is not done yet, so tag it.
- **Problems.** At most 5, the recurring ones. Include the symptoms users keep reporting and any fix that shipped and was reverted, so the next attempt starts where the last one failed.
- **Next move.** The single most useful next action, concrete.

An adjacent feature or ticket stays out unless it blocks this one. When the capsule and thread lines outgrow a screen, cut detail before you cut threads. Write the brief through the **unslop** skill, cite chat findings by UUID and shared-record findings by their source (PR #, ticket ID, chat permalink, error-tracker issue), and sanitize private context before any public output.

**Reply:** the brief, to the contract above.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream instructions with the Cursor transcript path and tool names replaced. These notes govern platform and authorization differences.

Read the [Pi adapter](../../adapters/pi/harness.md) and [Poteto mode for Pi](../poteto-mode/SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand.

**Session scope.** Pi stores each workspace's sessions under `$PI_CODING_AGENT_DIR/sessions/--<cwd-slug>--/` (default `~/.pi/agent/sessions/`; `PI_CODING_AGENT_SESSION_DIR` overrides the root). Compute the slug from the active working directory: drop the leading `/` or `\`, replace `/`, `\`, and `:` with `-`, and wrap the result in `--`. Use only that directory. Do not list or grep `sessions/*`, and never read another workspace's directory; that is the Pi equivalent of the cross-project scan this skill forbids. Exclude the live session with `$PI_SESSION_FILE`.

**Ordering and reading.** List session files with `ls -t` and take the modification time from the filesystem, never from the UUID or timestamp prefix. Grep the topic first, then open only matching sessions and only the relevant regions with `read`, `grep`, or `ffgrep`. Sessions are append-only JSONL trees: read the `session` header for `cwd`, `id`, and `parentSession`, follow `id`/`parentId` for the active branch, and read `compaction` or `branch_summary` entries when present. `PI_CODING_AGENT_SESSION_DIR` and a `--session-dir` launch both change the location; confirm the root before claiming no history exists.

**Delegation.** Spawn mining subagents with pi-subagents and the configured `verification` role (`pstack.verifier`), omitting `model`; never put a model on the outer call or a task item. If pi-subagents is unavailable or delegation is forbidden, mine sequentially in this session and label the result self-review. Keep raw transcripts in the children and return only the per-chat blocks.

**Shared record.** The ported **why** skill owns source investigation. Query only connectors that are actually configured. A missing MCP, issue tracker, or error source is a reported gap and a null result for that source, never a reason to invent evidence or broaden scope to another workspace.

**Live state and output.** Verify PRs, branches, tickets, and diffs with `git` and `gh` before repeating a claim from a transcript. Cite a chat by the session UUID from its filename and shared-record findings by their source. Write the brief through `/skill:unslop`. Sanitize private context before any public output.

**Read-only.** This skill writes no files and sends no messages. Do not commit, push, or mutate the repository to answer a recall request.
