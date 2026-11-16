---
name: why
description: "Use for 'why does X work this way', 'why we picked Y', design rationale, regressions, postmortems, or data-backed thresholds. Reads the commits and PR discussions that introduced the code and every later change, then returns a cited read on decisions and tradeoffs. Use how for runtime behavior."
disable-model-invocation: true
license: MIT
---

# Why

Answer from the record, not the code: read the commits and PR discussions that introduced the target and each later change, and other sources if the trail is thin. Cite what the authors wrote, mark your own inferences as inferences, and say what the record does not answer.

The companion `how` skill answers what the code does and how it works. `why` answers what forces led to its shape.

## 1. Anchor the target in history

Build the anchor before reading anything else: file paths and line ranges, key symbols, the commits that touched them, and the PRs those commits came from.

- `git blame -L <start>,<end> <file>` for last-touch commits.
- `git log --follow -p -- <file>` for full history with patches through renames.
- `git log --oneline -20 -- <file>` for recent commits with PR numbers in the subject (`(#1234)`).
- `git log -1 --format=%B <commit>` to extract a PR number, then `gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews` for the discussion.

Read the introduction commit and every change that altered the shape, not just the most recent one. The current shape is often the accretion of many earlier decisions.

## 2. Widen only when the trail is thin

Commits and PRs are the record. When they do not answer the question, look at the other sources that actually exist in this session: issue tracker, long-form docs, team chat, infrastructure observability, error tracking, product analytics. List the connectors exposed in the session and inspect their schemas before use. Query only what is available. A missing connector is a gap and a null result for that source, never a reason to invent evidence, read another workspace, or grant broad write access to recover a reader.

## 3. Answer from what was written

- Quote or cite the authors' own words for a decision, with the commit, PR, ticket, or message that carries them.
- Mark anything you inferred as an inference, and name what it rests on.
- Say plainly what the record does not answer. A null result is a finding.
- Cite a real `file:line`, PR, or ticket. A search that finds nothing is still an answer. Never invent a caller, an API, or a rationale.

## Confidence

Label every claim with one of these tiers, and never promote a claim by restating it:

- **Direct**: the record says it, and the citation shows it.
- **Supported**: several independent records point the same way.
- **Inferred**: your reading of the record, named as inference.
- **Speculative**: a plausible story the record does not carry.
- **Unknown**: the record is silent, or the source was unavailable.

## Output format

Adapt the sections to the question, but keep the confidence separation intact:

The Question, The Code in Question, What the Record Says, What We Can Reasonably Infer, What the Record Does Not Answer, Sources Consulted, Confidence Summary.

Sources Consulted is one line per source, including the ones that returned nothing or were skipped, with the reason. After it, when the question is a precursor to changing this code, turn the findings into a Preserve / Change / Avoid / Risk constraint set for planning the change.

**Reply:** the cited read above, with inferences labeled and gaps named.

## Pi execution and authority

Adapted from Lauren Tan’s pstack v0.15.42, MIT, fixed revision bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Local sequential investigation is the default and needs no delegation. Independent helpers require operator or applicable project authorization and an available pi-subagents integration; without both, do the same investigation yourself and label the result self-review rather than independent review. Read the installed integration’s public instructions before launching. Any helper is read-only: no bash, edit, write, commit, push, merge, deploy, or external messages.

Source control is available through `git` and `gh` when the host installs and authorizes them; record a gap when either is missing. A source investigator may use only explicitly available read-only connectors; lack of connector access is a gap, never a reason to grant write tools, and MCP availability alone never authorizes a write tool.

Honor the operator’s configured roles and supported reasoning levels. Runtime-registered pstack agents bind their models through /setup-pstack: pstack.poteto-agent uses code, pstack.comment-sicko uses review, pstack.verifier uses verification, and pstack.prose-writer uses prose. This binding applies to direct calls and workflow children, including subagent({ workflow: "parallel", args: { tasks: [{ agent: "pstack.<agent>", task: "<brief>" }] } }). Do not put model in a task item or on the outer call; user subagents.agentOverrides may override the agent’s model and thinking. Do not invent per-skill configuration keys. Preserve model diversity where available; report when configured seats share a model. A rejected model stops that seat and is reported; never substitute a default, a same-family model, or any other fallback. Do not launch a child without authorization. Await native completion notices, not polling.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write only for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. This skill writes no repository files to answer a why question. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
