# Autopilot-stack

Adapted from pstack by Lauren Tan. This workflow hands the operator one reviewable stack of base-chained PRs; it does not land the stack or mutate its topology without explicit authorization.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. Autopilot-full's owner rules apply except where this playbook says verified work leaves as a stack.

1. Run the owners without landing. Owners report stack-ready instead of merge-ready. They never rebase onto another branch, retarget, merge, close a PR, or arm auto-merge; the root owns the chain's topology and the operator owns landing.
2. When an item depends on another, branch it from that item's branch, not from trunk. Give the topology one writer: only the root rebases or retargets a link. Each owner pushes only its own branch and reports its tip and intended parent.
3. Append each clean PR in dependency order and set its base to its parent's branch, using `gh pr edit` or `origin pr edit` only when the operator authorized PR operations. Never require Graphite, and never rewrite merged history.
4. Absorb drift at the root before landing starts. Rebase the chain bottom-up when the code that would land was never tested, and compare patch ids before trusting an older verification.
5. Once landing starts, nobody writes to the chain except the sanctioned post-merge retarget. A mid-landing problem goes to the operator; any fix waits for the operator's go.
6. Report the stack root and tip, one-line verdict per link, the patch-id evidence, anything parked or excluded, and the exact landing gate still awaiting the operator. Do not commit, push, or merge outside the authorized PR operations.
