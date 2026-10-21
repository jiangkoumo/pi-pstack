### Session pickup

**You own the resume point. Read the prior trail, don't redo it.**

1. Locate the prior trail. A local transcript under the active workspace's `agent-transcripts/` directory (the system prompt names the path. Do not glob across `~/.cursor/projects/*/`, that crosses workspace boundaries and reads private chats from unrelated projects), a cloud-agent URL, or a pushed branch. Read the metadata overview and last messages first, then scan back for the decision points. Parse a long transcript in a subagent and keep the reduced timeline in the main thread (the **principle-guard-the-context-window** skill). Pick each subagent's thinking level for the job, per the Subagents section.
2. Reconstruct operational state. The branch and worktree, what already landed (`git log`, `git diff` against the base), the open todos, the decisions made. The prior trail is authoritative input. Resist the bias to re-derive it.
3. Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass means you're treating the trail as untrustworthy when it's authoritative.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here. The routed playbook owns the rest.
5. Verify the inherited claims against the original goal on the real artifact (the **principle-prove-it-works** skill). A passing prior self-report is not the proof.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream steps with the listed Cursor tool, model, and skill substitutions. These notes govern platform and authorization differences.

Read [Poteto mode for Pi](../SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand. `/unslop` replaces Cursor's deslop pass. Use Pi's `read`, `edit`, `write`, `ffgrep`/`grep`, `fffind`/`find`, and `ls` for file content; `bash` executes programs and checks. Ask the operator in plain text when a decision is needed.

Store local trails, patches, resume notes, and prototype artifacts under `<run-id>/` in the pstack run directory provided in the system prompt, or another durable operator-approved local directory. Keep evidence out of the repository unless its inclusion is authorized. A path in an upstream example is not permission to write unrelated user state.

The operator's current task grant governs delegation, local commits, and worktrees. Keep one writer per worktree; a replacement takes over only after the previous writer has stopped. Give every delegate the goal, allowed paths, prohibitions, approved decisions, acceptance commands, and a route back to its parent. Use configured role models and thinking from `/setup-pstack`; never put `model` on the outer `subagent` call or in a parallel task item. Wait for completion notices. If pi-subagents is unavailable or delegation is forbidden, execute the steps in sequence within the current grant, label self-review, and report `BLOCKED: independent review` where independent review is required.

Pushing, opening or editing a PR, and merging require explicit authorization in the current session for the action and scope. Auto-merge needs its own explicit grant. Rebase, amend, reset, force-push, and deletion follow the operator's Git and cleanup rules; an upstream imperative does not bypass them. Without push/PR authorization, prepare and display the proposed Conventional Commits title and PR body locally, then report the branch, checks, and pending action. Green CI, a loop tick, and a previous PR do not grant authority.

Cursor's `agent-transcripts/` layout and cloud-agent URLs are source-platform references. On Pi, read the current session branch or an operator-provided session/trail file; do not glob unrelated workspaces or sessions. Start with metadata and the latest messages, then reduce the decision timeline. Long-trail parsing uses the read-only `pstack.verifier` agent on its configured `verification` role. If no accessible trail exists, ask in plain text for the resume source rather than inventing it. Reconstruct Git state through Git commands, and inspect `/loop status` for a prior bounded run. Resume or restart only within the current grant; a prior session's external-write permission does not carry into this one.
