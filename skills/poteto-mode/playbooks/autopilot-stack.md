### Autopilot-stack

**You own the stack, never the landing. Hand the operator one linear stack of base-chained PRs to review and land.** **Autopilot-full** holds except for how verified work leaves. Each tick re-reads both playbooks from trunk, and this one wins where they differ.

1. **Run Autopilot-full's owners, minus the landing.** Owners report STACK-READY in place of merge-ready. They never rebase onto another branch, trunk included, and never retarget, merge, close a PR, or arm auto-merge, because the root owns the chain's topology and the operator owns the landing. When an item depends on another, its owner branches from that item's branch, not from trunk.
2. **Give the topology one writer.** Owners push only their own branches and report each tip and its intended parent. Only you rebase or retarget a link, because two writers on one chain undo each other. Append each clean PR in dependency order, with its base set to its parent's branch (`origin pr edit <pr> --base <parent-branch>` or `gh pr edit <pr> --base <parent-branch>`). Never require `gt`. An owner takes your push as its new base and lease, and on a conflict resolves its own slice for you to push.
3. **Absorb drift at the root.** Until landing starts, apply Autopilot-full step 5's test to each link and rebase the chain bottom-up where it calls for one. Then apply the patch-id rule link by link, since a link's base is its parent.
4. **Deliver the chain, then keep your hands off it.** Each link carries its verdict in its PR. Once landing starts, nobody writes to the chain except the post-merge retarget that `playbooks/shipping.md` sanctions, because a second writer breaks a landing in flight. A mid-landing problem goes through you to the operator, and any fix waits for the operator's go.

**Choosing between the autopilots.** Autopilot-full when the PRs are independent and landing authority is granted. Autopilot-stack when the operator wants review before landing, the work is sequenced or coupled, or merge authority is withheld.

**Reply:** catch the operator up per the **ketchup** skill, with links to the stack root and tip, a one-line verdict per link, and anything parked or excluded with the reason.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream steps with the listed Cursor tool, model, and skill substitutions. These notes govern platform and authorization differences.

Read [Poteto mode for Pi](../SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand. `/unslop` replaces Cursor's deslop pass. Use Pi's `read`, `edit`, `write`, `ffgrep`/`grep`, `fffind`/`find`, and `ls` for file content; `bash` executes programs and checks. Ask the operator in plain text when a decision is needed.

Store local trails, patches, resume notes, and prototype artifacts under `<run-id>/` in the pstack run directory provided in the system prompt, or another durable operator-approved local directory. Keep evidence out of the repository unless its inclusion is authorized. A path in an upstream example is not permission to write unrelated user state.

The operator's current task grant governs delegation, local commits, and worktrees. Keep one writer per worktree; a replacement takes over only after the previous writer has stopped. Give every delegate the goal, allowed paths, prohibitions, approved decisions, acceptance commands, and a route back to its parent. Use configured role models and thinking from `/setup-pstack`; never put `model` on the outer `subagent` call or in a parallel task item. Wait for completion notices. If pi-subagents is unavailable or delegation is forbidden, execute the steps in sequence within the current grant, label self-review, and report `BLOCKED: independent review` where independent review is required.

Pushing, opening or editing a PR, and merging require explicit authorization in the current session for the action and scope. Auto-merge needs its own explicit grant. Rebase, amend, reset, force-push, and deletion follow the operator's Git and cleanup rules; an upstream imperative does not bypass them. Without push/PR authorization, prepare and display the proposed Conventional Commits title and PR body locally, then report the branch, checks, and pending action. Green CI, a loop tick, and a previous PR do not grant authority.

Run Autopilot-full's local-owner, parallel-call, evidence, and bounded-loop adaptations as well. Owner tasks use `pstack.poteto-agent` with the `code` role, and disjoint worktrees. The root is the sole topology writer only within an explicit topology grant; owners do not mutate the chain concurrently. Without remote PR or push authority, deliver the proposed local base chain with a title and body for every link. The operator retains landing authority, including any post-merge retarget.
