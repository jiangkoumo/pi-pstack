---
name: why
description: "Use for 'why does X work this way', 'why we picked Y', design rationale, regressions, postmortems, or data-backed thresholds. Discovers available MCPs and queries each evidence category (source control, issue tracker, long-form docs, real-time chat, infrastructure observability, error tracking, product analytics warehouse) in parallel, then returns a cited read on decisions and tradeoffs. Use how for runtime behavior."
disable-model-invocation: true
license: MIT
---

# Why

Investigate the motivation and intent behind code. The companion `how` skill answers what the code does and how it works. `why` answers what forces led to its shape.

Use independent investigators only when delegation is authorized. All investigators and the synthesizer are read-only. Local sequential investigation preserves the source coverage contract but is not independent multi-model review.

## Operating Posture

Operate as a **careful, cautious, and precise investigator**. Be honest about what you know vs what you're inferring. Read [epistemics.md](references/epistemics.md) for the full confidence framework and phrasing guide. The synthesizer must follow it.

## Step 1. Understand the Target and the Question

The **target** is usually a chunk of code, a pattern, a feature, or a named design decision. The **question** is usually a design rationale, a tradeoff, a motivating edge case, an external constraint, dead code, or a broad history sweep.

If the target is vague ("why do we do it this way?" with no clear referent), make your best guess from conversation context (open files, recent edits, cursor location, what was just discussed). State your interpretation briefly so the user can redirect if you're off, then proceed.

## Step 2. Establish the Code Anchor

Before spawning investigators, build the seed context inline: file paths and line ranges, key symbols (functions, classes, constants), the last few commits touching the target, PR numbers from merge commits (pattern `(#1234)` in the subject line), and any linked ticket IDs. Run `git blame -L <start>,<end> <file>` for last-touch commits, `git log --follow -p -- <file>` for full history with patches through renames, `git log --oneline -20 -- <file>` for recent commits with PR numbers visible, and `git log -1 --format=%B <commit>` to extract PR numbers. Then pull the PR bodies and discussion for any substantive commit: `gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews`. This anchor goes to every investigator and to the synthesizer.

## Step 3. Spawn Parallel Investigators

**Default to the full parallel investigation.** The goal is a complete coverage map, not a minimal one. Document the null, don't skip the search.

### Discovery

Discover the tools, connectors, or scoped exports actually exposed in this Pi session. Inspect their schemas before use. Do not assume a platform connector exists or grant broad write access to recover a missing reader. Use the [source-playbook index](references/source-playbook.md) for concrete source methods.

Map each available source to one evidence category:

1. Source control history
2. Issue / ticket tracker
3. Long-form documents
4. Real-time team chat
5. Infrastructure observability
6. Error / exception tracking
7. Product analytics warehouse

Start with local Git when this is a repository. PR access through gh depends on installation, authentication and permissions; record a gap when unavailable. For the other six, classify using the MCP name, server instructions, tool names, and resource descriptors. If an MCP could fit more than one category, choose the one matching its primary evidence. Record ambiguous cases in the coverage map.

Cover each available category with one source-owning investigator, using parallel children only with delegation authorization. Multiple independent connectors in a category may have separate seats; never silently omit one. Otherwise perform the same searches sequentially.

Each investigator’s prompt is [investigator-prompt.md](references/investigator-prompt.md) filled in, plus:
- the category playbook `references/sources/<source>.md` for the selected MCP, adapted from the examples in [source-playbook.md](references/source-playbook.md)
- [incident-postmortem.md](references/sources/incident-postmortem.md) **if the target code looks defensive** (null checks, retry logic, timeout handling, rate limiting, feature flags, egress guards, OOM handlers)
- the code anchor and the user's original question

### Investigator roster, one per available evidence category

Each category below is uniquely positioned to surface one shape of "why", shown after "Best at". Use it to know what to expect back, to name a gap when a category returns empty, and, only in the rare provably-irrelevant case, to justify a skip.

