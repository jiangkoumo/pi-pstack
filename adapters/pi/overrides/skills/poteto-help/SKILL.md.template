---
name: poteto-help
description: "Guide users through Pi pstack setup, mode controls, task routing, evidence, and choosing a skill, playbook, or principle. Use for help about pstack."
disable-model-invocation: true
license: MIT
---

# Poteto help

Answer the question, provide a prompt the user can send, and link the file the answer came from. A help question does not start an engineering run. An action request such as “use pstack to fix this bug” does: read [poteto-mode](../poteto-mode/SKILL.md) and carry out the authorized task.

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read each destination before quoting it. The installed resource and [Pi adapter](../../adapters/pi/harness.md) own host behavior; never link a fabricated public page or use floating upstream main as the specification.

## Find out what they need

Infer the need from the message. If unclear, ask one small question covering setup, starting a task, choosing a skill, fixing a drifting run, or personalizing the workflow. Check state only when it changes the answer. A project without a verification harness needs [create-verification-skill](../create-verification-skill/SKILL.md) before agents can prove app behavior. A model question needs `/setup-pstack status` and the actually available catalog, not a guessed configuration file.

## Get set up

The package is installed with Pi’s package mechanism. See the [migration plan](../../docs/migration-plan.md) and [Pi adapter](../../adapters/pi/harness.md). Give installation instructions as instructions; a help request does not authorize installation or global configuration changes.

Optional delegation requires a loaded pi-subagents extension and operator authorization. Single-agent methods remain usable without it. `/setup-pstack` configures exact available models and supported thinking for code/review and the host’s actual supported roles. Saving a role does not prove every workflow applies it. Describe only verified role integration; do not invent architect-runner or panel-list keys.

Cost grows with independent candidates, source investigators and review seats. Explain that cost when asked. Prefer the smallest panel or sequential investigation that can answer the question. Model errors are visible failures, never silent provider fallback.

## Start a task with poteto-mode

Use `/skill:poteto-mode <goal and done check>` for one request. `/poteto-mode on`, `/poteto-mode off`, and `/poteto-mode status` control later requests on the active Pi session branch. Off does not cancel a skill explicitly invoked in the current request. There is no Cursor Custom Mode keyboard shortcut in this package.

The mode reads the matching playbook, preserves its steps in a short plan, and reads skills as needed. A skipped step keeps its reason. Read [prompting.md](references/prompting.md) before helping word the goal. Ask for a falsifiable done check, observable proof and real constraints; avoid prescribing an arbitrary sequence of skills.

## Pick a skill

| Need | Read |
|---|---|
| Rigorous task routing | [poteto-mode](../poteto-mode/SKILL.md) |
| Restate a messy goal before work | [in-your-own-words](../in-your-own-words/SKILL.md) |
| Improve the goal before starting | [sharpen](../sharpen/SKILL.md) |
| Runtime mechanics and ownership | [how](../how/SKILL.md) |
| Historical reasons and threshold origins | [why](../why/SKILL.md) |
| Plain explanation at the reader’s pace | [teach](../teach/SKILL.md) |
| Catch up within this conversation | [ketchup](../ketchup/SKILL.md) |
| Risks beyond a diff and a proved safety fact | [blast-radius](../blast-radius/SKILL.md) |
| Caller usage, types and module shape | [architect](../architect/SKILL.md) |
| Same brief, independent candidates, base and grafts | [arena](../arena/SKILL.md) |
| Coverage slices or races and one report | [swarm](../swarm/SKILL.md) |
| Diverse-model adversarial review | [interrogate](../interrogate/SKILL.md) |
| A test-first local bug fix | [tdd](../tdd/SKILL.md) |
| TypeScript design rules | [typescript-best-practices](../typescript-best-practices/SKILL.md) |
| Comment review | [no-comments](../no-comments/SKILL.md) |
| Prose cleanup | [unslop](../unslop/SKILL.md) |
| Docs, RFCs, PR descriptions and commit messages | [technical-writing](../technical-writing/SKILL.md) |
| Restate the last reply plainly | [bro](../bro/SKILL.md) |
| Generate a real app verification harness | [create-verification-skill](../create-verification-skill/SKILL.md) |
| Audit every mapped feature against source and live behavior | [maintain-verification-skill](../maintain-verification-skill/SKILL.md) |
| Vet a measured performance claim | [benchmark-checklist](../benchmark-checklist/SKILL.md) |
| Design one bespoke rigorous run | [figure-it-out](../figure-it-out/SKILL.md) |
| Keep and audit decisions | [show-me-your-work](../show-me-your-work/SKILL.md) |
| Durable lessons from this session | [reflect](../reflect/SKILL.md) |
| Recurring agent errors | [correct](../correct/SKILL.md) |

How answers mechanics; why answers reasons; teach blends their findings without changing uncertainty. Arena synthesizes one artifact; swarm reports slice/race results. Interrogate reviews a change; blast-radius follows effects beyond it. Architect implements only when the task authorized implementation; “with checkpoint” pauses after design. Figure-it-out designs one run; [Orchestrate](../poteto-mode/playbooks/orchestrate.md) coordinates a standing program; [Autonomous run](../poteto-mode/playbooks/autonomous-run.md) drives one predicate.

## Playbooks and principles

Playbooks are mode step lists, not separate slash commands. Read the [mode index](../poteto-mode/SKILL.md). “Check on PR 123” routes to [Babysit](../poteto-mode/playbooks/babysit.md); creating a PR alone does not. “Land the stack” routes to [Shipping](../poteto-mode/playbooks/shipping.md) under explicit authority. “Take over this branch” uses [Session pickup](../poteto-mode/playbooks/session-pickup.md). “Pause safely” uses [Pause safely](../poteto-mode/playbooks/pause-safely.md). Planning across phases uses [Multi-phase plan](../poteto-mode/playbooks/multi-phase-plan.md), whose deliverable is the plan, not implementation.

The mode indexes all 24 principle leaves. Read a leaf before applying or citing it. A principle name is a useful steer, such as “apply prove it works; show the real stored output.”

## Fix a run that went wrong

| Symptom | Concrete check or steer |
|---|---|
| Mode stopped applying | Inspect `/poteto-mode status`; enable it for later turns or explicitly invoke the skill for the next request. |
| A new question continues an old task | Say “new task” and name its deliverable. |
| Model setting had no effect | Inspect role status and the actual launched model; saved config alone is not dispatch evidence. |
| Parallel writers collided | Isolate each writer or serialize shared files; local worktrees do not imply cloud execution. |
| Overnight work never finishes | Give `/loop run` a bounded budget and a command whose exit 0 proves the done predicate. |
| A green build is called completion | Ask for the actual user flow, stored value or measured artifact. |
| A skill was not automatically chosen | Use `/skill:name`. These explicit-only skills are also read by mode routing. |

## Make pstack my own

Use [reflect](../reflect/SKILL.md) to propose evidence-backed changes and approve the concrete subset before shared skill edits. [Correct](../correct/SKILL.md) prefers structural enforcement for repeated mistakes. Use the manual authoring procedure in the [Pi adapter](../../adapters/pi/harness.md) and installed Pi skills docs for new skills; no unavailable create-skill command is implied. A broken skill discovered during feature work gets a separate scoped proposal unless fixing it is already authorized.

## Reply

Lead with the answer. Give at most one adapted prompt from [recipes.md](references/recipes.md), then link the actual source file. Keep the answer short unless the user asked for the whole map. Help does not grant permission to delegate, install, send messages, commit, push or merge.
