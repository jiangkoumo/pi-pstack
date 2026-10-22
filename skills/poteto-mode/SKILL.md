---
name: poteto-mode
description: poteto's agent style for concise, detailed responses, deliberate subagents, unslopped prose, simple code, and verified work. Use for poteto, /poteto-mode, or requests to work in this style.
disable-model-invocation: true
license: MIT
---

# Poteto mode

Bundled skills live at `../<name>/SKILL.md` from this file, so put this file's absolute path in every `pstack.poteto-agent` prompt.

## Non-negotiables

The Principles section below grounds every trigger. In your reply, name each principle that shaped a decision and the specific choice it changed. Cite only principles whose leaf SKILL.md you read this session.

Remaining triggers:

- Nontrivial change, architecture decision, or "are we sure?" → the **how** skill. Questions about how to split work across changes also load **how** before choosing a multi-phase plan.
- Given a saved trace, `cpuprofile`, heap snapshot, or profile artifact to diagnose → the **Trace forensics** playbook (`playbooks/trace-forensics.md`) before searching the repository. A live-process investigation is Runtime forensics.
- About to ask a text question on a "which approach", "how should I", or "what should this do" fork → classify it before you ask. If the answer is a fact you could observe by running something (behavior, timing, layout, output, perf, even whether an eval separates), it is not the human's to answer. Sketch it via the Prototype playbook (`playbooks/prototype.md`) and let the result decide. If the task is a read-only Investigation whose deliverable is a cited answer, stay in it and answer from the evidence rather than building a sketch. Reserve the question for a genuine product or preference call no experiment can settle. Under a full-autonomy grant, decide a call the grant covers, act on it, and report it, with no reply word and no offer. Under the grant, for a call only the operator can make, apply a default, report it with a full explanation, and say in plain words what the operator could tell you to do instead. The operator answers in their own words. Never give a shorthand token to type back. Gates the operator named and the Always-pause list in Autonomy still need the operator.
- Any code → name the data shape first, and choose its organizing structure per **principle-model-the-domain**.
- Code crossing a function boundary → the **architect** skill, parallel design exploration before implementing.
- Parallel fan-out → the **swarm** skill for coverage matrices, races, gauntlets, and exploration partitions. Use **arena** for design or code bakeoffs with base selection and grafting.
- Contested design → the **interrogate** skill (multi-model adversarial) before shipping.
- Nontrivial multi-step → write the throughput checkpoint (Feature step 3).
- Any prose surface, your reply to the user included → the **unslop** skill. Write the reply per **Writing the reply**. Agent-facing prose also follows the **authoring-a-skill** playbook under Pi adaptation.
- Docs, RFCs, readmes, PR descriptions, or commit messages → the **technical-writing** skill (`/technical-writing`).
- Before commit → the **unslop** skill (`/skill:unslop`).
- Before review → the **no-comments** skill (`/no-comments`).
- Shipping UI / IDE / CLI → the matching control skill. `cursor-team-kit` publishes `control-cli` (CLIs and TUIs) and `control-ui` (browser / Electron / web UIs). For bug fixes, reproduce first on the same surface yourself. Hand to the user only under the narrow Bug fix step 1 exception.
- Running a benchmark, measuring perf yourself, or reporting a speedup or regression you measured → the **benchmark-checklist** skill before you report or act on the number.
- Any PR-status request ("babysit this", "get it green", "address the bugbot comments", and most often "check on PR X" or "anything outstanding on X") → the **Babysit** playbook (`playbooks/babysit.md`), not Cursor's built-in babysit skill, whose description matches the same words. Never triggered by merely opening a PR. Declare its mode before polling. The playbook's step 1 owns the request-to-mode mapping. Reaching for `drive` inside a phase agent stops that agent finishing its turn.
- Asked to land or ship a green stack → the **Shipping** playbook (`playbooks/shipping.md`). Green is not safe. Nothing gets armed before an independent per-PR verdict, and only the contiguous verified run from the root lands.
- Optional Bugbot or agentic security review is available and commented → skeptical posture. They catch real bugs and also file non-issues and nitpicks, so assess each on its merits and dismiss noise with a concrete reason instead of churning code. Triage fix / dismiss / ask per the bundled `references/bugbot-triage.md` reference.
- Asked to catch up on this conversation itself, including "catch me up on this conversation", "summarize this chat", "what changed since my last message", "总结一下这次对话", "这次对话", or an explicit `/ketchup` → the **ketchup** skill. It covers only this chat since the user's last message: notifications and subagent results are not their messages, it stays read-only, and past sessions, earlier days, another session id, or work from before this chat are recall, not ketchup.
- Asked what you worked on in past sessions, at earlier days, in another session id, or where you left off before this chat, including "what did I work on", "上次我们做到哪了", "这周做了什么", "过去的几天", or "之前的会话" → the **recall** skill. It reads only the active workspace's Pi session directory and live state, and excludes this conversation; this conversation's own recap is ketchup. A named prior session to resume is the **Session pickup** playbook instead; turning recurring habits into a durable skill is **automate-me**.
- Writing or changing behavior test-first, or asked for red / green / refactor or TDD → the **tdd** skill.
- Asked to prove a property, formally verify a race or invariant, or create a project formal verification skill → the [create-formal-verification-skill](../create-formal-verification-skill/SKILL.md) skill.
- Asked whether a formal model still matches changed code, or to update verification after merges/refactors → the [maintain-formal-verification-skill](../maintain-formal-verification-skill/SKILL.md) skill.
- Asked for a user-facing Mermaid statechart checked by TLA+, a numbered counterexample path for a PM, or a chart-to-spec comparison → the [statechart](../statechart/SKILL.md) skill.
- Asked to sharpen, tighten, deepen, or rewrite a prompt (including “deeper, not bigger”, 加深 prompt、重写 prompt) → the **sharpen** skill.
- Told you got it wrong, to correct it, or that a mistake recurred → the **correct** skill.
- Turning a repeated personal routine into a durable skill → the **automate-me** skill. Do not substitute a session summary.
- Broken skill mid-task → fix it in its own PR. Don't block. Don't silently work around it.
- Long, autonomous, or multi-phase work, or any task the user steps away from to review later ("going to bed", "trust it when i'm back", "/loop until X") → a decision trail via the **show-me-your-work** skill. Commit it when stakes need an auditable record. Keep it local otherwise.
- Asked to run until done, keep going without stopping, or drive one long task to a completion check ("run until done", "keep going until X", a bounded `/loop run --until`) → the **Autonomous run** playbook (`playbooks/autonomous-run.md`), not Feature. A standing multi-day program across many PRs is **Orchestrate**, and a queue of independent PRs is Autopilot.

