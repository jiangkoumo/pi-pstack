# Multi-phase or multi-PR plan

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source is fixed at `f713f14203cd6420cec13cd7c55c32d598dbab68`; original license is retained in the package's `LICENSES/pstack.txt`. This adaptation replaces Cursor cloud assumptions, fixed model names, hourly loops and automatic shipping with a local plan contract and bounded Pi execution.

**The plan is the deliverable.** Do not implement the program from a planning request. Read [Poteto mode for Pi](../SKILL.md) for tool and authority rules. A one or two file change with an obvious approach may need only a short direct plan; do not build program machinery for work one owner can finish in a session.

## Resolve paths before writing

Read [the plan template and schema](../../../docs/templates/pstack-plan.md) and [the PR evidence template](../../../docs/templates/pstack-pr.md). These relative links resolve from this generated `skills/poteto-mode/playbooks/` directory, not the repository being planned. Locate the installed package root by walking three parents from this playbook. Its checker is `scripts/check-plan.mjs`. Keep that package path separate from the target repository path.

Write to the operator's named plan path, otherwise `<run-id>/plan.md` in the pstack run directory provided in the system prompt. If no run directory is given, obtain a concrete local destination before creating it; never invent a home-directory store. All evidence paths in the JSON contract resolve below the copied plan's directory. Repository paths resolve relative to the contract's `repository` (itself relative to the plan directory, unless absolute). Commands run only in the explicitly named target repository.

## Produce the plan

1. Read project instructions, entry points, file boundaries, conventions and actual check commands. Settle empirical questions with a scoped prototype only within the authorized scope; retain branch, full SHA, logs and screenshots for Appendix A. Product or preference decisions that experiments cannot settle become explicit operator gates with options.
2. Explore with the current owner by default. Authorized explorers return file pointers, conventions, entry points and exact check commands, never dumps. Delegation requires the optional subagent tooling, available agent names and exact configured `provider/id` models. The plan records role/configuration needs; it does not assume pending runtime role wiring works or authorize a child launch.
3. Copy the plan template with Pi file tools and replace its example facts. Retain How to read this, Program checklist, one independent section per PR, Close the program, and the four appendices. Keep the body a Diátaxis how-to; explanation belongs in appendices. Apply the available technical-writing and unslop methods when useful. Keep the single top-level `pstack-plan` fence aligned with the prose.
4. Specify every PR's id, owner, branch/base, dependencies, allowed files, build tasks, observable results, unit commands, live scenarios, performance gate or reasoned exemption, interaction review decision and merge owner. Use `orchestrate.md` for a standing program and `autonomous-run.md` for work a single owner can finish; both paths in the contract are package-root-relative. Dependency edges relay accepted upstream reports as context, not only ordering. Reject cycles, missing owners and overlapping concurrent writer scopes before execution.
5. Every acceptance item names the evidence that checks it. Live verification is mandatory, including a regression lane at trunk and head. For broad interaction work retain the upstream ten-lane method, numbered 1 through 10, with scenario, drive method, saved screenshot and pass predicate per lane. Exercise both surfaces when necessary. Sequential lanes are valid when delegation is unavailable or unauthorized. Browser work uses the operator's available browser/control skill, CLI/TUI work uses the appropriate CLI/control tooling, and missing tooling remains a risk and blocker.
6. A perf gate names metric, interleaved probe, trunk baseline measured first and a numeric failure threshold. Alternate trunk/head at least five times. If trunk lacks the feature, record that absence, isolate the work added by the change and budget both that work and the user's end state; never compare unlike ratios. A documentation-only exemption needs a concrete reason. Interaction changes require screenshots, a video and operator approval evidence before landing. Typecheck-only and blocked are not behavioral passes.
7. Run the real checker on the produced file, repair its diagnostics and rerun. Do not hand off an unchecked plan. The checker is read-only and executes no plan-provided commands. Structural validity does not prove the commands, PR behavior, prose quality or approval; inspect those facts separately.

For example, after resolving the package and run paths, invoke this with the execution tool (replace the quoted absolute paths with the actual paths):

```bash
cd '/absolute/target-repository' && node '/absolute/pi-pstack/scripts/check-plan.mjs' '/absolute/pstack-run/<run-id>/plan.md'
```

The expected *shape* of success is `2 PR sections, 0 problems (structure)` for a two-PR plan; report the actual output and exit code, never this example as evidence. Exit 0 passes; exit 1 rejects malformed/invalid plans; exit 2 is usage or file-read failure. Diagnostics identify the file, contract line and JSON field. Run `node --test scripts/check-plan.test.mjs` from the package root to exercise valid, malformed, cyclic, incomplete and stale-receipt cases.

## Hand off, then stop

Return the plan path, PR ids and dependency graph, interaction review set, prototypes and evidence, unresolved gates, actual checker output and exit code. State that execution awaits explicit go; do not commit, push, open PRs or merge merely because the plan passed.

During later authorized execution, update the same contract with actual head SHAs, verified states and receipts, then run `node '/absolute/pi-pstack/scripts/check-plan.mjs' --complete '/absolute/pstack-run/<run-id>/plan.md'`. This gate requires evidence files and successful receipts at each PR's declared current head. The coordinator must compare those heads to Git/forge facts and audit evidence contents. Planning uses the default structural gate; `--complete` is never a shortcut that fills future evidence.
