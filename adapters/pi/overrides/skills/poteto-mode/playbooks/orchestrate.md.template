# Orchestrate

Adapted from pstack by Lauren Tan. This workflow coordinates a standing program of many units; it does not grant cloud execution, automatic merges, or unbounded spending.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. If one agent can finish inside the operator's budget, stop here and use Autonomous run instead.

1. Frame the done predicate as something countable and set a wall-clock and spend budget. Decompose into tracks, units, and dependencies. Put the plan, standing orders, unit table, and decision log in a local store under `<run-id>/orchestrate/` in the pstack run directory provided in the system prompt; one writer per file.
2. Use local managed worktrees for workers. There is no Cursor cloud environment and no cloud base branch. One writer per worktree or branch; the root does not write a worker's files.
3. Spawn a rolling window of workers and verifiers only with delegation authorization. Each brief names goal, scope, exclusive worktree, acceptance command, forbidden actions, timebox, and report shape. A verifier runs on a different model family when one is configured.
4. Drain completions at bounded points, record each unit's terminal state, and respawn a stuck unit with a fresh consolidated brief rather than resuming blindly. Cap in-flight children and stop spawning when the budget is nearly spent.
5. Verify before landing. A worker's report is a proposal; a verifier or the root checks the artifact and the acceptance command. Landing and PR operations require explicit authorization, one unit at a time, with one writer on the chain.
6. Use a bounded audit loop if needed: `/loop run --max-turns <n> --until "<no-active-units predicate>" "<goal>"`. Do not use an unbounded hourly loop; on a hold, send a zero-writes order and stop.
7. Close by reconciling every spawned child to a terminal state, confirming the predicate on the real artifact, and leaving the local store as the postmortem. Do not auto-merge, force-push shared branches, close PRs, or delete user state.

Report the predicate and count against it, tracks and what landed, the frontier and SHAs, verdicts, abandoned units with reasons, operator gates, and the store path.