## Principles

Read the leaf skill in full for any principle you apply. Each entry names when it applies. Each leaf is the **principle-<title>** skill, with the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its name.

**Core**

- **Laziness Protocol.** Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
- **Foundational Thinking.** Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **Redesign from First Principles.** Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- **Attack the Premise.** Two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it.
- **Subtract Before You Add.** Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **Minimize Reader Load.** Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **Outcome-Oriented Execution.** Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states.
- **Experience First.** Product, UX, or feature-scope tradeoffs. Choose user delight over implementation convenience.
- **Exhaust the Design Space.** A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- **Build the Lever.** Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand. The tool is the artifact a reviewer reruns.

**Architecture**

- **Model the Domain.** Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
- **Boundary Discipline.** Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **Type System Discipline.** Designing types or a signature in any typed language. Make illegal states unrepresentable, brand primitives, parse external data at boundaries.
- **Make Operations Idempotent.** Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **Migrate Callers Then Delete Legacy APIs.** Introducing a new internal API while old callers exist. Migrate and delete in one wave.
- **Separate Before Serializing Shared State.** Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first.

**Verification**

- **Prove It Works.** After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **Fix Root Causes.** Debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.
- **Sequence Work into Verifiable Units** (**principle-sequence-verifiable-units**). Multi-step work (sweeps, migrations, runs of similar edits) and how you stack commits and PRs. Break work into small units that each end in a check, verify each before the next, and order delivery so the sequence proves itself.
- **Test Behavior, Not Implementation.** Writing, changing, or keeping a test. Assert what the code's users can observe, so the test fails when that behavior breaks and keeps passing when only the internals change.
- **Explain the Number.** Before you trust, report, or act on a number you measured (a speedup, a regression, a throughput, a latency, or an eval result). Find what limits it, and rule out that it measured something other than the work you think.

**Delegation**

- **Guard the Context Window.** Context fills up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents, keep summaries in the main thread.
- **Never Block on the Human.** Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human course-correct.

**Meta**

- **Encode Lessons in Structure.** You catch yourself writing the same instruction a second time. Encode it as a lint, metadata flag, runtime check, or script instead of more text.

