# Orchestrate

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Fixed source `f713f14203cd6420cec13cd7c55c32d598dbab68`; original license is retained in `LICENSES/pstack.txt`. This adaptation preserves briefs, rolling windows, drain discipline, frontier generations and exact-head verification. Cursor cloud execution and Bun `orch` are not provided as Pi commands.

**Own the program through its briefs, frontier and evidence.** A standing coordinator frames, scopes, drains and decides; code belongs to a designated writer. Work one owner can finish in the session belongs in Autonomous run. Scale ceremony to the unit: a cheap one-command unit needs a concise brief and receipt, not a hierarchy.

Read [Poteto mode for Pi](../SKILL.md), [the plan schema](../../../docs/templates/pstack-plan.md) and [the PR template](../../../docs/templates/pstack-pr.md). Resolve the docs links from this playbook's installed directory. The checker is `scripts/check-plan.mjs` at the package root, three parents above this directory.

## Roles and capability contract

The coordinator owns state and human reports. A worker owns one exclusive worktree and allowed file set. A verifier inspects the artifact and receipts; for expensive, judgment-heavy or high-impact work use an independent model family if available and authorized. For a cheap deterministic command, the worker runs it and the coordinator spot-checks the evidence. A track sub-coordinator is useful only when a single drain cannot handle the program; keep depth at coordinator, track, worker and use a bounded rolling window rather than blocking waves.

Single-owner execution is the default. Before any authorized delegation verify the optional subagent tooling, namespaced agent discovery, actual public API and exact configured model availability. The configuration contract is `code` for writers and `review` for reviewers, explicit `provider/id`, one writer per worktree, read-only reviewer tools and no silent fallback. Multi-role workflow wiring may be pending; do not claim saving role preferences routes arbitrary parallel workflows. Record this dependency and let the operator wire/verify the runtime before fan-out. Without it, run the same scoped units serially. Nested delegation requires its own authorization.

## Plain-file store replacing orch

Create `<run-id>/orchestrate/` in the pstack run directory provided in the system prompt, using Pi file tools. The coordinator is the sole state writer; children return reports, and the coordinator records completion pointers. Keep the store after the run. If the system prompt provides no run directory, resolve a concrete destination before writing. Never hard-code a home-directory path.

| File | Required contents and ownership |
| --- | --- |
| `preferences.md` | Numbered standing orders, model policy, budgets, forbidden paths, stack owner and escalation rules. Coordinator writes. |
| `plan.md` | A filled plan contract from the template, dependencies, acceptance and current receipts. Coordinator writes. |
| `overview.md` | Append-only PR/issue index and milestones. Coordinator writes. |
| `units.tsv` | `id`, `track`, `state`, `branch`, `pr`, `sha`, `brief`, separated by tabs. Coordinator writes. |
| `frontier.json` | `generation`, bottom-to-top `prs` rows with PR, branch, full head SHA, state and base, plus `lowestUnmerged`. Coordinator writes after forge reconciliation. |
| `ledger.tsv` | `pr`, `sha`, `verdict`, `evidence`, `verifier`, `timestamp`. Verdicts are live-ui-verified, unit-test-verified, type-check-only, verifier-blocked or verifier-failed. Coordinator records verifier reports. |
| `inbox.md` | Pending completion pointers with agent, unit, status, report path and observed head; mark drained only after corresponding state updates. Coordinator writes. |
| `gates.md` | Decision, options, affected units and authorization still needed. No default grants permission. Coordinator writes. |
| `decisions.tsv` | Decision, reason, evidence and timestamp. Coordinator writes. |
| `status.md` | Counts derived from units and current-head ledger rows, frontier changes and open gates. Regenerate at drains; do not maintain an independent narrative counter. |

These are data contracts maintained through Pi `read`/`write`/`edit`, not an installed `orch init`, `orch status` or lock service. Never pretend the upstream CLI exists here. Serialize state edits explicitly; when another owner is active, wait or hand off ownership rather than stealing a lock. Use the plan checker for the contract and real `gh` queries for forge facts.

## Brief before every spawn or fresh retry

A missing field means the unit is not scoped. Every spawn and resume carries the standing orders verbatim because instructions decay across handoffs. A dependency relays its accepted upstream report and head, not just an id.

```text
GOAL        Checkable outcome executable without access to coordinator chat
SCOPE       Allowed paths, forbidden paths, exclusive worktree/branch, sole writer
CONTEXT     Repository pointers, PR heads, full accepted upstream reports
ACCEPTANCE  Observable criteria and evidence paths, one per item
VERIFY      Exact commands, cwd, live drive method, perf thresholds, known gotchas
TIMEBOX     Runtime and retry cap; return partial evidence and stop on expiry
FORBIDDEN   No unauthorized commit/push/merge/rebase/retarget/delete or scope expansion
REPORT      State, branch, full head, PRs, verdict, actual commands/exits, deviations
STANDING    Paste preferences.md verbatim
```

For a track owner add the track boundary, unit ids, child cap, drain protocol and rollup format. Audit a sampled brief during a wave; a bad brief stops the next refill and fixes the track instructions. A retry starts fresh with consolidated scope, never a chain of stale resumes. Cheap units may collapse the fields into a paragraph while retaining goal, scope, verify and report.

