# Opening a PR

Adapted from pstack by Lauren Tan. Opening a PR is an external write. This workflow runs only when the operator has explicitly authorized the push and the PR; no other pstack workflow grants that authority by implication.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill.

1. Confirm the authorization: which repository, which branch, which base, and whether the push is included. If any part is missing, prepare the branch and patch locally and stop before the external write.
2. Run [interrogate](../../interrogate/SKILL.md) or an equivalent parallel read-only review through pi-subagents before opening the PR. Verify each finding, resolve blockers, and retain the review run IDs. If independent review is unavailable, record `BLOCKED: independent review` and stop before opening the PR. Inspect the final diff and the checks on the exact commit that would be pushed. Do not open a PR from a dirty tree, an unreviewed patch, or a commit whose checks were run on different code.
3. Push the authorized branch only. Never force-push a shared branch, never push someone else's branch, and never use `git add -A` to assemble the commit. If a push is rejected because the base moved, report it instead of force-pushing.
4. Create the PR with the operator-approved forge (`gh` by default, `origin pr` when available and authorized). Use a ready PR rather than a draft unless told otherwise. Do not arm auto-merge, request reviews, retarget a stack, or merge.
5. Report the PR URL, branch, base, commit SHA, checks actually run with exit codes, and any gate still open. If the PR was not opened because authorization or tooling was missing, say exactly what is blocked and leave the local artifact intact.

This workflow never turns a successful push into permission to merge, deploy, or clean up.
