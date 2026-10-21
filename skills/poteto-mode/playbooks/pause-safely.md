### Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** This is explicit only. On "keep going", "going to bed, keep going", or "don't stop", do not pause.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new, and cancel any nested subagents.
2. Take no irreversible action to pause. No PR and no push unless you already had one out.
3. Make the work durable. Commit uncommitted edits as one clear `wip:` commit on the current branch so nothing is lost. If the tree is broken, say so in the commit body in one line.
4. Write the resume note off-context. Capture intent, what you were doing, progress and what's verified, current state, next steps, key files, and gotchas. For the compaction trigger write it to a file like `/tmp/<slug>-resume.md`. If a show-me-your-work trail exists, point at it instead of duplicating it.

**Reply:** where you are in the loop, what's on disk versus still in your head (paths, no diff dumps), the commits you made and whether the tree is clean, and the first action on resume. This is a pause, not a final report.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream steps with the listed Cursor tool, model, and skill substitutions. These notes govern platform and authorization differences.

Read [Poteto mode for Pi](../SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand. `/unslop` replaces Cursor's deslop pass. Use Pi's `read`, `edit`, `write`, `ffgrep`/`grep`, `fffind`/`find`, and `ls` for file content; `bash` executes programs and checks. Ask the operator in plain text when a decision is needed.

Store local trails, patches, resume notes, and prototype artifacts under `<run-id>/` in the pstack run directory provided in the system prompt, or another durable operator-approved local directory. Keep evidence out of the repository unless its inclusion is authorized. A path in an upstream example is not permission to write unrelated user state.

The operator's current task grant governs delegation, local commits, and worktrees. Keep one writer per worktree; a replacement takes over only after the previous writer has stopped. Give every delegate the goal, allowed paths, prohibitions, approved decisions, acceptance commands, and a route back to its parent. Use configured role models and thinking from `/setup-pstack`; never put `model` on the outer `subagent` call or in a parallel task item. Wait for completion notices. If pi-subagents is unavailable or delegation is forbidden, execute the steps in sequence within the current grant, label self-review, and report `BLOCKED: independent review` where independent review is required.

Pushing, opening or editing a PR, and merging require explicit authorization in the current session for the action and scope. Auto-merge needs its own explicit grant. Rebase, amend, reset, force-push, and deletion follow the operator's Git and cleanup rules; an upstream imperative does not bypass them. Without push/PR authorization, prepare and display the proposed Conventional Commits title and PR body locally, then report the branch, checks, and pending action. Green CI, a loop tick, and a previous PR do not grant authority.

Cancel only this run's recorded children through pi-subagents, and confirm they stopped; do not cancel unrelated runs. Inspect `/loop status` and use `/loop stop` when this run is active. The upstream `wip:` commit is made only within the existing local-commit grant. Otherwise keep the edits intact and record their state and paths in the resume note; do not call that a commit or a clean tree. Keep the note and any required patch in a durable operator-approved local run directory; `/tmp/<slug>-resume.md` may be a convenience copy, not the only durable copy. A previous push or PR does not authorize another one.
