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
3. Pick the runners. Use the `/setup-pstack` roles: `code` (`pstack.poteto-agent`) for implementation candidates, `prose` (`pstack.prose-writer`) for prose artifacts, and `judgment` or `strongest` for design candidates returned as reports. If the role or that line is missing, inherit the parent model and say so. An `inherit` or unset role means the parent model, so omit `model` for it. If the host rejects a configured model, run that seat on its configured default and say so. If it rejects the default, use the closest valid configured model of the same family and reasoning tier, and report the substitution. Spawn more runners when the arena covers multiple design directions. Use the same model N times when the work is generation-bound rather than judgment-sensitive. Pick each subagent's thinking for the job, per the Subagents section of the **poteto-mode** skill.
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

After all Phase B candidates complete, choose one configured model from the `judgment` or `strongest` role in `/setup-pstack`. Prefer a different model family from the parent's. If the role is unset, inherit the parent model and say so. Spawn one read-only judge subagent with that role. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

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
