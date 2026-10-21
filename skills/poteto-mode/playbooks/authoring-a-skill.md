### Authoring or modifying a skill

**You own the skill's voice.**

1. Use Pi's skill authoring contract from the installed Pi documentation (`docs/skills.md`).
2. Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve.
3. Test cases if structural. Skip if subjective.
4. Run **Opening a PR**.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per the **encode-lessons-in-structure** principle skill. Delegate to other skills by path. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream process with Cursor's built-in `create-skill` replaced by Pi's shipped authoring contract. These notes govern platform and authority differences.

**Read the contract.** The installed Pi package ships `docs/skills.md`. It defines the `SKILL.md` layout, frontmatter fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation`), the 64-character name limit, the 1024-character description limit, discovery through `.pi/skills/` and `~/.pi/agent/skills/` (plus `.agents/skills/` and `~/.agents/skills/`), and `/reload`. Read it before drafting; do not invent a field or a discovery path.

**Write with native tools.** Use `read` to inspect an existing skill, `write` to create `SKILL.md`, and `edit` for revisions. Do not use shell redirection or a script to write skill prose. Keep supporting files under the skill directory and refer to them with relative links; Pi resolves them from the skill directory. Set `disable-model-invocation: true` when the skill should load only through `/skill:<name>`.

**Validate structurally.** Check the directory name equals `name`, the description states both what the skill does and when it applies, every relative link resolves inside the skill directory, and cross-skill links point at generated skills. Inside this repository, `node scripts/skill-authoring.mjs <skill-dir>` performs these checks for one skill; `npm run check` also validates published links and generated resources. Outside the repository, start Pi where the skill is discoverable, inspect startup diagnostics, and run `/skill:<name>`. Add a behavioral test only when the skill has a structural or executable contract; subjective prose gets a review, not a fabricated benchmark.

**Authority.** Step 4's PR requires explicit authorization in the current session. Without it, prepare the skill, the validation notes, and the proposed commit/PR text locally, then report the pending action. Do not commit, push, or rewrite another contributor's skill on an upstream imperative alone. Preserve the upstream author and MIT notice when adapting source material.
