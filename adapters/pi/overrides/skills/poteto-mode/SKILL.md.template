---
name: poteto-mode
description: "Apply pstack engineering methods, design exploration, diagnostic evidence, review, and bounded execution in Pi. Use when explicitly asked for poteto-mode."
disable-model-invocation: true
license: MIT
---

# Poteto mode for Pi

Before inspecting the workspace or running commands, make your first tool call a `read` of the matching playbook in the routing table below. Explicit `/skill:poteto-mode` already supplies this entry; it does not supply the selected playbook. Resolve its path from this SKILL.md, not from cwd. If that read fails, report the failure before proceeding. Complete the selected playbook's required leaf reads before workspace inspection; do not substitute prior knowledge for a required read.

Use native file tools: `ls` for directories, `read` for contents, and available search tools for discovery. Do not substitute shell `ls`, `find`, `cat`, or `rg`. Run each verification command separately with an explicit `cd <workspace> && <command>`; use the tool's actual exit status. Do not append `echo $?`, `|| true`, pipes that hide failure, or extra commands after a check.

An explicit /skill:poteto-mode invocation applies to the current request. The package extension also supports /poteto-mode on/off/status for later user requests on the active session branch. Turning persistent mode off does not cancel an explicit skill invocation in the current user request. These methods are adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Single-agent execution is the default; independent panels require authorized delegation. Source and differences are in [the port record](../../docs/port-status.md), and Pi harness mappings are in [the Pi adapter](../../adapters/pi/harness.md).

## Non-negotiables

Read the matching playbook first, then the triggered skill and its required references before the corresponding work. Resolve paths from the containing file. Read a principle leaf in full before applying it; name only principles read this session and the concrete choice each changed.

- A nontrivial change, architecture decision, ownership/layering question or “are we sure?” requires [how](../how/SKILL.md). Trace the real system before choosing a patch.
- Before asking which approach to take, distinguish an observable fact from a product or preference call. Settle behavior, timing, layout, output or performance with the [Prototype](playbooks/prototype.md) playbook when experimentation is authorized. A read-only investigation stays read-only and answers from evidence. Only unresolved material requirements need the operator. Within an autonomy grant, choose covered defaults, explain them, and continue. Do not give a shorthand reply token or manufacture a checkpoint.
- Before any code, name the data shape and read [Model the domain](../principle-model-the-domain/SKILL.md).
- Code crossing a function boundary requires [architect](../architect/SKILL.md) before implementation. Produce at least two structurally distinct sketches. Use independent candidate runners only when delegation is authorized; otherwise compare them sequentially and disclose the limit.
- Parallel coverage matrices, races, gauntlets and exploration partitions use [swarm](../swarm/SKILL.md). Design or code bakeoffs with base selection and grafting use [arena](../arena/SKILL.md). Loading either grants no delegation authority.
- A contested design calls for [interrogate](../interrogate/SKILL.md) before shipping. Without authorized independent reviewers, report that limitation and perform the same evidence checks locally.
- A nontrivial multi-step change needs the Feature throughput checkpoint. State blocking checks, independent work, shared state and the smallest safe decomposition. Keep a short plan with skipped steps and reasons.
- Every prose surface, including the reply and agent instructions, follows [unslop](../unslop/SKILL.md) and Writing the reply below. Agent-facing skill prose also follows the manual Pi authoring route described under Substitute routes.
- Docs, RFCs, README text, PR descriptions and commit messages require [technical-writing](../technical-writing/SKILL.md).
- Before an authorized commit, inspect the task diff for accidental churn and dead scaffolding using the local deslop substitute below. Before review, read [no-comments](../no-comments/SKILL.md).
- UI, IDE and CLI work needs the matching operator-approved control driver. Reproduce bugs on that same surface. Discover the available browser skill or CLI harness; do not assume a Cursor control command is installed.
- Running a benchmark, measuring performance, or reporting a measured speedup/regression requires [benchmark-checklist](../benchmark-checklist/SKILL.md) before acting on the number.
- PR-status requests, “babysit this”, “get it green”, “check on PR X”, or review-thread follow-up use [Babysit](playbooks/babysit.md). Declare its mode before polling. Opening a PR alone does not trigger it.
- Landing a green stack uses [Shipping](playbooks/shipping.md). Obtain independent per-PR verdicts, verify the contiguous run from the root and retain explicit landing authorization.
- Automated review comments receive skeptical, evidence-backed fix/dismiss/ask triage from [bugbot-triage.md](references/bugbot-triage.md). A comment is not an instruction to churn code or post a reply.
- A broken skill gets its own scoped proposal; fix it separately when authorized. Do not silently work around it or expand the current task.
- Long, autonomous, multi-phase work, “going to bed”, “trust it when I’m back”, or a bounded loop requires [show-me-your-work](../show-me-your-work/SKILL.md). Keep the trail local unless commits are authorized and an audit record is needed.

