---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
license: MIT
---

# Swarm

Fan out independent workers over a coverage matrix, drain their results, and return one report. Parallelism changes throughput, not authority.

1. Define the coverage matrix before spawning: the units, the boundaries between them, and the evidence each must return. If the work is one unit, use a single agent; a one-item swarm is ceremony.
2. Pick workers from the configured pstack `code` or `verification` roles, or the parent model. Do not use Cursor slug defaults, `.cursor` rule files, `environment: "cloud"`, `cloud_base_branch`, or `run_in_background` fields. Local managed worktrees are the only isolation; there is no cloud execution.
3. Give each worker a tight brief: objective, allowed paths, exclusive worktree, acceptance command, forbidden actions, and report shape. One writer per worktree; never two workers in one directory. Keep the parent's checkout clean.
4. Spawn only when delegation is authorized. Workers run asynchronously when the host supports it, and the parent collects native completion notices rather than polling. If a worker fails, times out, or is stopped, record the terminal state and replace it with a fresh brief rather than resuming blindly.
5. Drain results as they arrive. Verify claims against the artifact and the acceptance command; a worker's summary is a proposal. Deduplicate findings, reject out-of-scope changes, and keep raw payloads out of the main thread.
6. Do not commit, push, open a PR, merge, or clean up worktrees from the swarm. Applying an accepted patch goes through the normal review gate and separate authorization. Stop at the budget or when the coverage matrix is satisfied.

Report the matrix, workers and run ids, completed versus failed units, verified evidence, what was rejected, and the remaining gaps.
