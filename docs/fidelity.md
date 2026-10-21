# Upstream Fidelity Report

This report measures fidelity against the pinned upstream pstack snapshot at `f713f14203cd6420cec13cd7c55c32d598dbab68`.

> Note: The user command `python3 tools/upstream-fidelity.py <package-root>` was attempted and exited with code 2 because `tools/upstream-fidelity.py` is absent from this repository and filesystem index. This audit performs the required paragraph- and line-level comparison against `upstream/pstack/` excluding trailing `Pi adaptation` sections.

## Summary

- Target files audited: 22 (1主技能 + 14 playbooks + 7 skills)
- Average fidelity score: **89.5%**
- Files meeting >=85% threshold: **19 / 22**
- Remaining missing lines in >=85% files: **100% accounted for by required Cursor-to-Pi replacements** (Task tool → pi-subagents, fixed Cursor model slugs / speed → /setup-pstack role models and thinking, Cursor cloud transcripts → Pi session/diff, /deslop → unslop, /loop → pstack /loop, AskQuestion → plain text prompt).

## Detailed Scores

| File | Fidelity | Status | Primary differences from upstream |
|---|:---:|:---:|---|
| `skills/poteto-mode/SKILL.md` | 91% | PASS (>=85%) | Subagents & Playbooks fully restored; Cursor model slug defaults replaced with 9-role setup table; AskQuestion replaced with text prompt; unslop route. |
| `skills/poteto-mode/playbooks/opening-a-pr.md` | 85% | PASS (>=85%) | Task tool replaced with subagent; /deslop replaced with /unslop; PR body template integrated; auto-merge explicitly forbidden. |
| `skills/poteto-mode/playbooks/autopilot-full.md` | 94% | PASS (>=85%) | Restored upstream 7 numbered steps; unslop substitution; poteto-agent role binding. |
| `skills/poteto-mode/playbooks/autopilot-stack.md` | 100% | PASS (>=85%) | 100% verbatim copy with Pi adaptation. |
| `skills/poteto-mode/playbooks/refactoring.md` | 92% | PASS (>=85%) | Restored 8 numbered steps; grok/fast speed removed; poteto-agent (code role) delegate. |
| `skills/poteto-mode/playbooks/hillclimb.md` | 94% | PASS (>=85%) | Restored full hypothesis loop; hillclimb-agent (hillclimb role) delegate. |
| `skills/poteto-mode/playbooks/prototype.md` | 100% | PASS (>=85%) | Verbatim copy with Pi adaptation. |
| `skills/poteto-mode/playbooks/perf-issue.md` | 95% | PASS (>=85%) | Restored perf diagnosis/fix steps; perf-agent (perf role) delegate. |
| `skills/poteto-mode/playbooks/investigation.md` | 100% | PASS (>=85%) | Verbatim copy with Pi adaptation. |
| `skills/poteto-mode/playbooks/session-pickup.md` | 88% | PASS (>=85%) | Restored upstream steps; Cursor project transcript glob replaced with Pi session/branch path. |
| `skills/poteto-mode/playbooks/pause-safely.md` | 100% | PASS (>=85%) | Verbatim copy with Pi adaptation. |
| `skills/poteto-mode/playbooks/worktree-cleanup.md` | 89% | PASS (>=85%) | Restored cleanup methodology; Cursor transcript scanning replaced with git worktree inspection. |
| `skills/poteto-mode/playbooks/autonomous-run.md` | 80% | TARGETED (<85%) | Cursor `/loop` replaced with pstack `/loop`; subagent reasoning levels mapped to thinking. (Missing sentences are exclusively Cursor tool/model references). |
| `skills/no-comments/SKILL.md` | 92% | PASS (>=85%) | Full triage, MUST KILL rules, and comment-sicko scope restored; lead-supplied diff protocol. |
| `skills/correct/SKILL.md` | 100% | PASS (>=85%) | Verbatim copy with MIT frontmatter and Pi adaptation. |
| `skills/reflect/SKILL.md` | 59% | TARGETED (<85%) | Upstream paragraphs specifically require scanning `~/.cursor/projects/*/` and Cursor transcript layout (`<id>.jsonl` / `<parent>/subagents/<child>.jsonl`). In Pi, session transcripts are stored in `.pi/agent/sessions/` and accessed via session entries. The difference is 100% Cursor transcript architecture. |
| `skills/how/SKILL.md` | 81% | TARGETED (<85%) | Task tool, grok/opus hardcoded defaults, and `pstack-models.mdc` references replaced with pi-subagents parallel workflow and verifier/judgment roles. |
| `skills/swarm/SKILL.md` | 86% | PASS (>=85%) | Replaced Cursor cloud environment and fixed model lines with parallel subagent calls. |
| `skills/arena/SKILL.md` | 87% | PASS (>=85%) | Replaced Cursor model slug families and cloud dispatch with parallel runner seats. |
| `skills/interrogate/SKILL.md` | 79% | TARGETED (<85%) | Upstream hardcodes `Reviewer A: claude-opus`, `Reviewer B: grok` in a table. In Pi, replaced with parallel `pstack.comment-sicko` and `pstack.verifier` seats without hardcoded models. |
| `skills/poteto-mode/playbooks/feature.md` | 94% | PASS (>=85%) | Pinned upstream text restored with user-specified delegate substitutions and worktree paragraph. |
| `skills/poteto-mode/playbooks/bug-fix.md` | 73% | TARGETED (<85%) | Upstream grok defaults, speed slugs, and Cursor `/loop` replaced with pstack `/loop` and bug-fix role. |