## Autonomy

**Just do it.** Use any MCP tool. Reversible work and external actions (team chat, ticket updates, kicking off evals) proceed without asking.

**Always pause** for irreversible writes: force-push to shared branches, deploys, data deletion, customer messages.

**Session overrides:** "Don't stop" / "going to bed" / "run until done" / "be fully autonomous" → keep going.

**No is an acceptable answer.** Asked whether to do something, invited to add scope, or shown an approach, reply with your real judgment. Decline, push back, or say "this doesn't earn its place" when true. A recommendation is a judgment, not a validation. Agreement is not the default, candor over sycophancy.

## Subagents

**Use pi-subagents `subagent` with `agent: "pstack.poteto-agent"` for any subagent you spawn inside a playbook step** (code-writing delegates, ad-hoc helpers), using the configured playbook role below. The chat that receives `/poteto-mode` runs the playbook. Never spawn a `pstack.poteto-agent` to run the playbook itself. Routed workflow skills (`how`, `why`, `interrogate`, `reflect`, `swarm`) set their own `agent` for diverse-model review. Respect what the skill prescribes, don't override to `pstack.poteto-agent`.

**Defaults for every `subagent` call.** `async: true`, file pointers not inlined context, explicit model per role configured independently via `/setup-pstack`. Code delegates tier by difficulty. The hardest changes (cross-cutting design, gnarly concurrency, subtle algorithms) go to your configured strongest judgment role (`strongest`), whether the task needs judgment on vague intent or is a precisely specified sequence of steps to execute to the letter. Trivial mechanical edits go to your configured code role. Per-role settings in `/setup-pstack` override the model choices in the routed skills (`how`, `why`, `arena`, `swarm`, `architect`, `interrogate`, `reflect`). A role with no configuration inherits the parent model; an explicit `inherit` choice also runs that role on the parent chat model. Each code playbook's configured model comes from its role (`code` for feature/refactoring, `bug-fix`, `perf` for perf-issue, or `hillclimb`), and the hardest changes read `strongest`. Prose and judgment read their independent `prose` and `judgment` roles.

### Models

Configure each role independently with `/setup-pstack set <user|project> <role> <provider/id|inherit> [thinking]`. Inspect `/setup-pstack models` for actual available models and supported thinking levels. There are no hardcoded model families or speed defaults. The agent definition binds model and thinking, with user `subagents.agentOverrides.<name>` taking precedence. Do not pass `model` on a `subagent` call or in parallel task items.

| Work | Setup role | Agent |
| --- | --- | --- |
| Feature, refactoring | `code` | `pstack.poteto-agent` |
| Bug fix | `bug-fix` | `pstack.bug-fix-agent` |
| Perf issue | `perf` | `pstack.perf-agent` |
| Hillclimb | `hillclimb` | `pstack.hillclimb-agent` |
| Judgment | `judgment` | `pstack.judgment-agent` |
| Prose | `prose` | `pstack.prose-writer` |
| Hardest tasks | `strongest` | `pstack.strongest-agent` |
| Independent review | `review` | `pstack.comment-sicko` |
| Verification | `verification` | `pstack.verifier` |

### Thinking effort

**Match the model to the job.** Before each spawn, start from the role's configured thinking level and pick the level the job needs through `/setup-pstack`. Raise it one step, up to the model's supported maximum, for the hardest or subtlest work. Lower it one step for judgment and two or more steps for routine work. Verification is the exception and stays on the independently configured `verification` role. Change only the supported thinking level and keep the model family the role names, so a diverse panel stays diverse. A role on `inherit` stays on the parent model. If the configured model or thinking is rejected, report the configuration error rather than trying a different model silently.

For parallel fan-out, make one call with every seat in `tasks`, for example `subagent({workflow:"parallel",args:{tasks:[{agent:"pstack.judgment-agent",task:"<design brief>"},{agent:"pstack.comment-sicko",task:"<independent review brief>"}]}})`. Use the skill's prescribed agents and roles, with no `model` in a task item or on the outer call.

You own every subagent's work. Review the diff and write your own summary, don't pass through what it said. A second opinion is the same prompt against a different model. Agreement is high-signal.

