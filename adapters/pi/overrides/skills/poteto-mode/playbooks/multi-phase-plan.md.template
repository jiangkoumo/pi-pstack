### Multi-phase or multi-PR plan

**You own the plan, not the code. The plan is a checklist an owner runs box by box and the operator audits from the evidence.** The plan is the deliverable. Do not implement.

1. When the change is one or two files with an obvious approach, skip the plan. Say so and stop.
2. Settle open questions by prototype before you write, per `playbooks/prototype.md`. Ask the operator only about a product or preference call that no run can settle.
3. Write the plan file. Open with what changes, the PR ids in landing order, and the dependency graph, which says which PRs are independent and branch from trunk, which wait for which, and the files each may touch. Then one section per PR. One PR is one change with its own evidence (the **sequence-verifiable-units** principle skill). Each section has checkboxes for what it depends on, the files it edits, the one change it builds, the result you see, and its verification.
4. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Each live box drives the real surface with a concrete scenario and a pass predicate. The perf box names the metric, the probe, the trunk baseline measured first, and the number that fails. A PR that changes an interaction waits for the operator's review before merge.
5. Hand back the plan path and stop. Execution starts on the operator's explicit go.

**Reply:** the plan path, the PR ids with their dependencies and the review-gated set, and what stays unproven.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `e58dd043600587dbaf58ba315e7f2b38373eeb43` (pstack 0.15.44); license: `LICENSES/pstack.txt` in the package root. The body preserves the upstream steps with path and tool substitutions.

Resolve `<package>` to the installed `pi-pstack` package root before writing, and keep it separate from the target repository. The prose body above is the whole plan. The `pstack-plan` JSON fence and the `scripts/check-plan.mjs` checker are gone with upstream 0.15.43, so write no fence and run no plan checker. Write the plan to the operator's named path, otherwise `<run-id>/plan.md` in the pstack run directory provided in the system prompt. If no run directory is given, resolve a concrete local destination before writing; never hard-code a home-directory store.

Planning authorizes no implementation, commit, push, PR, or merge. Delegation needs current operator or project authorization and verified pi-subagents registration; with neither, explore locally and label the limit. Use configured role models and thinking, never a `model` field in a task item or on the outer `subagent` call. One writer per worktree; a read-only reviewer never receives write tools. An interaction change needs the operator's screenshots, video, and approval before merge; missing browser or CLI tooling is a declared risk, not a pass.
