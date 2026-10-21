### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a subagent (the `pstack.poteto-agent` agent through pi-subagents' `subagent` tool, which runs on your configured `code` role model from `/setup-pstack`) with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain**, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). Pick each subagent's reasoning level for the job, per the Subagents section. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation. No "standing by" reply that waits on a nested agent. **Give every file-writing delegate its own worktree** (create it with `git worktree add <path> -b <delegate-branch> HEAD` and launch the delegate with that path as its working directory, or hand it an exclusive branch), and do not write files or run a suite in a worktree a delegate still holds. Fencing a file in the brief's prose is not a lock (**principle-separate-before-serializing-shared-state**). Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.

#### Pi adaptation

These notes apply the playbook on Pi. They add to the steps above and replace none of them.

- **Tools.** `how`, `architect`, `arena`, and `interrogate` fan out with one pi-subagents `subagent` call using `{ workflow: "parallel", args: { tasks: [{ agent: "pstack.<agent>", task: "<brief>" }] } }`, with one `args.tasks` item per seat. Each `pstack.*` agent runs on its role's model: `pstack.poteto-agent` on `code`, `pstack.comment-sicko` on `review`, `pstack.verifier` on `verification`, `pstack.prose-writer` on `prose`. Do not put `model` in a task item or on the outer call. Wait for the completion notices; do not poll.
- **Worktrees.** For the implementation delegate, use `subagent({ agent: "pstack.poteto-agent", task: "<brief>", cwd: "<source-repo>", worktree: true })`; managed isolation requires a clean source checkout. Alternatively, create the worktree with the step-4 `git worktree add` command and launch with `cwd: "<worktree-path>", worktree: false` to use that existing worktree. Keep one writer per worktree and include the scope and acceptance commands in its brief.
- **Evidence.** Step 2 and step 4 each leave a real `subagent` call in the session log. A design written in prose by the lead is not an `architect` run, and an edit made by the lead is not a delegated implementation.
- **No pi-subagents.** When the `subagent` tool is missing, run the same steps in sequence, label the result self-review, and record `BLOCKED: independent review` as poteto-mode's Subagents section says. Do not ship as reviewed.
- **Authorization.** Delegation, local commits, and worktrees follow the operator's grant for this task. Pushing, opening a PR, and merging need the operator's explicit go-ahead in this session. A feature request alone is not that go-ahead. Without it, stop after step 6, report the branch and commits, and say what **Opening a PR** would do next.