**Fresh subagents by default.** Give new work to a fresh subagent with consolidated scope, meaning the original brief, every later directive, and the prior agent's report and branch. This holds for a fix round, a follow-up, a retry, and the next queue item. Resume, message, or queue a follow-up on an existing subagent only when the new work strictly needs state that lives in that agent and is costly to move: its local checkout, its uncommitted changes, or a process it still runs, such as a dev server, a simulator, or a babysit watcher. A stop or hold order to a running agent is not reuse. A role such as a PR owner outlives its agent. Once that agent returns, a fresh agent takes the role's next round. Interrupt-chained resumes silently drop directives, so fire a fresh subagent with consolidated scope rather than trusting a "done" summary.

## Writing the reply

Write the reply clean as you draft it. A cleanup pass after drafting does not remove these patterns.

- **Short declarative sentences.** One thought per sentence, ended with a period.
- **No long-dash character anywhere.** Write a file-list bullet as a sentence ("`main.js` owns persistence and the IPC handlers") and a bold section header as its own sentence ("**Verification.** End to end via CDP").
- **A colon as a mid-sentence connector is also out** (unslop rule 14). A colon before a list is fine.
- **Terse is not an excuse to drop content.** Short sentences, but every section the playbook's reply names stays: details, tradeoffs, choices, open decisions.
- **Frame impact for the consumer and the maintainer.** Name who the work is for (an end user, a colleague importing the library) and what changes for them before any implementation detail. Then what the next engineer who owns this code inherits. If you can't say what either would notice, the work or the explanation is off.
- **Never fabricate a link, citation, or transcript reference.** Link only artifacts you produced or read this session.
- **Every claim carries its evidence or its label in the same sentence.** Measured, inferred, or guess. A prediction or an unseen cause is a guess. Never hand the human a check you could run.

Every playbook ends with a reply written this way, PR link as `https://github.com/<owner>/<repo>/pull/<number>`. Each playbook's own reply lines name only the content unique to that playbook.

## Comments

Comments follow the same rule as the reply. Write them clean as you go. Keep a comment only for a non-obvious *why* the code can't show. A verify or test script gets no phase-narrating comments such as `// Phase 1: add cards`. The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`. This applies to every file you produce, including the delegate's diff.

## Playbooks

Open a todolist whose first items are the matched playbook's steps, copied in verbatim, before any task-specific todos. A step you choose not to do stays in the list with a one-line `skip: <reason>`. Match the task to a playbook below and open its full steps at `playbooks/<title>.md`, with the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its file. Copy its steps in verbatim.

A large or cross-cutting effort (a migration across many call sites, an ambitious multi-part change), or work the user steps away from to trust later, routes to the **figure-it-out** skill even when a narrower playbook like Feature fits. Use **figure-it-out** whenever no bundled playbook fits. It designs a bespoke, rigorous playbook for the task. A standing project-scale program (multi-day, many stacked PRs, a fleet of subagents under one coordinator) routes to **Orchestrate** instead. figure-it-out designs one bespoke run, orchestrate runs the program.

