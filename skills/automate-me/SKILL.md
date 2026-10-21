---
name: automate-me
description: "Use for \"automate me\", \"create/update/refresh my -mode skill\", \"turn/capture my preferences or working style into a skill\", or wanting agents to follow how the user works. Drafts or revises a personal -mode skill via Pi's skill authoring contract + unslop, optionally pulling fresh evidence from recent sessions."
disable-model-invocation: true
license: MIT
---

# Automate me

A guided flow for turning the user's working conventions into a skill agents will follow. The output is one `-mode` skill tailored to them (e.g. `jay-mode`, `priya-mode`).

This skill orchestrates three others: an inline mining pass (see step 1), Pi's skill authoring contract (authoring), and the **unslop** skill (prose discipline). It sequences them. It doesn't replace them.

## Flow

### 0. Check for an existing skill

Look recursively for `.pi/skills/**/*-mode/SKILL.md` and `~/.pi/agent/skills/*-mode/SKILL.md` matching the user's handle. Mode skills can live in a personal category directory (`.pi/skills/<handle>/`), not only at the top level. If one exists, confirm intent with a structured question tool when the host exposes one (otherwise ask in dialogue), unless they already said "update my skill" or similar:

- Update the existing skill (default for repeat runs)
- Start fresh (rare, ask why before doing it)

Update mode changes the rest of the flow:
- Step 1 mines only history since the skill was last edited (`git log -1 --format=%cI <path>`).
- Step 2 asks what's changed or missing, not what to capture from zero.
- Step 4 edits the existing file in place. Preserve sections the user hasn't contradicted. Revise ones with new evidence. Add new sections only for genuinely new rules.

### 1. Mine their history

Locate the active workspace's Pi sessions before fanning out: `$PI_CODING_AGENT_DIR/sessions/--<cwd-slug>--/` (default `~/.pi/agent/sessions/`; `PI_CODING_AGENT_SESSION_DIR` overrides the root), where `<cwd-slug>` drops the leading separator and turns `/`, `\`, and `:` into `-`. Use only that path. Don't glob across the sessions root; that crosses workspace boundaries and reads private chats from unrelated projects.

Survey recent agent conversations within that scope for recurring patterns. Run multiple parallel subagents across slices of history (e.g. last 2-4 weeks, split into 3 slices so each has enough material). Pick each subagent's thinking level for the job, per the Subagents section of the **poteto-mode** skill. Each slice mining subagent reads sessions from the workspace-scoped path the parent provides, looks for the signals below, and returns a short structured list of patterns it saw with evidence pointers. Default signals worth hunting:

- Response preferences (length, tone, format, "dumb it down" corrections)
- Delegation habits (subagents, models, specialized workflows, parallelism)
- Verification posture (what "done" means, unit tests vs live repro, reviewers)
- Code and prose discipline (style, principles cited, lint/format tools)
- Process conventions (worktrees, commits, PRs, review/merge tooling)
- Meta preferences (fixing skills mid-task, proposing new ones)

Cross-check across slices before elevating a signal. Patterns seen in 2+ slices are high-confidence. Lone signals are weak and usually get dropped.

### 2. Ask the user directly

Mining misses intent that hasn't come up yet. Use the host's structured question tool when one is available (for example `ask`), rather than asking the user to type from scratch; otherwise ask in dialogue with the same option shape.

Shape: one or two questions with 4-6 options each, `allow_multiple: true` for category questions. Start broad ("Which areas matter most?"), then follow up on selected areas with specific options. After the structured rounds, one free-form chat question catches anything the options missed.

Don't dump 20 questions.

### 3. Cluster findings

Group the combined signals into sections. Common ones (use only what applies):

- **Response style**: length, tone, format.
- **Autonomy**: how much to do without asking, MCP tool use.
- **Understand first**: which skills to reach for when scoping or investigating a change.
- **Subagents**: default, parallelism, model-to-task, specialized workflows.
- **Prose / code discipline**: principles, lint tools, style guides.
- **Review and verify**: repro posture, verification skills, live-testing tools.
- **Process**: git worktrees, commits, PRs, review/merge tooling.
- **Skills**: skill-authoring habits, fix-the-skill-first, proposing new skills.

The **poteto-mode** skill shows the shape. Read it for granularity. Don't copy its content. The user's rules are not the same as poteto-mode's.

### 4. Draft the skill

Use Pi's skill authoring contract from the installed Pi documentation (`docs/skills.md`) and the native `read`, `edit`, and `write` tools to author the skill. Placement:

- Path: preserve an existing mode skill's category. For a new mode, use `.pi/skills/<handle>/<handle>-mode/SKILL.md` when the repo has an established personal category for that handle. Otherwise default to `.pi/skills/<handle>-mode/SKILL.md` in the project (or `~/.pi/agent/skills/<handle>-mode/` if the user prefers a personal skill).
- Handle: the user's first name or chosen identifier.
- Frontmatter `description`: trigger on their name + `/<handle>-mode` + "work in their style", not on generic keywords like "write code" or "review PR".
- Frontmatter formatting: follow Pi's Agent Skills YAML rules. Keep `description` as one YAML scalar. Quote it or use `description: >-` with indented continuation lines when punctuation or wrapping requires it.
- Frontmatter `disable-model-invocation: true` by default. Opt out only if the user explicitly wants their mode to apply on every turn.

### 5. Iterate on prose

Apply the **unslop** skill and Pi's skill-authoring writing guidelines to every line.

Show the draft to the user and take feedback. Expect multiple iterations. Cut ruthlessly. A mode skill is not a manual.

### 6. Land it

Work in a worktree off main. Commit and open a PR. Don't push to main directly.

## Guardrails

- **Don't overfit to one conversation.** A preference stated once and contradicted another time is noise. Require multiple instances before codifying it.
- **Don't be clever.** Restating other skills' contents, inventing metaphors, or writing "poetic" prose for an agent reader is cost without benefit. Keep it operational.
- **Reference, don't inline.** Other skills the user relies on should appear as path references, not pasted excerpts. Same for any principle docs they maintain elsewhere.
- **Keep sections minimal.** Only add a section if the user has a specific, non-default rule there. "Communicate clearly" is not a section. "Short paragraphs. Tables when comparing options. Bullets only when items are genuinely parallel." is.
- **Name conventions generic.** Use "the user" or "the human" in imperatives, not the author's first name.
- **Don't force symmetry.** If a user has no process rules worth writing down, skip the Process section entirely.

## Evaluation

A `-mode` skill is subjective output. A skill-authoring test/iterate benchmark loop isn't useful here. Vibe-check with the user: does it read like them? Did it miss anything? Then ship.

Run a description-optimization loop only if the skill's trigger accuracy turns out to be a problem in practice.

## When not to use

- User wants a task-specific skill (not working conventions): Pi's skill authoring contract alone, no mining required.
- User wants to capture one narrow workflow (e.g. "how I write commit messages"). That's a regular skill, not a mode skill.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream flow with Cursor skill paths, `create-skill`, `AskQuestion`, and transcript paths replaced. These notes govern platform and authorization differences.

**Paths.** Pi discovers project skills under `.pi/skills/` and user skills under `~/.pi/agent/skills/` (plus `.agents/skills/` and `~/.agents/skills/` when the operator uses the portable Agent Skills locations). Read the installed Pi package's `docs/skills.md` before drafting; it defines frontmatter fields, name and description limits, discovery, and `/reload` behavior. A package can also ship a mode skill under its own `skills/` directory.

**History scope and ordering.** Resolve the workspace sessions exactly as step 1 states. List candidate files with `ls -t`, take the modification time from the filesystem, and exclude `$PI_SESSION_FILE` so the current chat does not mine itself. Skip subagent, eval, and test sessions by their header, name, or first user message. Do not scan `sessions/*` or another project's directory, and do not read a session outside the operator's authorized scope. If the operator names a session file directly, use only that file.

**Mining delegates.** Use pi-subagents with the configured `verification` role (`pstack.verifier`) and omit `model`; never put a model on an outer call or a task item. Each child reads only the slice it was given and returns patterns with session UUID and line or entry pointers. If pi-subagents is unavailable or delegation is forbidden, mine sequentially and label the result self-review. Cross-check slices before codifying a rule.

**Questions.** Pi has no mandatory structured-question tool. Use `ask_user_question` or `ask` when the host exposes one; otherwise ask the same short option list in plain dialogue. Never fabricate an answer or silently choose for the user.

**Drafting and validation.** Use `read`, `write`, and `edit` for the skill file; never shell redirection. Validate that the frontmatter has a valid `name` and a routing `description`, the directory name matches `name`, referenced files exist, and cross-skill links resolve. Inside this repository, `node scripts/skill-authoring.mjs <skill-dir>` runs the same structural checks; elsewhere, run Pi from a location where the skill is discoverable and inspect the startup diagnostics and `/skill:<name>`.

**Privacy and authority.** Mining is read-only. Keep private session content out of summaries, drafts, commits, and public output; cite a session by UUID only inside the operator's workspace. Step 6's commit and PR require explicit authorization in the current session. Without it, prepare the draft and the proposed commit/PR text locally and report the pending action. Do not push to main, open a PR, or rewrite history on an upstream imperative alone.
