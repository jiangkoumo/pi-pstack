---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Adversaries try to break a change or design, and only findings proven by a run survive."
disable-model-invocation: true
license: MIT
---

# Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent with the [in-your-own-words](../in-your-own-words/SKILL.md) skill, from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Run Phase A steps 3 and 4 and Phase B of the [arena](../arena/SKILL.md) skill, with four changes. Read the configured review/adversary roles in `pstack.json` via `/setup-pstack` (`code` and `strongest` writer seats, mapped from your configured review models) in place of `arena runners`. Copy the scope's uncommitted changes into each worktree. Spawn each adversary as a writable worktree subagent (`pstack.poteto-agent` or `pstack.strongest-agent` with `worktree: true`, never a read-only seat). In place of the arena task and rationale, give each adversary the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

## Verify

Verify each finding per arena Phase F by rerunning its command. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip arena Phases C, D, and E. Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list.

## Output

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.36, MIT, fixed revision c742dd61706fbacc1b95f1a20b7b988cf096ce6c. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires current operator or applicable project authorization and a compatible pi-subagents integration. If unavailable or unauthorized, perform authorized stages locally, disclose self-review and missing independence, and report any required independent stage as open. Use only registered pstack.* agents. Models and thinking bind through /setup-pstack roles and user agentOverrides; never put model in a task item or on the outer subagent call. Report unavailable or identical configured models; do not silently substitute. Await native completion notices and collect every required result before synthesis.

Use read for file contents, grep/find/ls for search and directories, and ffgrep/fffind when available. Batch independent reads with codemode when available. Use edit/write only for authorized changes; bash executes programs and Git in an explicit working directory, never reads or searches files. Keep one writer per worktree and isolate candidate output paths. Read-only reviewers never receive bash, edit, write, or nested delegation. Loading this skill grants no new permission: push, PR creation, merge, external messages, and destructive operations require explicit authorization in the current session. Commit only when authorized.

### Role mapping and writable adversary seats

In Pi, `/setup-pstack` stores role preferences in `~/.pi/agent/pstack.json` or trusted `.pi/pstack.json`, and `ROLE_AGENTS` binds each role to a registered `pstack.*` agent. Adversaries in `interrogate` must write failing tests, repro scripts, or prototypes and run commands in their own worktrees (`tools: read, edit, write, grep, find, ls, bash`), so they cannot use read-only seats (`pstack.comment-sicko` on `review`, `pstack.judgment-agent` on `judgment`, or `pstack.verifier` on `verification`). Spawn each adversary with a writable pstack role agent in its own worktree—by default `pstack.poteto-agent` (`code` role) and `pstack.strongest-agent` (`strongest` role), plus any additional configured writer seats (`pstack.bug-fix-agent` on `bug-fix`, `pstack.perf-agent` on `perf`, `pstack.hillclimb-agent` on `hillclimb`). If the user configured their preferred adversarial review models under `review` or `judgment` in `pstack.json`, bind those models to the writable adversary seats via `/setup-pstack` or `subagents.agentOverrides` before fanning out.

```js
subagent({
  workflow: "parallel",
  worktree: true,
  args: { tasks: [
    { agent: "pstack.poteto-agent", task: "<scope, intent, uncommitted-changes patch path, and interrogate adversary brief>" },
    { agent: "pstack.strongest-agent", task: "<scope, intent, uncommitted-changes patch path, and interrogate adversary brief>" }
  ] }
})
```

### Copying uncommitted changes into each worktree

Managed worktrees (`worktree: true`) check out `HEAD` and do not include uncommitted staged, unstaged, or untracked changes from the parent working tree. When the scope includes uncommitted changes:

1. Before launching adversaries, capture tracked working-tree changes from the parent checkout into a patch file under the run directory (`git -C <cwd> diff HEAD --binary > <run-dir>/scope-uncommitted.patch`) and list any untracked files in scope (`git -C <cwd> ls-files --others --exclude-standard -- <scope>`).
2. If you prepare dedicated git worktrees before launch, apply the patch (`git -C <worktree> apply --binary <run-dir>/scope-uncommitted.patch`) and copy any untracked scoped files into each worktree before spawning.
3. If `subagent({ workflow: "parallel", worktree: true, ... })` creates the managed worktrees at launch, pass the absolute path `<run-dir>/scope-uncommitted.patch` and any untracked scoped file paths in each adversary's brief so the adversary applies `git apply --binary <run-dir>/scope-uncommitted.patch` and copies those untracked files into its own worktree before running repros.

### Verifying findings and worktree schema

The lead verifies each reported finding per arena Phase F by rerunning the adversary's exact command in the adversary's worktree or an isolated verification checkout, without applying fixes to the parent working tree. Put `cwd` on the outer `subagent` call, never inside `args.tasks` items (`{ agent, task }` only).