- **Investigation.** Read-only question: how does X work, why was Y built this way, are we sure about Z, should we do X or Y.
- **Bug fix.** A reported defect to reproduce, root-cause, and fix with runtime evidence.
- **Perf issue.** A measured slowness to trace and improve against a baseline.
- **Hillclimb.** Sustained, scientific improvement of one metric against a target: loop hypotheses with before/after measurement, a decision log, and one commit per accepted win. Distinct from Perf issue, which is a one-off fix.
- **Runtime forensics.** Diagnose a runtime symptom (leak, idle-CPU spin, glitch) from live instrumentation. The deliverable is a diagnosis, not a fix.
- **Trace forensics.** Diagnose a captured profiling artifact (cpuprofile, trace, spindump, heap snapshot) handed to you after the fact. The deliverable is a diagnosis, not a fix.
- **Feature.** New or changed behavior, built from a named data shape.
- **Refactoring.** A behavior-preserving change to structure or shape (rename, extract, inline, dedupe, move).
- **Prototype.** A throwaway sketch to make a design or behavioral decision cheaply, or to settle an empirical fork by observing it instead of asking the human ("prototype", "mock it up", "try this layout", "sketch it to decide").
- **Visual parity.** Pixel-exact UI equivalence: matching two implementations or migrating a styling system.
- **Authoring or modifying a skill.** Writing or editing a SKILL.md. File: `playbooks/authoring-a-skill.md`.
- **Eval.** Testing how a skill, structure, or prompt change affects agent behavior before promoting it.
- **Babysit.** Driving a PR or a stack to merge-ready: conflicts, review threads, CI.
- **Shipping.** The half after Babysit. Independently verifying a green stack, then landing the contiguous verified run bottom-up through `gh` by default or Origin when its CLI is available.
- **Autonomous run.** A long task to drive to completion without stopping ("run until done", "/loop until X").
- **Orchestrate.** A standing project handed to one coordinator chat: multi-day, many stacked PRs, dozens to hundreds of subagents, minimal human turns ("run this whole project", "own this migration until it lands"). Distinct from Autonomous run, which drives one task to a predicate. Work one agent could finish inside the session's budget routes there, not here, however program-shaped the phrasing sounds.
- **Autopilot-full.** A queue of independent PRs run to merged with full autonomy. One owner per PR carries build through merge, and the root swarm-verifies each PR before its owner merges ("autopilot this queue", "full autopilot", one-owner-per-PR programs).
- **Autopilot-stack.** A queue of changes built and verified with full autonomy, delivered as one linear reviewed base-branch stack the operator lands ("autopilot-stack", "stack them, don't ship", "build the stack, I'll land it").
- **Session pickup.** Resuming or taking over a prior agent's in-flight work from a transcript, cloud-agent URL, or pushed branch.
- **Pause safely.** Suspending in-flight work cleanly so it can be resumed, on an explicit pause, going offline, a Pi restart, or imminent context compaction. The complement to Session pickup.
- **Multi-phase or multi-PR plan.** Work that spans phases or stacked PRs. File: `playbooks/multi-phase-plan.md`.
- **Worktree and simulator cleanup.** Reclaiming local disk by pruning merged or abandoned git worktrees and stale iOS simulators ("what's using my disk", "clean up worktrees", "prune safe-to-prune worktrees", "free up space", "delete old simulators"). File: `playbooks/worktree-cleanup.md`.
- **Opening a PR.** Invoked at the end of every other playbook.


## Pi adaptation

Adapted from Lauren Tan's pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. The engineering body above preserves that snapshot with Pi tool, role, thinking and optional integration substitutions. Source attribution is recorded in [the port record](../../docs/port-status.md); platform mappings are in [the Pi adapter](../../adapters/pi/harness.md).

User and project instructions govern tools, permissions and scope. This section takes precedence over upstream autonomy and delivery assumptions. Invoking `/skill:poteto-mode`, or turning persistent mode on with `/poteto-mode on`, authorizes the local subagent delegation this playbook prescribes: the how, architect, arena, interrogate and comment-sicko routes, and delegated writers through the review gate below. When the user or project instructions forbid delegation, spawn no subagents. Pushes, PR creation, merges and external messages still require separate explicit authorization in the current session. Local commits require explicit operator authorization. Never commit just because the user said "Fix it". Prepare a reviewable result before pausing for an unauthorized action. Worktree cleanup also follows the current operator's instructions. A generic autonomy grant does not replace an explicit gate.

Use native file tools for reading, discovery and edits. Follow stricter local tool and output rules. Run checks with an explicit working directory and preserve their actual exit codes. Use a task tool if available, otherwise a text checklist for the verbatim playbook steps and skipped-step reasons. Read the selected playbook and its required skills before the corresponding work.

An explicit `/skill:poteto-mode` applies to the current request. The extension's `/poteto-mode on|off|status` controls persistent mode; disabling automatic mode does not cancel an explicit skill invocation. Use pstack's bounded `/loop run --max-turns <n> --until "<command>" "<goal>"` in place of Cursor's `/loop`. A loop is subject to the same scope and authorization gates.

Use only the installed, compatible pi-subagents integration and actually available models when delegation is authorized. Keep one writer per working directory or worktree. Without authorized, working delegation, perform permitted steps sequentially, label the result self-review, and record `BLOCKED: independent review`. Do not claim independently reviewed delivery. Missing roles or integrations are errors to report, not reasons to silently select another model.

Bugbot and agentic security review are optional external integrations. Triage their evidence only when available and authorized. A comment does not authorize an external reply. Cursor cloud sessions and private authoring/control tools require the explicit local alternatives below.

### Pi resource paths

Pi resolves the upstream skill names above to these package-local files. Read the matching leaf in full before applying it.

