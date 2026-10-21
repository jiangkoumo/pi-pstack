---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
license: MIT
---

# Swarm

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
4. Pick the worker role from the `verification` role line in `/setup-pstack`. If the role or that line is missing, use its default and say so. For an `inherit` role, omit `model` so the workers run on the parent model. If the host rejects a configured model, use the default and say so. If it rejects the default, use the closest valid configured model of the same family from the available catalog. For a model race, name each arm's model up front. Pick each subagent's thinking for the job, per the Subagents section of the **poteto-mode** skill.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message with the `subagent` tool, one parallel workflow, `worktree: true` for writers that need their own branch, and the step 4 role. Use a separate isolated workspace only when the worker needs access to something in the shared checkout.

When a worker must start from a non-default pushed branch, name that branch and its exact SHA in the brief and prepare the authorized workspace before launch.

```js
subagent({
  workflow: "parallel",
  args: { tasks: [
    { agent: "pstack.poteto-agent", task: "<standalone brief for slice or race arm>" }
  ] }
})
```

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires current operator or applicable project authorization and a compatible pi-subagents integration. If unavailable or unauthorized, perform authorized stages locally, disclose self-review and missing independence, and report any required independent stage as open. Use only registered pstack.* agents. Models and thinking bind through /setup-pstack roles and user agentOverrides; never put model in a task item or on the outer subagent call. Report unavailable or identical configured models; do not silently substitute. Await native completion notices and collect every required result before synthesis.

Use read for file contents, grep/find/ls for search and directories, and ffgrep/fffind when available. Batch independent reads with codemode when available. Use edit/write only for authorized changes; bash executes programs and Git in an explicit working directory, never reads or searches files. Keep one writer per worktree and isolate candidate output paths. Read-only reviewers never receive bash, edit, write, or nested delegation. Loading this skill grants no new permission: push, PR creation, merge, external messages, and destructive operations require explicit authorization in the current session. Commit only when authorized.

Cursor cloud placement and cloud base-branch fields are unavailable in Pi. Give each writer its own local worktree or artifact path, and its own starting branch and SHA in the brief. Keep one writer per worktree. A read-only verification or exploration role never receives write tools.

### Worktree review schema

Put `cwd` on the outer `subagent` call, never inside a `tasks` item. The `parallel` schema accepts `{ agent, task }` only; an extra field fails validation before any child starts. For several worktrees in one call, name each absolute worktree path in its `task` text.

```js
subagent({ workflow: "parallel", args: { tasks: [
  { agent: "pstack.verifier", task: "Review /absolute/path/to/worktree-a at SHA <sha>. Report PASS or ISSUES." },
  { agent: "pstack.verifier", task: "Review /absolute/path/to/worktree-b at SHA <sha>. Report PASS or ISSUES." }
] } })
```

Wrong: `tasks: [{ agent, cwd, task }]`. The host rejects it.
