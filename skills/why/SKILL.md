---
name: why
description: "Use for 'why does X work this way', 'why we picked Y', design rationale, regressions, postmortems, or data-backed thresholds. Discovers available MCPs and queries each evidence category (source control, issue tracker, long-form docs, real-time chat, infrastructure observability, error tracking, product analytics warehouse) in parallel, then returns a cited read on decisions and tradeoffs. Use how for runtime behavior."
disable-model-invocation: true
license: MIT
---

# Why

Build a cited account of why the code has its current shape, separating what the evidence shows from what you infer. This is a read-only investigation; it does not commit, push, open a PR, or change the code.

1. Frame the question and the target precisely: file, symbol, threshold, or behavior. If the referent is vague, state your best interpretation briefly and proceed, or ask when the answer would materially change.
2. Start with source control, which is always local: `git log`, `git blame`, `git log --follow -p`, commit bodies, and PR numbers visible in the log. Read the surrounding code and tests. These facts anchor every later source.
3. Inventory the evidence sources actually available in this Pi environment: repository docs, issue/ticket exports, chat exports, observability exports, error tracking, analytics, and any MCP servers the operator has configured. Do not assume a Cursor `mcps/` directory, a cloud dashboard, or a fixed MCP list. Mark each category as available, empty, or unavailable.
4. For each available source, gather a bounded set of citations. Use a read-only subagent only when delegation is authorized and the source is large; otherwise read the minimum directly. One investigator owns one source, and no investigator writes.
5. Synthesize with explicit confidence. Separate the code facts, the documentary record, and reasonable inference. Name competing hypotheses and what would disambiguate them. Never fabricate a link, PR number, commit, or transcript reference.
6. If the question precedes a change, turn the findings into Preserve / Change / Avoid / Risk constraints for the planning step. Do not start the change from this skill.

Report The Question, The Code in Question, What We Found, What We Can Reasonably Infer, Competing Hypotheses, What We Do Not Know, Sources Consulted (including empty or unavailable categories), and a Confidence Summary. If no source can answer the question, say so plainly.
