# Session pickup

Adapted from pstack by Lauren Tan. This workflow resumes from Pi session evidence and real repository state; it does not read Cursor transcripts or cloud-agent state, and it does not commit, push, open a PR, or clean up without separate authorization.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. Read only the current Pi session branch or a Pi session file the operator explicitly provides. Never glob `~/.cursor/projects/*` or scan unrelated sessions; a cloud-agent URL is not a Pi session and is unsupported.

1. Locate the prior trail. Use the current session branch or the operator-supplied session file, read the metadata and last messages first, and scan back for decision points. Parse a long trail in a read-only subagent only when delegation is authorized, and keep a reduced timeline in the main thread. If there is no usable trail, stop and ask rather than reconstructing from guesswork.
2. Reconstruct operational state: branch and worktree, HEAD, `git log`, `git diff` against the base, open todos, decisions, and any local run ledger. If the prior work was a `/loop` run, read `/loop status` and its evidence; do not infer state from the transcript alone. Do not switch branches or remove worktrees during pickup.
3. Diff done against pending. Compare what shipped with what was planned, name the resume point, and do not re-run a prior reproduction or redo completed work. A "verify everything from scratch" pass is only justified when the trail is genuinely untrustworthy.
4. Route the remaining work to the matching playbook that is actually available. Pick the verdict: continue execution, deliver a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. If the target playbook is still deferred, say so instead of pretending it is supported. A stopped or interrupted `/loop` is not resumed silently; `/loop resume` requires the operator's explicit instruction.
5. Verify inherited claims against the original goal on the real artifact. A passing prior self-report is not proof. Preserve the one-writer rule and do not start a second writer in the same worktree.

Report where the prior agent stopped, what was inherited versus redone (ideally nothing redone), the resume point, the evidence read, and the outcome. This workflow ends where the routed playbook takes over.
