---
name: poteto-mode
description: "Apply pstack engineering methods to investigation, bug fixes, and small behavior changes in Pi. Use when explicitly asked for poteto-mode."
disable-model-invocation: true
license: MIT
---

# Poteto mode for Pi

Use this skill for the current request. Persistent on/off mode is not implemented. This is the single-agent subset of pstack, adapted from Lauren Tan's fixed upstream revision. Source and differences are in [the port record](../../docs/port-status.md).

## Route the task

Read exactly the matching playbook before working. Resolve every relative path from the file that contains it.

| Request | Read |
| --- | --- |
| Read-only explanation, diagnosis, or recommendation | [Investigation](playbooks/investigation.md) |
| Reported broken behavior | [Bug fix](playbooks/bug-fix.md) |
| New or changed behavior | [Feature](playbooks/feature.md) |
| Repeated agent mistakes | [Correct](../correct/SKILL.md) |

If a request spans these, finish the read-only diagnosis before the authorized change. A request for an explanation does not authorize a patch. For work outside this subset, explain the limit and follow the operator's existing workflow. Do not claim the remaining upstream playbooks are available.

## Work within the operator's authority

User and project instructions govern tools, permissions, output, and scope. Loading this skill grants no extra permission to delegate, send messages, commit, push, merge, deploy, or delete. Continue reversible work already authorized. Ask only for a material requirement or action that remains unauthorized. Continue independent authorized work while awaiting an answer.

Work directly by default. Optional delegation requires operator or applicable project authorization and a working integration such as pi-subagents. Check the installed integration's instructions and actual model list before using it. Never copy Cursor Task syntax, fixed model names, or /loop calls. Missing delegation does not block these single-agent workflows. Do not describe a self-review as independent review.

Keep one writer per working directory or worktree. Treat user changes as the baseline and preserve them. Stop only the steps that conflict with their changes.

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