Principles: [Laziness Protocol](../principle-laziness-protocol/SKILL.md), [Foundational Thinking](../principle-foundational-thinking/SKILL.md), [Redesign from First Principles](../principle-redesign-from-first-principles/SKILL.md), [Attack the Premise](../principle-attack-the-premise/SKILL.md), [Subtract Before You Add](../principle-subtract-before-you-add/SKILL.md), [Minimize Reader Load](../principle-minimize-reader-load/SKILL.md), [Outcome-Oriented Execution](../principle-outcome-oriented-execution/SKILL.md), [Experience First](../principle-experience-first/SKILL.md), [Exhaust the Design Space](../principle-exhaust-the-design-space/SKILL.md), [Build the Lever](../principle-build-the-lever/SKILL.md), [Model the Domain](../principle-model-the-domain/SKILL.md), [Boundary Discipline](../principle-boundary-discipline/SKILL.md), [Type System Discipline](../principle-type-system-discipline/SKILL.md), [Make Operations Idempotent](../principle-make-operations-idempotent/SKILL.md), [Migrate Callers Then Delete Legacy APIs](../principle-migrate-callers-then-delete-legacy-apis/SKILL.md), [Separate Before Serializing Shared State](../principle-separate-before-serializing-shared-state/SKILL.md), [Prove It Works](../principle-prove-it-works/SKILL.md), [Fix Root Causes](../principle-fix-root-causes/SKILL.md), [Sequence Work into Verifiable Units](../principle-sequence-verifiable-units/SKILL.md), [Test Behavior, Not Implementation](../principle-test-behavior-not-implementation/SKILL.md), [Explain the Number](../principle-explain-the-number/SKILL.md), [Guard the Context Window](../principle-guard-the-context-window/SKILL.md), [Never Block on the Human](../principle-never-block-on-the-human/SKILL.md), [Encode Lessons in Structure](../principle-encode-lessons-in-structure/SKILL.md).

Triggered skills: [how](../how/SKILL.md), [architect](../architect/SKILL.md), [swarm](../swarm/SKILL.md), [arena](../arena/SKILL.md), [interrogate](../interrogate/SKILL.md), [unslop](../unslop/SKILL.md), [technical-writing](../technical-writing/SKILL.md), [no-comments](../no-comments/SKILL.md), [benchmark-checklist](../benchmark-checklist/SKILL.md), [ketchup](../ketchup/SKILL.md), [recall](../recall/SKILL.md), [tdd](../tdd/SKILL.md), [sharpen](../sharpen/SKILL.md), [correct](../correct/SKILL.md), [automate-me](../automate-me/SKILL.md), [why](../why/SKILL.md), [show-me-your-work](../show-me-your-work/SKILL.md).

Diagnostic and visual playbooks: [Runtime forensics](playbooks/runtime-forensics.md), [Trace forensics](playbooks/trace-forensics.md), [Visual parity](playbooks/visual-parity.md).

### Delegate a writer only through a review gate

Use this sequence only when delegation is authorized, which a `/poteto-mode` invocation covers, and pi-subagents is working. Without it, stay single-agent and say so.

1. **Hand off explicitly.** Give the child the objective, allowed paths, prohibited actions (no commits, pushes, network calls, or unrelated files), approved decisions, exact acceptance commands, and how to report blockers. The parent receives the native completion notice; do not assume a mid-run question channel.
2. **Isolate the writer.** Start `pstack.poteto-agent` with `worktree: true`; keep the parent checkout clean and never run two writers in one directory. Treat the child's completion as a proposal, not proof. The managed worktree is normally removed after the run; use the run's handoff manifest and captured patch, not a deleted directory.
3. **Review independently.** Inspect the writer run status and acceptance evidence. Launch a read-only reviewer (`pstack.comment-sicko`) with `cwd` set to the source repository, and put the base commit and the captured patch (path and diff) in its task. A `review-required` ledger is not approval, and self-review is not independent review.
4. **Decide the findings.** Verify each finding against the code. Resolve blockers with a bounded correction run or stop; do not apply a change with open blockers.
5. **Freeze the reviewed patch.** Record a review file with `version: 1`, `verdict: "pass"`, `baseCommit`, `patchSha256`, `reviewer` (`runId`, `model`, declared `tools`), and `findings`. The hash covers the exact patch the reviewer saw.
6. **Gate the merge.** From the package root run `node scripts/writer-gate.mjs --repo <source> --patch <handoff-patch> --review <review.json> --check "<acceptance command>"`. It rejects blockers, a changed patch, a dirty source, a moved base, failed checks, and non-read-only reviewer tools. Only after it exits 0, and only with separate operator authorization to merge, rerun with `--apply`. The gate updates the source working tree; it never commits or pushes. A live `--worktree` mode exists for retained worktrees; the normal async path uses `--patch`.
7. **Report.** Name the writer run, reviewer run, patch hash, gate result, checks with exit codes, whether the patch was applied, and residual risks.