## Execute a bounded program

1. **Frame.** State the countable done predicate, unit count, expected stacks, wall-clock/spend budget and reserved actions. Present the filled plan and run `node '/absolute/pi-pstack/scripts/check-plan.mjs' '/absolute/run/<run-id>/orchestrate/plan.md'`. Planning does not authorize implementation. On explicit go, pilot one unit end to end before fan-out. The pilot tests the brief, verify recipe and unit size; for repeated cheap units the first ordinary unit is enough.
2. **Scale.** Refill a rolling window only after accepted dependencies and exclusive writer scopes are established. Cap active children at the plan's `maxParallel` and a drainable count. By roughly 70% of the wall-clock budget stop new spawns and finish verified units. Integration may proceed alongside work only under the operator's existing authorization.
3. **Queue.** Completion notices are queue events. Record a pointer and finish the current brief, stack operation, conflict decision or state update before draining. Never deep-review a diff inside the drain. Snapshot pending pointers at each drain; arrivals wait for the next drain.
4. **Drain.** At critical-section ends, track rollups, loop audits and before human reports, classify pointers as accepted, needs-verify, failed, zombie or noise. Update units and ledger before marking pointers drained. Schedule reviews/fixes as separate scoped units. Account for every child as arrived, respawned, abandoned or explicitly absorbed; do not silently redo a missing child's work.
5. **Verify.** Bind verdict and receipts to PR plus full head SHA. A new head invalidates prior acceptance until affected checks run again and a fresh verdict is recorded. CI green is input, not a verdict; typecheck-only is insufficient for behavior and verifier-blocked is not a pass. Failures get fix units, environment blockers get re-verification after recovery. Retain logs and artifacts as units complete rather than at the end.
6. **Reconcile frontier.** Query each captured PR with `gh pr view 123 --repo OWNER/REPO --json number,state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,reviewDecision`. Replace the example identifiers first. Record bottom-to-top chain, current forge SHAs and lowest unmerged PR, then increment generation after accepted topology/head changes. Missing PRs, ambiguous chain bases, closed-but-unmerged parents and stale heads are blockers. Freeze one generation per babysitter.
7. **Land only if authorized.** Exactly one stack owner handles topology. Workers never retarget, merge, rebase or force-push; conflicts become owner tasks. Closing a base can orphan children. Re-query the exact head and verdict immediately before any approved operation, and re-verify after restacking. No bookkeeping exception grants the coordinator publishing rights. Follow merged PRs for reverts, post-merge CI and orphaned follow-ups.
8. **Close.** Reconcile every child to done, abandoned or zombie-reconciled, check the real artifact and current forge heads, audit receipts, and run the complete gate. Record recurring corrections in standing orders or the brief template. Preserve state and a resumable handoff.

A concrete Pi replacement for `orch`'s audit cadence is this command after replacing the package, repository and plan paths:

```text
/loop run --max-turns 8 --until "cd '/absolute/target-repository' && node '/absolute/pi-pstack/scripts/check-plan.mjs' --complete '/absolute/run/<run-id>/orchestrate/plan.md'" "Read standing orders and plan; reconcile real heads, drain completion pointers, audit current-head receipts, advance only authorized units, update counts and gates. Stop on a hold or exhausted budget."
```

The predicate is read-only, returns 0 only for the selected completion gate, and runs after agent turns; `/loop` is not an hourly scheduler or a queue daemon. Use TUI or RPC, not print/JSON mode. A dirty worktree is rejected by default; inspect it and use `--allow-dirty` only deliberately. Do not add a second sleep loop. `/loop status` reports state; `/loop stop` stops continuation. Owner approval waits and dead infrastructure should stop the loop with a durable handoff, rather than consume all turns repeatedly.

## Liveness, failure and operator gates

Probe actual child status, branch heads, ledger and `gh` read-only; a resume restarts work and transcript mtime is not liveness. Cap-hit/OOM retries narrow scope, network retries retain it, tool errors can use an explicitly available alternative model. Unknown failures get one retry, at most two retries total before abandonment/replan. Bound coordinator infrastructure retries too. A late zombie reconciles against the current frontier and ledger; salvage unique findings through a fresh unit, never blind merge.

On restart read standing orders and durable tables, verify whether old children are actually alive, recompute the frontier from the forge, reconcile inbox pointers and only then resume. Do not assume Cursor cloud survival or a self-clearing store lock. A tree-wide bad dependency or broken verification writes a stop order, lets active work return safely and fixes the root before refill. Mid-run discoveries fix only frontier blockers; park other scope in follow-ups.

Batch genuine product decisions, contradictory standing orders, destructive actions and unresolved program dead ends in `gates.md`. No-response defaults never authorize merge, force-push, deploy, deletion, closing others' PRs or spending. On hold send zero-writes orders and stop the loop. Report the predicate and measured counts, tracks and accepted outputs, ordered frontier with SHAs and generation, current-head verdicts, abandoned work and reasons, open operator gates, store and trail paths, and actual checker command/exit. Planning or generation success alone is not program completion.