1. **Source control** (git history, `gh` for PRs, code comments, tests). Always inspect when a local repository is available; record missing history as a gap. Best at *implementation-time rationale captured during review*.
2. **Issue / ticket tracker** (e.g. Linear, Jira, GitHub Issues, Plane, Shortcut MCP). Best at *the product or business forcing function*. Strongest when the why is external to engineering.
3. **Long-form documents** (e.g. Notion, Confluence, Google Docs, Coda MCP). Best at *long-form design rationale*, written out before it becomes code.
4. **Real-time team chat** (e.g. Slack, Discord, Microsoft Teams, Mattermost MCP). Best at *real-time deliberation that never reached a doc*. Especially important when the source control, ticket, and doc paper trail is thin.
5. **Infrastructure observability** (e.g. Datadog, New Relic, Honeycomb, Grafana, Splunk MCP). Best at *infrastructure and runtime reality that motivated the code*. Strongest when the target reacts to an infra signal (timeouts, retries, rate limits, circuit breakers).
6. **Error / exception tracking** (e.g. Sentry, Rollbar, Bugsnag, Airbrake MCP). Best at *the specific exceptions and error trajectories that motivated defensive or corrective code*. Strongest for catch blocks, null guards, type checks, retries, and other defenses.
7. **Product analytics warehouse** (e.g. Databricks, Snowflake, BigQuery, ClickHouse, dbt, Redshift MCP). Best at *product and data reality that shaped the code*. Strongest for flag-gated code, experiment-driven ships, data migrations, and "where did this number come from" questions.

### When to skip an investigator

Only with an **explicit, written justification** that goes in the final Sources Consulted. Two valid reasons:

- **No MCP is available for that category** in this environment. Flag it as a gap, not a choice: "Real-time team chat skipped. No matching MCP available, so the conversational record was not searchable."
- **The source is provably irrelevant**, not just "probably irrelevant." A high bar: "Error / exception tracking skipped. Target is a build-time script with no runtime code path."

If your scope assessment suggests a single-commit trivial target where the PR description already contains the complete answer, you may answer inline **only after** confirming all seven available category searches would be redundant. Say so explicitly. This should be rare.

## Step 4. Synthesize

Use one read-only synthesizer when delegation is authorized; otherwise synthesize locally. It gets:
1. The investigator findings, including any null results and any categories skipped with justification
2. The code anchor
3. The user's original question
4. The epistemics framework from [epistemics.md](references/epistemics.md)
5. The synthesizer prompt template from [synthesizer-prompt.md](references/synthesizer-prompt.md)

## Step 5. Present

Present the synthesizer's output to the user. You may lightly edit for clarity or add context from the conversation, but **do not rewrite the confidence language**.

## Output Format

The structure is the one in `references/synthesizer-prompt.md`: The Question, The Code in Question, What We Found, What We Can Reasonably Infer, Competing Hypotheses, What We Don't Know, Sources Consulted, Confidence Summary. Adapt as needed, but keep the confidence separation intact, and keep Sources Consulted as one line per investigator, including the ones that returned nothing or were skipped, with the reason.

After Sources Consulted, if the user's `why` question is a precursor to changing this code, convert the lineage findings into a Preserve / Change / Avoid / Risk constraint set for planning the change.

## Common Failure Modes to Avoid

- **Recency bias**. Assuming the most recent commit is authoritative. The current shape is often the accretion of many earlier decisions. Trace back.

## Pi execution and authority

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires operator or applicable project authorization and an available pi-subagents integration. Otherwise perform the same stages sequentially and label the result self-review rather than independent review. Read the installed integration’s public instructions before launching. Use pstack.poteto-agent for isolated candidate writers and pstack.comment-sicko with its actual read-only allowlist for file reviewers. Keep one writer per directory. A source investigator may use only explicitly available read-only connectors; lack of connector access is a gap, never a reason to grant write tools.

Use exact available provider/model IDs and supported reasoning levels, honoring the operator’s configured roles. Current direct-call code/review mapping does not prove workflow role routing; the parent must resolve and verify each seat against the installed integration. Do not invent per-skill configuration keys. Preserve model diversity where available. A rejected model stops that seat and is reported; never silently choose a fallback. Do not launch a child without authorization. Await native completion notices, not polling.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
