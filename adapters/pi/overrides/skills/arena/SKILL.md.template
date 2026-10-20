---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
license: MIT
---

# Arena

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners from exact available models under the Pi authority rules below. Keep diverse models for judgment-sensitive work; repeated seats on one model are suitable for generation-bound work. Declare unavailable seats.
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

## Phase B: Fan out

When delegation is authorized, launch independent candidates through the installed pi-subagents public API. Each gets the same task, shared grounding path, its own output path, and instructions to return an artifact and short rationale naming alternatives considered and rejected. Otherwise create sequential candidates and disclose that independence is absent.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, choose an available read-only cross-judge, preferably from a different model family from the parent. When delegation is authorized, launch it through the installed integration. Otherwise self-judge and disclose the missing independent seat. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.

## Pi execution and authority

Adapted from Lauren Tan’s pstack v0.15.25, MIT, fixed revision f713f14203cd6420cec13cd7c55c32d598dbab68. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Delegation requires operator or applicable project authorization and an available pi-subagents integration. Otherwise perform the same stages sequentially and label the result self-review rather than independent review. Read the installed integration’s public instructions before launching. Use pstack.poteto-agent for isolated candidate writers and pstack.comment-sicko with its actual read-only allowlist for file reviewers. Keep one writer per directory. A source investigator may use only explicitly available read-only connectors; lack of connector access is a gap, never a reason to grant write tools.

Use exact available provider/model IDs and supported reasoning levels, honoring the operator’s configured roles. Automatic role routing is supported only for the current direct-call path. The installed parallel workflow forbids model in tasks/chain items, and script-internal launches have no public launch hook for this mapping. Do not claim automatic per-seat role routing or put model into those items. When exact per-seat models matter, use only a supported direct-call route after checking its schema, or report the unavailable route; an explicit design method is not dispatch evidence. Do not invent per-skill configuration keys. Preserve model diversity where available. A rejected model stops that seat and is reported; never silently choose a fallback. Do not launch a child without authorization. Await native completion notices, not polling.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
