---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
license: MIT
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Delegation follows the Pi execution and authority rules below. Explorers and explainers are read-only; if delegation is unavailable or unauthorized, execute the same steps locally and disclose that limitation.

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. Use one explainer that explores and explains in one pass, built from [explainer-prompt.md](references/explainer-prompt.md) without the explorer-findings section. Go to step 4.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Decompose the question into 2 to 4 angles, each a distinct slice of the subsystem. With delegation authorized, launch all explorers together; otherwise explore the slices sequentially, each with [explorer-prompt.md](references/explorer-prompt.md) and its angle filled in.

## 3. Synthesize (complex only)

Once all explorers have returned, use one explainer with [explainer-prompt.md](references/explainer-prompt.md) and every explorer's findings filled in.

## 4. Present

Present the explainer's output. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output format

The explanation uses the sections defined in [explainer-prompt.md](references/explainer-prompt.md), dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.

## Pi execution and authority

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires operator or applicable project authorization and an available pi-subagents integration. Otherwise perform the same stages sequentially and label the result self-review rather than independent review. Read the installed integration’s public instructions before launching. Use pstack.poteto-agent for isolated candidate writers and pstack.comment-sicko with its actual read-only allowlist for file reviewers. Keep one writer per directory. A source investigator may use only explicitly available read-only connectors; lack of connector access is a gap, never a reason to grant write tools.

Honor the operator’s configured roles and supported reasoning levels. Runtime-registered pstack agents bind their models through /setup-pstack: pstack.poteto-agent uses code, pstack.comment-sicko uses review, pstack.verifier uses verification, and pstack.prose-writer uses prose. This binding applies to direct calls and workflow children, including subagent({ workflow: "parallel", args: { tasks: [{ agent: "pstack.<agent>", task: "<brief>" }] } }). Do not put model in a task item or on the outer call; user subagents.agentOverrides may override the agent’s model and thinking. Do not invent per-skill configuration keys. Preserve model diversity where available; report when configured seats share a model. A rejected model stops that seat and is reported; never silently choose a fallback. Do not launch a child without authorization. Await native completion notices, not polling.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
