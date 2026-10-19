# Refactoring

Adapted from pstack by Lauren Tan. This workflow changes structure without changing behavior; it does not commit, push, open a PR, or merge without separate authorization.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. A refactor that reveals a missing feature or a real bug splits it out first.

1. Pin the behavior contract before moving structure. Read the affected callers and tests, then write a characterization test, snapshot, or equivalence harness that captures current behavior. Type checks and lint are not a behavior pin.
2. Name the structure the code is missing. The change must delete branches or invalid states, not add indirection. If the shape is already clear and local, leave it alone.
3. Name the target module layout, types, and call graph. If the target crosses a function boundary, use Architect when it is available; otherwise sketch the alternatives yourself and record the choice.
4. Subtract before adding: delete dead code, collapse one-caller wrappers, drop redundant validators, and remove orphan references. Keep the smallest change that reaches the target shape; a cleanup that "might help" is reverted.
5. Move in small behavior-preserving steps, each keeping the pin green. For an API reshape, migrate every caller and delete the old API in the same wave; no compatibility shims. Delegate mechanical edits only with authorization, one writer per worktree, using a configured role rather than a fixed model slug.
6. Prove behavior is unchanged on the real artifact, not "it compiles". Replay the baseline or diff old versus new outputs. Confirm the change lowers reader load somewhere; otherwise revert it.
7. Do not commit, push, open a PR, rebase, or merge from this workflow. If a commit is separately authorized, keep it behavior-preserving and scoped.

Report the structure that changed, the pin held against it, the equivalence proof, the reader-load delta, what shipped, and what was reverted.
