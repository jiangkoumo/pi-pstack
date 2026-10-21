# PR body template

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT, pinned at `f713f14203cd6420cec13cd7c55c32d598dbab68`. See [license](../../LICENSES/pstack.txt) and [Opening a PR](../../skills/poteto-mode/playbooks/opening-a-pr.md).

Write the title as Conventional Commits `type(scope): subject`, with no trailing period. Use a short imperative subject and a real symbol only when it carries the change. Apply the unslop and no-comments passes to the diff. Write the title, body, and commit body with technical-writing (all layers except Diátaxis, including STE vocabulary), then apply unslop to the prose.

Copy the six sections below to a local PR body file and replace the placeholders. Keep the body a one-minute briefing, under about 40 lines when it becomes the squash commit body. Keep Scope; omit another section only when there is nothing to say. Link a separate evidence artifact for full SHAs, lane receipts, measurement details, interaction-review evidence, plan dependencies, and authorization records. Do not put those records or metric tables in the body. Screenshots or videos follow the sections when they prove a claim.

Prepare and display the proposed title and body when external-write authorization is absent. Pushing, creating or editing a PR, and merging require explicit authorization in the current session. Auto-merge needs its own grant; a green check or a prior PR grants none. Once authorized, use the provided PR tool, or the resolved forge with its body-file option. Never interpolate body text into a shell command.

---

## Why

<The problem and approach in 1–3 short sentences. No SHAs or branch genealogy.>

## What changed

- <One of 1–3 short items. Name a symbol or path only when it carries the change; name both sides of a rename or retarget.>

## Scope

- <One of 1–3 short items on coverage and deliberate exclusions, follow-ups, or known gaps. No file-by-file inventory.>

## Tradeoffs

<A rejected alternative the reviewer would otherwise ask about. Omit this section when there was no real choice.>

## Blast Radius

<Who or what this touches, and why it is safe or risky, in 1–2 sentences. If main is red, state the cost of leaving it red.>

## Verification

- <One of 1–3 actual run paths and outcomes. Include the command or concrete driven scenario and its result; never report attempted or blocked evidence as passed.>
- <For perf, one primary metric with its unit, before → after, and a link to the arena or swarm directory for the rest.>

---

Keep the detailed evidence in the linked artifact: exact checked head and base; unit, live, regression, and relevant perf receipts; independent findings and dispositions; unresolved blockers; and the actual authorization for the next operation. Tests and CI are inputs to the verdict, not substitutes for real-artifact proof. Recheck affected behavior at a new head under the selected playbook's patch-id rules. Follow the [plan contract](pstack-plan.md) for a planned stack, and stop at merge-ready when landing authority is pending.
