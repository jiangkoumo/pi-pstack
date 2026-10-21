### Bug fix

**You own this task. Plan, review, verify.** Delegate investigation and the fix to subagents, stay in the lead. Pick each subagent's reasoning level for the job, per the Subagents section.

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix. It does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more.

1. Reproduce it yourself on the matching surface via the control skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with pstack's `/loop` command. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent (the `pstack.poteto-agent` agent through pi-subagents' `subagent` tool, which runs on your configured `code` role model from `/setup-pstack`) with a specific scope.
4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
   This is the canonical **sequence-verifiable-units** principle skill, the failing test first and the fix on top.
6. Run **Opening a PR**.

**Reply:** what was broken, root cause, fix, how you verified. Paste failing-then-passing repro output verbatim.

#### Pi adaptation

These notes apply the playbook on Pi. They add to the steps above and replace none of them.

- **Tools.** Delegated investigation in step 2 and the step-3 `architect` / `interrogate` fan-out use one pi-subagents `subagent` call with `{ workflow: "parallel", args: { tasks: [{ agent: "pstack.<agent>", task: "<brief>" }] } }`, with one `args.tasks` item per seat. Each `pstack.*` agent runs on its role's model (`pstack.poteto-agent` on `code`, `pstack.comment-sicko` on `review`, `pstack.verifier` on `verification`). Do not put `model` in a task item or on the outer call. Give the fix delegate its own worktree. Wait for completion notices; do not poll.
- **Worktrees.** Use `subagent({ agent: "pstack.poteto-agent", task: "<brief>", cwd: "<source-repo>", worktree: true })` for managed isolation from a clean source checkout. Alternatively, run `git worktree add <path> -b <delegate-branch> HEAD` and launch with `cwd: "<path>", worktree: false` to use that existing worktree. Keep one writer per worktree.
- **Evidence.** Step 3 leaves a real `subagent` call to `pstack.poteto-agent` in the session log. A fix the lead typed is not a delegated fix.
- **No pi-subagents.** Run the steps in sequence, label the result self-review, and record `BLOCKED: independent review`.
- **Authorization.** Pushing, opening a PR, and merging need the operator's explicit go-ahead in this session. Without it, stop after step 5 and report the branch, the commits, and the failing-then-passing output.
