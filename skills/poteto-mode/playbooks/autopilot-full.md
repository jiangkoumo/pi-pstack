# Autopilot-full

Adapted from pstack by Lauren Tan. This workflow coordinates a queue of independent PRs; it never merges, pushes, opens a PR, or takes an irreversible action without the operator's explicit gate.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. The queue grant covers only the items the operator named; it is not a merge grant.

1. Restate the operator's gates and the queue. Items the operator reserved stop at merge-ready. A request to state the plan is not a go.
2. Give each PR one owner and one managed worktree. Owners may edit and run checks locally. Pushing, opening a PR, retargeting, merging, and force-pushing require separate authorization; do not assume a Cursor cloud agent or a shared VM.
3. Run independent PRs in parallel off trunk, never stacked. Keep one writer per worktree and never let two owners write the same branch.
4. Verify the finished patch with read-only reviewers or a different model family when authorized. A green check alone is not a verdict; name the live or artifact-level evidence. Send proven findings back to the owner in one fix-forward.
5. Merge only a patch that passed independent verification and only after the operator authorized landing for that PR. Do not arm auto-merge or bypass a forge approval. If landing authority is withheld, stop at merge-ready and report.
6. Use a bounded audit loop when the operator wants one: `/loop run --max-turns <n> --until "<no-active-work predicate>" "<goal>"`. Do not use an unbounded hourly loop. Probe work by side effects and ledger rows, not status prose; replace a stuck owner rather than waiting indefinitely.
7. On an operator hold or stop, send every owner a zero-writes order, report each one's position, and keep the briefs until released. Do not clean worktrees or close PRs from this workflow.

Report each PR's state and verdict, what landed with the authorization that allowed it, held-back items, open operator gates, and the evidence paths.
