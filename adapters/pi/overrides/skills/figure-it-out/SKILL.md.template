---
name: figure-it-out
description: "Design an auditable playbook when no narrower one fits: a large migration, an ambitious multi-part change, or work a human reviews after stepping away. Scales rigor to the task, runs a hypothesis loop, and logs decisions. Use for /figure-it-out or 'figure it out'."
disable-model-invocation: true
license: MIT
---

# Figure it out

When the task matches no playbook, design one. The deliverable before any code is the workflow itself: a sequence of phases that scales rigor to the task, runs the scientific method, and leaves a decision trail a human can audit after stepping away.

## Start

Open a todolist whose first item is to read the Principles section of the [poteto-mode](../poteto-mode/SKILL.md) skill. Then add the phases below as todos.

## Phase A: Frame

Ground first, then commit to the workflow. Git commits require separate authorization. Don't start the run until you can state:

- The definition of done as a falsifiable predicate (the **prove-it-works** principle skill).
- Scope, quantified: rough units and effort, plus the blockers grounding surfaced.
- The rigor level, biased high. One-way doors and high blast radius get more. Reversible low-stakes steps get less. Rigor is gates and artifacts, not "try harder".

Present the framing and tradeoffs before committing to a long run. Reversible work proceeds (the **never-block-on-the-human** principle skill), but a multi-hour run earns one checkpoint unless the operator already authorized the plan or an autonomy grant covers it.

## Phase B: Design the workflow

Decompose into atomic, independently-landable units. Sequence riskiest-unknown-first. Scaffold and verification come before features (the **foundational-thinking** principle skill).

- Build the verification harness before the work, with the baseline captured from the pre-change state, so the check reads as "old value vs new value".
- For one-way-door design decisions, run the [architect](../architect/SKILL.md) skill (it runs **arena**). Skip it for mechanical work whose shape is already concrete. A second arena over a settled design is over-engineering (the **laziness-protocol** principle skill).
- Decide what fans out. Parallelize only across seams, and give each worker its own worktree or branch (the **separate-before-serializing-shared-state** principle skill). Don't over-fan. Honor Pi delegation authorization and installed model settings.
- Write the designed phase list down. That list is what the human reviews.

Then execute the design. Add its steps to the todolist as concrete items between the Phase C and Phase D entries. Run each under the Phase C loop discipline, and weave the Phase D log through them, a row as each step lands, rather than saving the whole trail for the end.

## Phase C: Run the loop

Each unit is an experiment. State the hypothesis, make the smallest change, measure against the predicate on the real artifact, keep it if it advanced, undo only your own isolated experimental change if it did not. Apply the **sequence-verifiable-units** principle skill, verifying each unit before starting the next instead of batching checks at the end.

- Verify by inspecting the artifact, never a self-report. When something passes too easily, suspect the observation method before the system.
- Pair delegated work with a judge. If a worker games the gate, reject that result and harden the contract. If the gate itself is wrong, fix the gate in its own change rather than routing around it.
- A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. Inconclusive is not a pass. Don't hide a negative.

## Phase D: Keep the audit trail

Log the run via the [show-me-your-work](../show-me-your-work/SKILL.md) skill. figure-it-out's work is usually ambitious enough to propose committing the trail when commits are authorized so the reviewer can read it in the PR. The trail plus the diff is what lets the human come back and trust the work.

## Phase E: Verify and hand back

Check the whole against the Phase A predicate on the real product, not just the harness. Encode any recurring correction as a gate, a lint rule, a check, or a script (the **encode-lessons-in-structure** principle skill).

**Reply:** the playbook you designed, the rigor level and why, the decision-trail path, what's verified against the predicate, and what's still open.

## Pi execution and authority

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires operator or applicable project authorization and an available pi-subagents integration. Otherwise perform the same stages sequentially and label the result self-review rather than independent review. Read the installed integration’s public instructions before launching. Use pstack.poteto-agent for isolated candidate writers and pstack.comment-sicko with its actual read-only allowlist for file reviewers. Keep one writer per directory. A source investigator may use only explicitly available read-only connectors; lack of connector access is a gap, never a reason to grant write tools.

Honor the operator’s configured roles and supported reasoning levels. Runtime-registered pstack agents bind their models through /setup-pstack: pstack.poteto-agent uses code, pstack.comment-sicko uses review, pstack.verifier uses verification, and pstack.prose-writer uses prose. This binding applies to direct calls and workflow children, including subagent({ workflow: "parallel", args: { tasks: [{ agent: "pstack.<agent>", task: "<brief>" }] } }). Do not put model in a task item or on the outer call; user subagents.agentOverrides may override the agent’s model and thinking. Do not invent per-skill configuration keys. Preserve model diversity where available; report when configured seats share a model. A rejected model stops that seat and is reported; never silently choose a fallback. Do not launch a child without authorization. Await native completion notices, not polling.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
