---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
license: MIT
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

## 1. Explain

Spawn one read-only explainer for the whole question. It explores and explains in one pass and never writes. Give it the user's question and this brief:

> You are writing an architectural explanation for a senior engineer. Explore the codebase and write an explanation that a senior engineer unfamiliar with this area could read and walk away with a solid mental model. They should understand the architecture well enough to start working in it confidently. You have read-only access to the codebase.

## 2. Present

Present the subagent's output. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output format

The explanation uses the sections that apply and drops the rest: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.42, MIT, fixed revision bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires current operator or applicable project authorization and a compatible pi-subagents integration. If unavailable or unauthorized, do the same read-only exploration and explanation locally, disclose self-review and missing independence, and report any required independent stage as open. Use only registered pstack.* agents.

The single explainer uses the `judgment` role (`pstack.judgment-agent`), which is physically read-only. Set the role's model and thinking through `/setup-pstack`, or leave it at the default if the role or the line is missing. Leave `model` unset when the value is `inherit`, so that seat runs on the parent model. If the host rejects a configured model, stop that seat and report it; never substitute a default or a same-family model. Models and thinking bind through /setup-pstack roles and user agentOverrides; never put model in a task item or on the outer subagent call. Report unavailable or identical configured models; do not silently substitute. Pick the seat's thinking for the job, per the Subagents section of the **poteto-mode** skill. Await native completion notices and present the returned explanation.

Use read for file contents, grep/find/ls for search and directories, and ffgrep/fffind when available. Batch independent reads with codemode when available. Use edit/write only for authorized changes; bash executes programs and Git in an explicit working directory, never reads or searches files. Keep one writer per worktree and isolate candidate output paths. Read-only reviewers never receive bash, edit, write, or nested delegation. Loading this skill grants no new permission: push, PR creation, merge, external messages, and destructive operations require explicit authorization in the current session. Commit only when authorized.

One explainer, no explorers, no synthesis pass:

```js
subagent({ agent: "pstack.judgment-agent", task: "<the user's question and the brief in step 1>" })
```

Never put `model` in a task item or on the outer call.
