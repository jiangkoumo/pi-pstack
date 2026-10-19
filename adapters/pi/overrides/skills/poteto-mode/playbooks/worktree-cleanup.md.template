# Worktree and simulator cleanup

Adapted from pstack by Lauren Tan. This workflow reclaims disk only after an audited, per-path decision; it does not automatically delete worktrees, commits, branches, simulators, or caches.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. Cleanup is destructive and is not a `/loop` task: do one audited pass, and use `/loop` only if the operator explicitly wants repeated monitoring of a non-destructive check.

1. Snapshot first. Record `df -h /`, `git worktree list --porcelain`, and for each candidate the path, size, age, branch, `git status --porcelain`, and whether it is a managed worktree. Do not use Cursor transcript scripts or scan `~/.cursor` paths; if the upstream Cursor-only audit script is unavailable, say so and use the Git facts instead.
2. Treat any suggested bucket as advice, not permission. The operator's pinned and active set wins. Check for active pi-subagents runs and one-writer ownership before touching a path; never remove a worktree owned by a running child or a session that is still using it.
3. Verify usage before deleting. Inspect dirty and untracked files, whether the branch is merged, and any PR state only within the operator's authorization. For an uncertain worktree, ask; do not infer safety from a name or an old timestamp.
4. Pause on irreversible loss. Show the path, size, branch, dirty/untracked state, and what would survive versus disappear. `git worktree remove --force` and `rm -rf` require per-path authorization; a branch ref usually survives, but uncommitted work does not. Preserve ignored or untracked files until the operator decides.
5. Prune only the confirmed set, one path at a time, then run `git worktree prune` and re-list. Confirm with `df -h /`. Do not delete package caches, Xcode data, or iOS simulators by default; handle simulator or cache cleanup only when the operator asks and the platform tool actually exists. Never present a dry-run list as deleted state.
6. Report `df -h /` before and after, the worktrees actually pruned, and a one-line reason for each held-back path. No commit, push, PR, or worktree cleanup happens without separate authorization.

The main skill owns authorization and Git rules. This workflow's review is the explicit per-path gate, because an incorrect delete has no code review to catch it.