## Route the task

Read exactly the matching playbook before working. Resolve every relative path from the file that contains it.

| Request | Read |
| --- | --- |
| Read-only explanation, diagnosis, or recommendation | [Investigation](playbooks/investigation.md) |
| Reported broken behavior | [Bug fix](playbooks/bug-fix.md) |
| New or changed behavior | [Feature](playbooks/feature.md) |
| Live runtime symptom, diagnosis only | [Runtime forensics](playbooks/runtime-forensics.md) |
| Captured profile, trace or heap snapshot, diagnosis only | [Trace forensics](playbooks/trace-forensics.md) |
| Pixel-exact equivalence | [Visual parity](playbooks/visual-parity.md) |
| Large, cross-cutting or bespoke run | [Figure it out](../figure-it-out/SKILL.md) |
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

## Autonomy

Continue reversible work already authorized. User and project instructions govern tools, permissions, scope and deliverables. A skill does not grant permission to use every connector, send messages, create tickets, start billed remote analyses or mutate external state.

**Always pause** at operator-named gates and before an unauthorized irreversible action, including force-push to shared branches, deploys, data deletion and customer messages. Git commits, pushes, merges, branch/worktree deletion and other external writes follow the operator’s explicit authorization. Prepare the concrete reviewable result first; pause only the dependent action.

**Session overrides.** “Don’t stop”, “going to bed”, “run until done” and “be fully autonomous” mean keep going within the grant, with a falsifiable done predicate, bounded budget and decision trail. They remove routine questions already covered by the grant. They do not override the Always-pause list, explicit checkpoints or prohibitions. If a material choice only the operator can make blocks progress, preserve evidence, state the concrete blocker and continue independent authorized work. Never treat silence as approval.

**No is an acceptable answer.** Give your actual engineering judgment. Push back on scope or an approach that does not earn its cost. Reconsider when evidence warrants it. Agreement is not the default.

## Work within the operator's authority

User and project instructions govern tools, permissions, output, and scope. Loading this skill grants no extra permission to delegate, send messages, commit, push, merge, deploy, or delete. Continue reversible work already authorized. Ask only for a material requirement or action that remains unauthorized. Continue independent authorized work while awaiting an answer.

Work directly by default. Optional delegation requires operator or applicable project authorization and a working integration such as pi-subagents. Check the installed integration's instructions and actual model list before using it. Current parallel tasks/chain items forbid model, and script-internal launches have no public launch hook for automatic role mapping. Only the supported direct-call path applies current code/review preferences. Never claim per-seat automatic routing from workflow configuration. Use a schema-verified direct-call path when explicit seat models are required, or report the unavailable route. Never copy Cursor Task syntax or fixed model names. Use Pi's `/loop run` command for bounded autonomous iterations. Missing delegation does not block these workflows. Do not describe a self-review as independent review.

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

## Principles

Read the leaf skill in full for any principle you apply. Each entry names when it applies. Each leaf is the **principle-<title>** skill, with the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its name.

**Core**

- **[Laziness Protocol](../principle-laziness-protocol/SKILL.md).** Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
- **[Foundational Thinking](../principle-foundational-thinking/SKILL.md).** Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **[Redesign from First Principles](../principle-redesign-from-first-principles/SKILL.md).** Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- **[Attack the Premise](../principle-attack-the-premise/SKILL.md).** Two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it.
- **[Subtract Before You Add](../principle-subtract-before-you-add/SKILL.md).** Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **[Minimize Reader Load](../principle-minimize-reader-load/SKILL.md).** Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **[Outcome-Oriented Execution](../principle-outcome-oriented-execution/SKILL.md).** Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states.
- **[Experience First](../principle-experience-first/SKILL.md).** Product, UX, or feature-scope tradeoffs. Choose user delight over implementation convenience.
- **[Exhaust the Design Space](../principle-exhaust-the-design-space/SKILL.md).** A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- **[Build the Lever](../principle-build-the-lever/SKILL.md).** Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand. The tool is the artifact a reviewer reruns.

