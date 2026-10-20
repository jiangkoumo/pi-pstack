---
name: poteto-mode
description: "Apply pstack engineering methods to investigation, bug fixes, and small behavior changes in Pi. Use when explicitly asked for poteto-mode."
disable-model-invocation: true
license: MIT
---

# Poteto mode for Pi

Before inspecting the workspace or running commands, make your first tool call a `read` of the matching playbook in the routing table below. Explicit `/skill:poteto-mode` already supplies this entry; it does not supply the selected playbook. Resolve its path from this SKILL.md, not from cwd. If that read fails, report the failure before proceeding. Complete the selected playbook's required leaf reads before workspace inspection; do not substitute prior knowledge for a required read.

Use native file tools: `ls` for directories, `read` for contents, and available search tools for discovery. Do not substitute shell `ls`, `find`, `cat`, or `rg`. Run each verification command separately with an explicit `cd <workspace> && <command>`; use the tool's actual exit status. Do not append `echo $?`, `|| true`, pipes that hide failure, or extra commands after a check.

An explicit /skill:poteto-mode invocation applies to the current request. The package extension also supports /poteto-mode on/off/status for later user requests on the active session branch. Turning persistent mode off does not cancel an explicit skill invocation in the current user request. This is the single-agent subset of pstack, adapted from Lauren Tan's fixed upstream revision. Source and differences are in [the port record](../../docs/port-status.md), and Pi harness mappings are in [the Pi adapter](../../adapters/pi/harness.md).

## Route the task

Read exactly the matching playbook before working. Resolve every relative path from the file that contains it.

| Request | Read |
| --- | --- |
| Read-only explanation, diagnosis, or recommendation | [Investigation](playbooks/investigation.md) |
| Reported broken behavior | [Bug fix](playbooks/bug-fix.md) |
| New or changed behavior | [Feature](playbooks/feature.md) |
| Repeated agent mistakes | [Correct](../correct/SKILL.md) |
| Autonomous bounded execution until check passes | [Autonomous run](playbooks/autonomous-run.md) |
| Sustained metric hillclimbing | [Hillclimb](playbooks/hillclimb.md) |
| Safe durable pause with local evidence | [Pause safely](playbooks/pause-safely.md) |
| Fast exploratory prototype | [Prototype](playbooks/prototype.md) |
| Session pickup and resume | [Session pickup](playbooks/session-pickup.md) |
| Git managed worktree cleanup | [Worktree cleanup](playbooks/worktree-cleanup.md) |
| Architectural refactoring with contract preservation | [Refactoring](playbooks/refactoring.md) |
| Performance optimization and regression prevention | [Performance issue](playbooks/perf-issue.md) |
| Multi-phase execution and orchestration | [Orchestrate](playbooks/orchestrate.md) |
| Preparing changes for PR review | [Opening a PR](playbooks/opening-a-pr.md) |
| Safe shipping workflow | [Shipping](playbooks/shipping.md) |
| Multi-phase planning | [Multi-phase plan](playbooks/multi-phase-plan.md) |
| Autonomous full autopilot | [Autopilot full](playbooks/autopilot-full.md) |
| Stacked delivery and PR management | [Autopilot stack](playbooks/autopilot-stack.md) |
| Babysitting external PR queues | [Babysit](playbooks/babysit.md) |

If a request spans these, finish the read-only diagnosis before the authorized change. A request for an explanation does not authorize a patch. Workflows with external side effects require explicit operator authorization.

## Work within the operator's authority

User and project instructions govern tools, permissions, output, and scope. Loading this skill grants no extra permission to delegate, send messages, commit, push, merge, deploy, or delete. Continue reversible work already authorized. Ask only for a material requirement or action that remains unauthorized. Continue independent authorized work while awaiting an answer.

Work directly by default. Optional delegation requires operator or applicable project authorization and a working integration such as pi-subagents. Check the installed integration's instructions and actual model list before using it. Never copy Cursor Task syntax or fixed model names. Use Pi's `/loop run` command for bounded autonomous iterations. Missing delegation does not block these workflows. Do not describe a self-review as independent review.

Keep one writer per working directory or worktree. Treat user changes as the baseline and preserve them. Stop only the steps that conflict with their changes.

## Delegate a writer only through a review gate