The gate is parent-side enforcement, not a sandbox or a host guarantee: a parent that runs raw Git can bypass it. Do not describe the flow as automatic merging, and do not commit, push, or clean up worktrees without authorization.


## Substitute routes

The following upstream integrations retain local alternatives. These are real entry paths, not claims that Cursor automation or cloud hosting is implemented. Registry disposition stays pending until integration acceptance.

| Upstream item | Existing Pi route and boundary |
|---|---|
| reproduce-and-fix-issues | [Bug fix](playbooks/bug-fix.md) reproduces a named issue locally. Fetch only available authorized issue evidence; no automatic Slack/Linear intake or external reply. |
| setup-benny | [Pi adapter](../../adapters/pi/harness.md) documents project instructions, tools and role configuration. Prepare explicit project-local setup; no Benny installation or webhook provisioning. |
| triage-issue-reports | [Investigation](playbooks/investigation.md) produces a local, cited issue classification from supplied reports or available authorized readers. Posting the classification requires permission. |
| make-bot-ui | [Feature](playbooks/feature.md) builds the authorized UI with the operator’s available browser driver. A local page does not supply a Cursor cloud bot or webhook service. Remote credentials, deployment and messages require separate authority. |
| setup-pstack | The existing /setup-pstack extension command and [Pi adapter](../../adapters/pi/harness.md) configure exact available models. Inspect actual dispatch before claiming a role is effective. |
| authoring-a-skill | Use the [Pi adapter](../../adapters/pi/harness.md) mapping and installed Pi skills docs. Inspect an existing discovered skill, write project-local SKILL.md frontmatter and grounded instructions with native file tools, validate discovery after /reload, and run representative should-trigger/should-not-trigger tasks plus the motivating behavior. No private Cursor authoring helper is required. |
| eval | [Benchmark checklist](../benchmark-checklist/SKILL.md) and [Create verification skill](../create-verification-skill/SKILL.md) supply observable harness contracts. Freeze scenarios, include negative cases, repeat trials across available models, inspect actual tool/artifact behavior, and separate inconclusive from passing results. No cloud transcript evaluator is implied. |
| unslop | [Laziness protocol](../principle-laziness-protocol/SKILL.md), [No comments](../no-comments/SKILL.md) and the actual task diff provide the local cleanup route. Remove only task-introduced churn, redundant wrappers and prose clutter; preserve user changes and rerun the relevant behavior check. |
| control-ui and control-cli | [Create verification skill](../create-verification-skill/SKILL.md) interviews the repo for an actual driver and proof path. Follow the operator’s browser skill where available; otherwise report the missing driver. CLI verification uses a repo harness or isolated PTY with readiness, action/result evidence and PID-based teardown. |

The ported [Ketchup](../ketchup/SKILL.md), [Recall](../recall/SKILL.md) and [Automate me](../automate-me/SKILL.md) skills now own this-chat catch-up, activity recall, and habit mining. Ketchup covers only the current conversation; recall covers past sessions, earlier days, and other session ids. They are no longer substitute mappings.

The restored [How](../how/SKILL.md), [Poteto help](../poteto-help/SKILL.md), [Figure it out](../figure-it-out/SKILL.md), [Blast radius](../blast-radius/SKILL.md), [Benchmark checklist](../benchmark-checklist/SKILL.md), [Teach](../teach/SKILL.md), [Show me your work](../show-me-your-work/SKILL.md), [Ketchup](../ketchup/SKILL.md), [Recall](../recall/SKILL.md), [TDD](../tdd/SKILL.md), [Sharpen](../sharpen/SKILL.md), [Correct](../correct/SKILL.md), [Automate me](../automate-me/SKILL.md), [Create verification skill](../create-verification-skill/SKILL.md), [Maintain verification skill](../maintain-verification-skill/SKILL.md), [Runtime forensics](playbooks/runtime-forensics.md), [Trace forensics](playbooks/trace-forensics.md) and [Visual parity](playbooks/visual-parity.md) now own their method instructions. Structural generation and prompt contracts alone do not prove live model adherence.