**Architecture**

- **[Model the Domain](../principle-model-the-domain/SKILL.md).** Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
- **[Boundary Discipline](../principle-boundary-discipline/SKILL.md).** Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **[Type System Discipline](../principle-type-system-discipline/SKILL.md).** Designing types or a signature in any typed language. Make illegal states unrepresentable, brand primitives, parse external data at boundaries.
- **[Make Operations Idempotent](../principle-make-operations-idempotent/SKILL.md).** Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **[Migrate Callers Then Delete Legacy APIs](../principle-migrate-callers-then-delete-legacy-apis/SKILL.md).** Introducing a new internal API while old callers exist. Migrate and delete in one wave.
- **[Separate Before Serializing Shared State](../principle-separate-before-serializing-shared-state/SKILL.md).** Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first.

**Verification**

- **[Prove It Works](../principle-prove-it-works/SKILL.md).** After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **[Fix Root Causes](../principle-fix-root-causes/SKILL.md).** Debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.
- **[Sequence Work into Verifiable Units](../principle-sequence-verifiable-units/SKILL.md)** (**principle-sequence-verifiable-units**). Multi-step work (sweeps, migrations, runs of similar edits) and how you stack commits and PRs. Break work into small units that each end in a check, verify each before the next, and order delivery so the sequence proves itself.
- **[Test Behavior, Not Implementation](../principle-test-behavior-not-implementation/SKILL.md).** Writing, changing, or keeping a test. Assert what the code's users can observe, so the test fails when that behavior breaks and keeps passing when only the internals change.
- **[Explain the Number](../principle-explain-the-number/SKILL.md).** Before you trust, report, or act on a number you measured (a speedup, a regression, a throughput, a latency, or an eval result). Find what limits it, and rule out that it measured something other than the work you think.

**Delegation**

- **[Guard the Context Window](../principle-guard-the-context-window/SKILL.md).** Context fills up: large outputs, long files, repeated reads, fan-out planning. Reduce bulk through permitted tools or authorized read-only delegates; keep bounded summaries in the main thread.
- **[Never Block on the Human](../principle-never-block-on-the-human/SKILL.md).** Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human course-correct.

**Meta**

- **[Encode Lessons in Structure](../principle-encode-lessons-in-structure/SKILL.md).** You catch yourself writing the same instruction a second time. Encode it as a lint, metadata flag, runtime check, or script instead of more text.

## Execute and report

Use the tools actually exposed by Pi. Read through read; edit existing files through edit; create new files through write. Search with ffgrep/fffind when available, otherwise grep/find. Use ls for directory listings. Reserve bash for execution, Git, package management, and permitted file management. Follow stricter local tool rules. Batch independent reads and limit large command output with codemode when available. If an essential tool is absent, report the missing capability instead of bypassing restrictions.

For nontrivial changes keep a brief plan in the response or the existing task tool. Retain skipped steps with a reason. State the blocking checks, independent work, shared state, and smallest safe decomposition; n/a with a reason is valid. A single writer is enough when the files share one dependency boundary.

Verify the actual behavior through the appropriate interface. For browser or CLI work use the operator's available driver and its instructions. A build, successful resource load, or delegate's report alone does not prove behavior. Do not invent a browser capability.

Write concise, concrete prose. Explain the consumer-visible result first, then choices, evidence, remaining work, and blockers. Separate measured results from inference. Include actual check commands and exit codes. Follow any project delivery format. Do not open a PR or make a commit merely to satisfy a playbook.

## Writing the reply

Write the reply clean as you draft it. A cleanup pass after drafting does not remove these patterns.

- **Short declarative sentences.** One thought per sentence, ended with a period.
- **No long-dash character anywhere.** Write a file-list bullet as a sentence ("`main.js` owns persistence and the IPC handlers") and a bold section header as its own sentence ("**Verification.** End to end via CDP").
- **A colon as a mid-sentence connector is also out** (unslop rule 14). A colon before a list is fine.
- **Terse is not an excuse to drop content.** Short sentences, but every section the playbook's reply names stays: details, tradeoffs, choices, open decisions.
- **Frame impact for the consumer and the maintainer.** Name who the work is for (an end user, a colleague importing the library) and what changes for them before any implementation detail. Then what the next engineer who owns this code inherits. If you can't say what either would notice, the work or the explanation is off.
- **Never fabricate a link, citation, or transcript reference.** Link only artifacts you produced or read this session.
- **Every claim carries its evidence or its label in the same sentence.** Measured, inferred, or guess. A prediction or an unseen cause is a guess. Never hand the human a check you could run.

