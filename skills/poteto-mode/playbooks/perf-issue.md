### Perf issue

**You own the measurement story. Plan, review, verify the numbers.** Tie every fix to a measurement, don't read source instead of measuring.

1. Capture a baseline trace via the matching control skill. Vet the baseline, and each later number, with the **benchmark-checklist** skill.
2. `how` to ground hypotheses. Don't claim a perf ceiling without running it first.
   Try the performance mantras in order, cheapest first:
   1. Don't do it. Stop work whose result nothing uses rather than cheapening it.
   2. Do it, but don't do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when they're not looking.
   6. Do it concurrently.
   7. Do it cheaper.

   When an earlier mantra meets the target, stop.
3. Plan the fix from the trace. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent through pi-subagents as `pstack.perf-agent`, using your configured `perf` role from `/setup-pstack`. Pick each subagent's thinking level for the job, per the Subagents section. Review the diff. Capture a post-fix trace.
   Apply the **sequence-verifiable-units** principle skill, verifying each attempt before trying the next.
4. Parse and compare the artifacts (JSON to sqlite, diff). "Inconclusive" or wrong-surface is not a pass. Flag it.
5. Cite the measurement in the PR.
6. Run **Opening a PR**.

For sustained improvement against a metric rather than a one-off fix, use the Hillclimb playbook (`playbooks/hillclimb.md`).

**Reply:** baseline number, post-fix number, delta, artifact path.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream steps with the listed Cursor tool, model, and skill substitutions. These notes govern platform and authorization differences.

Read [Poteto mode for Pi](../SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand. `/unslop` replaces Cursor's deslop pass. Use Pi's `read`, `edit`, `write`, `ffgrep`/`grep`, `fffind`/`find`, and `ls` for file content; `bash` executes programs and checks. Ask the operator in plain text when a decision is needed.

Store local trails, patches, resume notes, and prototype artifacts under `<run-id>/` in the pstack run directory provided in the system prompt, or another durable operator-approved local directory. Keep evidence out of the repository unless its inclusion is authorized. A path in an upstream example is not permission to write unrelated user state.

The operator's current task grant governs delegation, local commits, and worktrees. Keep one writer per worktree; a replacement takes over only after the previous writer has stopped. Give every delegate the goal, allowed paths, prohibitions, approved decisions, acceptance commands, and a route back to its parent. Use configured role models and thinking from `/setup-pstack`; never put `model` on the outer `subagent` call or in a parallel task item. Wait for completion notices. If pi-subagents is unavailable or delegation is forbidden, execute the steps in sequence within the current grant, label self-review, and report `BLOCKED: independent review` where independent review is required.

Pushing, opening or editing a PR, and merging require explicit authorization in the current session for the action and scope. Auto-merge needs its own explicit grant. Rebase, amend, reset, force-push, and deletion follow the operator's Git and cleanup rules; an upstream imperative does not bypass them. Without push/PR authorization, prepare and display the proposed Conventional Commits title and PR body locally, then report the branch, checks, and pending action. Green CI, a loop tick, and a previous PR do not grant authority.

Delegate through pi-subagents to `pstack.perf-agent`, bound to the `perf` role, in its own worktree: `subagent({ agent: "pstack.perf-agent", task: "<trace-grounded fix, allowed paths and measurement command>", cwd: "<source-repo>", worktree: true })`. Use the existing benchmark-checklist and the matching control adapter; missing tracing or platform tools leave the measurement blocked, not passed. Step 6 follows Opening a PR's current-session authorization gate.