Use this sequence only when the operator authorized delegation and pi-subagents is working. Without it, stay single-agent and say so.

1. **Hand off explicitly.** Give the child the objective, allowed paths, prohibited actions (no commits, pushes, network calls, or unrelated files), approved decisions, exact acceptance commands, and how to report blockers. The parent receives the native completion notice; do not assume a mid-run question channel.
2. **Isolate the writer.** Start `pstack.poteto-agent` with `worktree: true`; keep the parent checkout clean and never run two writers in one directory. Treat the child's completion as a proposal, not proof. The managed worktree is normally removed after the run; use the run's handoff manifest and captured patch, not a deleted directory.
3. **Review independently.** Inspect the writer run status and acceptance evidence. Launch a read-only reviewer (`pstack.comment-sicko`) with `cwd` set to the source repository, and put the base commit and the captured patch (path and diff) in its task. A `review-required` ledger is not approval, and self-review is not independent review.
4. **Decide the findings.** Verify each finding against the code. Resolve blockers with a bounded correction run or stop; do not apply a change with open blockers.
5. **Freeze the reviewed patch.** Record a review file with `version: 1`, `verdict: "pass"`, `baseCommit`, `patchSha256`, `reviewer` (`runId`, `model`, declared `tools`), and `findings`. The hash covers the exact patch the reviewer saw.
6. **Gate the merge.** From the package root run `node scripts/writer-gate.mjs --repo <source> --patch <handoff-patch> --review <review.json> --check "<acceptance command>"`. It rejects blockers, a changed patch, a dirty source, a moved base, failed checks, and non-read-only reviewer tools. Only after it exits 0, and only with separate operator authorization to merge, rerun with `--apply`. The gate updates the source working tree; it never commits or pushes. A live `--worktree` mode exists for retained worktrees; the normal async path uses `--patch`.
7. **Report.** Name the writer run, reviewer run, patch hash, gate result, checks with exit codes, whether the patch was applied, and residual risks.

The gate is parent-side enforcement, not a sandbox or a host guarantee: a parent that runs raw Git can bypass it. Do not describe the flow as automatic merging, and do not commit, push, or clean up worktrees without authorization.

## Read principles when they affect a choice

Read the relevant leaf in full before applying it. Do not preload every principle. Name a principle in the report only if you read it and it changed a concrete decision.

| Trigger | Leaf |
| --- | --- |
| Choosing state or data shape | [Model the domain](../principle-model-the-domain/SKILL.md) |
| Debugging | [Fix root causes](../principle-fix-root-causes/SKILL.md) |
| Declaring completion | [Prove it works](../principle-prove-it-works/SKILL.md) |
| Multi-step changes | [Sequence verifiable units](../principle-sequence-verifiable-units/SKILL.md) |
| Writing tests | [Test behavior](../principle-test-behavior-not-implementation/SKILL.md) |
| Recurring correction | [Encode lessons](../principle-encode-lessons-in-structure/SKILL.md) |
| Adding structure | [Laziness protocol](../principle-laziness-protocol/SKILL.md) |
| Validation and adapters | [Boundary discipline](../principle-boundary-discipline/SKILL.md) |

## Execute and report

Use the tools actually exposed by Pi. Read through read; edit existing files through edit; create new files through write. Search with ffgrep/fffind when available, otherwise grep/find. Use ls for directory listings. Reserve bash for execution, Git, package management, and permitted file management. Follow stricter local tool rules. Batch independent reads and limit large command output with codemode when available. If an essential tool is absent, report the missing capability instead of bypassing restrictions.

For nontrivial changes keep a brief plan in the response or the existing task tool. Retain skipped steps with a reason. State the blocking checks, independent work, shared state, and smallest safe decomposition; n/a with a reason is valid. A single writer is enough when the files share one dependency boundary.

Verify the actual behavior through the appropriate interface. For browser or CLI work use the operator's available driver and its instructions. A build, successful resource load, or delegate's report alone does not prove behavior. Do not invent a browser capability.

Write concise, concrete prose. Explain the consumer-visible result first, then choices, evidence, remaining work, and blockers. Separate measured results from inference. Include actual check commands and exit codes. Follow any project delivery format. Do not open a PR or make a commit merely to satisfy a playbook.
