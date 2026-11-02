---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
license: MIT
---

# Arena

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners. Use the `/setup-pstack` roles in `pstack.json`: `code` (`pstack.poteto-agent`) and `strongest` (`pstack.strongest-agent`) for implementation candidates, `prose` (`pstack.prose-writer`) for prose artifacts, and `judgment` (`pstack.judgment-agent`) or `strongest` (`pstack.strongest-agent`) for design candidates returned as reports. If the role or that line is missing, default to one each on the configured `judgment` and `code` (or `strongest`) roles, or inherit the parent model and say so. An `inherit`, `auto`, or `inherit-parent` entry in this line means the parent model, so omit `model` for it. If the host rejects a configured entry, run that seat on its family's configured default and say so. Families go by provider or model prefix (such as `anthropic/*` / `claude-*`, `openai/*` / `gpt-*`, `google/*` / `gemini-*`, and `xai/*`). If the family has no default, or the host rejects that default, use the closest valid slug of the same family from its error message, or drop the seat and say so when there is none. If dropped seats leave fewer than two runners, add runners until there are two, or one when the line has one entry. Run each added runner on a remaining runner's model, or omit `model` so it runs on the parent model when none remain, and say so. Spawn more runners when the arena covers multiple design directions. Use the same model N times when the work is generation-bound rather than judgment-sensitive. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section of the **poteto-mode** skill.
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

## Phase B: Fan out

Spawn all N subagents in one message with one `subagent` parallel call, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.

```js
subagent({
  workflow: "parallel",
  worktree: true,
  args: { tasks: [
    { agent: "pstack.poteto-agent", task: "<same task, shared grounding path, own output path, artifact and rationale>" }
  ] }
})
```

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, choose one configured model from the cross-judge role pool (`judgment`, `strongest`, `review`) in `/setup-pstack` (`pstack.json`). If the configuration or that line is missing, choose from the default pool of `judgment` (`pstack.judgment-agent`) and `review` (`pstack.comment-sicko`). Spawn one readonly judge subagent. The judge is never from the parent's family, as Phase A step 3 defines families. Try only the entries from another family, in pool order. An `inherit`, `auto`, or `inherit-parent` entry is the parent model, so it never judges. With the default pool, a Claude parent gets the non-Claude default role entry first. A parent from any other family gets the Claude default role entry first. If the host rejects an entry, use a valid slug of the same model at the closest level or speed from the error message, or move to the next entry when there is none. If no entry from another family runs, try the default pool's entries from another family the same way. If none of those runs, skip the judge, pick the base alone in Phase D, and say so. If you do not know the parent's model, try the pool's real slugs in pool order and say that the family check did not run. The judge sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.36, MIT, fixed revision c742dd61706fbacc1b95f1a20b7b988cf096ce6c. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires current operator or applicable project authorization and a compatible pi-subagents integration. If unavailable or unauthorized, perform authorized stages locally, disclose self-review and missing independence, and report any required independent stage as open. Use only registered pstack.* agents. Models and thinking bind through /setup-pstack roles and user agentOverrides; never put model in a task item or on the outer subagent call. Report unavailable or identical configured models; do not silently substitute. Await native completion notices and collect every required result before synthesis.

Use read for file contents, grep/find/ls for search and directories, and ffgrep/fffind when available. Batch independent reads with codemode when available. Use edit/write only for authorized changes; bash executes programs and Git in an explicit working directory, never reads or searches files. Keep one writer per worktree and isolate candidate output paths. Read-only reviewers never receive bash, edit, write, or nested delegation. Loading this skill grants no new permission: push, PR creation, merge, external messages, and destructive operations require explicit authorization in the current session. Commit only when authorized.

### Reviewing independent worktrees

The public parallel schema accepts `{ agent, task }` items only. It has no per-task `cwd`, and an extra field such as `cwd` inside a `tasks` item is rejected by the schema. Put `cwd` on the outer `subagent` call when the host contract supports it and one call reviews one worktree, or write the absolute worktree path into each `task` text. Never put `cwd` in the `tasks` array.

Correct, one outer `cwd` for one worktree:

```js
subagent({ cwd: "/absolute/path/to/worktree-a", workflow: "parallel", args: { tasks: [
  { agent: "pstack.judgment-agent", task: "Review the diff in this worktree against the rubric." }
] } })
```

Correct, several worktrees in one call, with the absolute path in each task:

```js
subagent({ workflow: "parallel", args: { tasks: [
  { agent: "pstack.judgment-agent", task: "Review /absolute/path/to/worktree-a against the rubric." },
  { agent: "pstack.judgment-agent", task: "Review /absolute/path/to/worktree-b against the rubric." }
] } })
```

Wrong, rejected by the schema:

```js
// subagent({ workflow: "parallel", args: { tasks: [{ agent: "pstack.judgment-agent", cwd: "/absolute/path/to/worktree-a", task: "Review." }] } })
```

Candidates in Phase B write, so give each candidate a distinct `worktree: true` child or a prepared exclusive worktree path named in its task. Review-only seats stay read-only and never receive the candidate's write tools.