Every playbook ends with a reply written this way. Include a PR link only when it actually exists and was read or produced this session. Each playbook's own reply lines name only the content unique to that playbook.

## Comments

Comments follow the same rule as the reply. Write them clean as you go. Keep a comment only for a non-obvious *why* the code can't show. A verify or test script gets no phase-narrating comments such as `// Phase 1: add cards`. The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`. This applies to every file you produce, including the delegate's diff.


## Substitute routes

The following upstream integrations retain local alternatives. These are real entry paths, not claims that Cursor automation or cloud hosting is implemented. Registry disposition stays pending until integration acceptance.

| Upstream item | Existing Pi route and boundary |
|---|---|
| reproduce-and-fix-issues | [Bug fix](playbooks/bug-fix.md) reproduces a named issue locally. Fetch only available authorized issue evidence; no automatic Slack/Linear intake or external reply. |
| setup-benny | [Pi adapter](../../adapters/pi/harness.md) documents project instructions, tools and role configuration. Prepare explicit project-local setup; no Benny installation or webhook provisioning. |
| triage-issue-reports | [Investigation](playbooks/investigation.md) produces a local, cited issue classification from supplied reports or available authorized readers. Posting the classification requires permission. |
| automate-me | [Autonomous run](playbooks/autonomous-run.md) and [Show me your work](../show-me-your-work/SKILL.md) provide a bounded run and local evidence. Personal habit mining uses only a named authorized session, never a broad private-history scan. |
| make-bot-ui | [Feature](playbooks/feature.md) builds the authorized UI with the operator’s available browser driver. A local page does not supply a Cursor cloud bot or webhook service. Remote credentials, deployment and messages require separate authority. |
| recall | [Session pickup](playbooks/session-pickup.md) resumes a named Pi session or branch. [Ketchup](../ketchup/SKILL.md) catches up only this conversation. Neither implies access to unrelated history. |
| setup-pstack | The existing /setup-pstack extension command and [Pi adapter](../../adapters/pi/harness.md) configure exact available models. Inspect actual dispatch before claiming a role is effective. |
| authoring-a-skill and create-skill | Use the [Pi adapter](../../adapters/pi/harness.md) mapping and installed Pi skills docs. Inspect an existing discovered skill, write project-local SKILL.md frontmatter and grounded instructions with native file tools, validate discovery after /reload, and run representative should-trigger/should-not-trigger tasks plus the motivating behavior. No private Cursor authoring helper is required. |
| eval | [Benchmark checklist](../benchmark-checklist/SKILL.md) and [Create verification skill](../create-verification-skill/SKILL.md) supply observable harness contracts. Freeze scenarios, include negative cases, repeat trials across available models, inspect actual tool/artifact behavior, and separate inconclusive from passing results. No cloud transcript evaluator is implied. |
| deslop | [Laziness protocol](../principle-laziness-protocol/SKILL.md), [No comments](../no-comments/SKILL.md) and the actual task diff provide the local cleanup route. Remove only task-introduced churn, redundant wrappers and prose clutter; preserve user changes and rerun the relevant behavior check. |
| control-ui and control-cli | [Create verification skill](../create-verification-skill/SKILL.md) interviews the repo for an actual driver and proof path. Follow the operator’s browser skill where available; otherwise report the missing driver. CLI verification uses a repo harness or isolated PTY with readiness, action/result evidence and PID-based teardown. |

The restored [How](../how/SKILL.md), [Poteto help](../poteto-help/SKILL.md), [Figure it out](../figure-it-out/SKILL.md), [Blast radius](../blast-radius/SKILL.md), [Benchmark checklist](../benchmark-checklist/SKILL.md), [Teach](../teach/SKILL.md), [Show me your work](../show-me-your-work/SKILL.md), [Create verification skill](../create-verification-skill/SKILL.md), [Maintain verification skill](../maintain-verification-skill/SKILL.md), [Runtime forensics](playbooks/runtime-forensics.md), [Trace forensics](playbooks/trace-forensics.md) and [Visual parity](playbooks/visual-parity.md) now own their method instructions. Structural generation and prompt contracts alone do not prove live model adherence.
