---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
license: MIT
---

# Arena

Run independent candidates against the same task, choose one base, and graft the strongest parts of the others into it. An arena is a decision tool, not a merge authority.

1. State the task, the artifact, and a small rubric of three to six concrete gradeable criteria. Candidates see the task and rubric; they do not see each other's work.
2. Pick the runner count and seats from the configured pstack roles or the parent model. Do not read `~/.cursor/rules/pstack-models.mdc`, do not use fixed Cursor slugs, and do not silently substitute a provider. If a required model is unavailable, name the gap and use an available seat or stop.
3. Give each candidate its own output location: a managed worktree when the artifact must live in the repository, otherwise a scratch directory under the run directory. One writer per location. Do not run two writers in one worktree.
4. Spawn the candidates only when delegation is authorized; otherwise run the candidates sequentially yourself. Each candidate returns the artifact and a short rationale naming alternatives it rejected. Keep the main thread on summaries and paths, not raw payloads.
5. When the candidates are done, judge against the rubric with a read-only reviewer or your own reading. Prefer a different model family when one is configured. The judge recommends a base and records a score per criterion; a self-report is not a verdict.
6. Choose the base, graft only the parts that beat it on a rubric criterion, and verify the graft against the same rubric. Keep the losing candidates' artifacts until the decision is reported. Do not commit, push, open a PR, or merge from the arena; cleanup needs separate authorization.

Report the rubric, the candidates and seats, the base and grafts, the evidence for the choice, and the artifact paths. If the task is really a single obvious change, skip the arena and use Feature.