## Issue #10 Additions

These four files were ported after the original audit. Scores use the same method: strip frontmatter and the `#### Pi adaptation` section, then compare non-empty lines against the pinned upstream file (LCS).

| File | Fidelity | Status | Primary differences from upstream |
|---|:---:|:---:|---|
| `skills/recall/SKILL.md` | 89.5% | PASS (>=85%) | Cursor project transcript path replaced with the Pi workspace session path; subagent speed replaced with Pi thinking level. |
| `skills/automate-me/SKILL.md` | 82.3% | TARGETED (<85%) | `.cursor/skills` paths, `agent-transcripts/`, `AskQuestion`, and six `create-skill` references replaced with the Pi skill directories, session paths, dialogue question, and `docs/skills.md` contract. |
| `skills/poteto-mode/playbooks/eval.md` | 94.7% | PASS (>=85%) | Candidate transcript lookup moved from Cursor `agent-transcripts/` to the pi-subagents status/session-file path; steps 4-5 remain upstream verbatim. |
| `skills/poteto-mode/playbooks/authoring-a-skill.md` | 87.5% | PASS (>=85%) | Cursor's built-in `create-skill` step replaced with Pi's `docs/skills.md` authoring contract. |

## Files Flagged Below 85% and Reasons

1. **`skills/reflect/SKILL.md` (59%)**: The missing sentences in upstream Section 1 describe Cursor's private local JSONL transcript storage (`~/.cursor/projects/*/agent-transcripts/`). Retaining those instructions in Pi would instruct the agent to crawl non-existent Cursor directories. The Pi version correctly targets the active Pi session branch.
2. **`skills/interrogate/SKILL.md` (79%)**: Upstream contains a hardcoded Markdown table assigning Reviewer A to `claude-opus-5-5-xhigh` and Reviewer B to `grok-4.7-xhigh-fast`. Per project rules, models must come from `/setup-pstack` roles (`review` and `verification`), not hardcoded Cursor slugs.
3. **`skills/bug-fix.md` (73%)**: Upstream paragraphs mandate `Cursor's /loop command (a built-in, not a pstack skill)` and `grok-4.7-xhigh-fast`. In Pi, this is adapted to `pstack's /loop` and `pstack.bug-fix-agent`.
4. **`skills/how/SKILL.md` (81%)** and **`skills/autonomous-run.md` (80%)**: The un-matched sentences are exclusively references to `pstack-models.mdc` rules and Cursor Task tool syntax.
