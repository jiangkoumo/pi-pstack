### Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. Run the **unslop** skill over the diff before commit.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing under 40 lines with these `##` headings in order, dropping empty ones: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs` (only rejected alternatives a reviewer would otherwise ask about), `## Blast Radius`, `## Verification`.

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create` without `--draft`, or `origin pr create --status open` when Origin's CLI resolves the repository. Opening a PR does not start a babysit.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `e58dd043600587dbaf58ba315e7f2b38373eeb43` (pstack 0.15.44); license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream paragraphs with the listed tool and skill substitutions. These notes govern platform and authorization differences.

Read [Poteto mode for Pi](../SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand. The **unslop** skill replaces Cursor's deslop pass. Use Pi's `read`, `edit`, `write`, `ffgrep`/`grep`, `fffind`/`find`, and `ls` for file content; `bash` executes programs and checks. Ask the operator in plain text when a decision is needed.

Store local trails, patches, resume notes, and prototype artifacts under `<run-id>/` in the pstack run directory provided in the system prompt, or another durable operator-approved local directory. Keep evidence out of the repository unless its inclusion is authorized. A path in an upstream example is not permission to write unrelated user state.

The operator's current task grant governs delegation, local commits, and worktrees. Keep one writer per worktree; a replacement takes over only after the previous writer has stopped. Give every delegate the goal, allowed paths, prohibitions, approved decisions, acceptance commands, and a route back to its parent. Use configured role models and thinking from `/setup-pstack`; never put `model` on the outer `subagent` call or in a parallel task item. Wait for completion notices. If pi-subagents is unavailable or delegation is forbidden, execute the steps in sequence within the current grant, label self-review, and report `BLOCKED: independent review` where independent review is required.

Pushing, opening or editing a PR, and merging require explicit authorization in the current session for the action and scope. Never enable auto-merge. Rebase, amend, reset, force-push, and deletion follow the operator's Git and cleanup rules; an upstream imperative does not bypass them. Without push/PR authorization, prepare and display the proposed Conventional Commits title and PR body locally, then report the branch, checks, and pending action. Green CI, a loop tick, and a previous PR do not grant authority.

Check the prepared body against the package-root [PR body template](../../../docs/templates/pstack-pr.md) before you post; its headings preserve the upstream order, and `## Tradeoffs` stays optional.

**Verifier before the PR.** Before `gh pr create` (or a PR-tool create), dispatch the read-only `pstack.verifier` through `subagent` with the pinned head, the acceptance commands and the diff range. Put its actual command and exit-code result, and its verdict, in `## Verification`. If the verifier is unavailable, name the person responsible for verification and why it could not run; do not present a self-review as independent verification. Do not run [interrogate](../../interrogate/SKILL.md) as an extra PR-opening step.

**Readiness.** Open every PR ready, never as a draft. A built-in PR tool can default to draft, so set `draft: false` on every creation call through it. With Origin, pass `--status open`. With `gh`, omit `--draft`. If a PR still opens as a draft, run `origin pr ready <number>` or `gh pr ready <number>` according to the resolved forge, and read the state back with `origin pr view <number>` or `gh pr view <number>` before you refer to PR status.

**Forge.** Resolve the forge before the first PR operation and keep that choice for create, edit, view, watch, and merge. GitHub CLI (`gh`) is the default. If `command -v origin` succeeds and Origin can resolve the repository, prefer `origin pr ...`. If Origin is absent or cannot resolve the repository, stay on `gh` and record the fallback. Do not require Graphite (`gt`).

**Completion self-check.** This playbook is complete only after the authorized actions actually happened and were read back: the branch is pushed, the PR exists, and `gh pr view <number>` succeeds. A local commit, a prepared body, green CI, or a loop tick is not completion. Without push/PR authorization, stop with an explicit `BLOCKED: push/PR not authorized` and report the branch, checks, prepared title and body, and the exact pending command; the self-check cannot grant authority.

With authorization, run the real read-only check from the repository:

```bash
node <package-root>/extensions/pstack/publication-gate.mjs completion --authorized [--pr <number>]
```

It runs `git rev-parse HEAD`, `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`, `git rev-list --count <upstream>..HEAD`, and `gh pr view [<number>] --json ...`; it compares the PR head with local HEAD and reads `## Verification` from the real PR body. It does not read a hand-written boolean file. Exit 0 means complete; 1 means incomplete and may continue under a bounded `/loop` while its budget, cancel and stop controls remain in force; 126 means push/PR is not authorized (or the invocation is unusable) and must stop. A `FAIL` in `## Verification` stays incomplete even when a responsible verifier is named.

**Mechanical publication gate.** With the pstack extension loaded, the package's publication gate inspects `git commit` and `gh pr create` before the shell runs and blocks the call when the title is not `type(scope): subject`, when a PR body misses a required heading or puts one out of order, or when a reported test count does not match a successful last recorded run of the cited command. Commit titles are checked; an ordinary commit body may carry `Fixes #12` and prose without the PR headings. The gate never executes the request. Pass `-m`/`-F` or `--title`/`--body-file` so the arguments are visible; editor, stdin (`-`), `--fill`, `-F -`, and message-reuse forms are refused rather than assumed. It also refuses known command wrappers, variable-expanded executables, in-command `git -c alias.<name>=commit` aliases, and `gh api` pull-request writes; use `gh pr create` and the literal `git commit` form instead. Run the cited test command first: the gate records the test summary in the Git directory when the command finishes, and rejects a count from an older or failed run. The gate is a mechanical preflight, not proof that the change works and not an OS execution boundary; the operator still decides push, PR, and merge authority.
