I have enough evidence. Let me compile the review.

Summary of what I verified by reading the working-tree snapshot (no committed baseline exists — `watchdog_diff` reports committed ranges only, so this is a working-tree review, not a commit review):

**Verified correct**
- 11 skill dirs ↔ 11 `SKILL.md`; names lowercase and match dirs; every file has `license: MIT` (line 5).
- `docs/upstream-inventory.json`: 57 skills + 23 playbooks + 2 agents = 82; `docs/port-map.json` has 82 entries, 14 `adapted` (11 skills + 3 playbooks → 68 deferred, matching the approved scope), destinations exist.
- All relative links in `skills/**`, `docs/**`, `README.md`, `THIRD_PARTY_NOTICES.md` resolve (no broken in-repo link).
- `pi.skills: ["./skills"]` is the real Pi 1.3.0 manifest key (`dist/core/pi-manifest.js` `RESOURCE_FIELDS`, `core/package-manager.js:1848` `collectPackageResources`); `loadSkills` signature in `scripts/check-pi-discovery.mjs:9` matches `dist/core/skills.d.ts` (`{cwd,agentDir,skillPaths,includeDefaults}` → `{skills,diagnostics}`); `disable-model-invocation` → `disableModelInvocation` and `formatSkillsForPrompt` excluding them are real (`dist/core/skills.js`), and `/skill:<name>` commands are built for all loaded skills (`interactive-mode.js:535`).
- No Cursor leakage in skills (no `Task`/`AskQuestion`/`/loop`/`.mdc`/fixed model names; only an explicit prohibition at `poteto-mode/SKILL.md:29`). No machine-local paths in skills.
- Fixtures match the validation claims (zero-rate `||`→`??`; discount `150*1.1===165` exactly; original `check-quantity` fails with "Missing expected exception (RangeError)"); the doc honestly disclaims new-session adherence ("没有启动新的模型会话来统计技能遵循率").
- The five "body unchanged" principles are verbatim-upstream bodies (only frontmatter added).

```
## Review

### Correct
- The two claims the batch most depends on hold up in the code: (a) `disable-model-invocation: true` on all 11 skills makes `formatSkillsForPrompt` return "" and keeps `/skill:name` working (verified in Pi 1.3.0 `dist/core/skills.js` + `interactive-mode.js:535`); (b) `pi.skills: ["./skills"]` is the genuine manifest path Pi reads (`dist/core/pi-manifest.js`, `dist/core/package-manager.js:1848/1865`). `scripts/check-pi-discovery.mjs` is a faithful proxy for this. Evidence: package.json:26-30; docs/port-map.json (82 entries, 14 adapted); docs/upstream-inventory.json (57+23+2).
- Traceability is honest: index counts match (82 = 57 skills + 23 playbooks + 2 agents; 68 deferred = approved scope), every adapted destination exists, all in-repo links resolve, and the 5 unchanged principles plus `tdd` are verbatim-upstream bodies with only `license: MIT` added. License files (`LICENSE`, `LICENSES/pstack.txt`, `LICENSES/cursor-team-kit.txt`, `THIRD_PARTY_NOTICES.md`) ship in `files`.
- The evidence doc is candid about its own limits (docs/validation-p1.md:6, :49, :56) — samples were hand-run in this session only, no new-session adherence or CI claim. Fixture mechanics I re-derived all match the stated before/after values.

### Finding (P2) — adaptation record contradicts the artifact
docs/port-status.md:21 states "删除未移植的 build-the-lever 引用", but skills/principle-sequence-verifiable-units/SKILL.md:14 still reads "When a lever does the edits, the per-unit check is nearly free." `principle-build-the-lever` is `deferred` in docs/port-map.json, so the adapted skill references a concept that has no definition or link anywhere in the port. The named trailing reference was indeed removed, so this is a wording/orphan issue, not a fabricated claim. Smallest fix: reword line 14 (e.g. "When a tool or codemod does the edits…") or drop the clause, and align port-status.md:21.

### Finding (P2) — verification transcript incomplete while results are asserted
docs/validation-p1.md:58 says "具体执行命令和最终结果在完成本批检查后补齐", yet the same section asserts results (":52 发现 11 个技能，diagnostics 为 []"; ":54 核对 82 条清单、15 个归档源文件…") and README.md:5 states "已通过 Pi 1.3.0 技能发现与隔离样例检查". The loader/integrity results are reproducible, but the command+output that would let a reviewer re-run them is not recorded, so the "已通过" claim is currently asserted rather than evidenced. Smallest fix: paste the actual `npm run check` / `check:pi` stdout (or downgrade README:5 to "计划通过…检查" until recorded).

### Finding (P2) — discovery check points at a non-existent fixture
scripts/check-pi-discovery.mjs:9 passes `agentDir: resolve(root, 'scripts/fixtures/empty-agent')`, but `scripts/fixtures/` contains only `engineering/`, `engineering-accepted/`, `subagents/` — no `empty-agent/`. The path is currently inert (`includeDefaults: false` never reads it; `resolvePath` doesn't require existence), so the check still passes, but the intended "isolated config environment" is not realized and the reference is dead. Smallest fix: create the directory (with a `.gitkeep`) or drop the `agentDir` override.

### Finding (P2) — published-file set does not cover README's links
package.json:14-24 lists only 4 docs, but README.md (auto-included by npm) and THIRD_PARTY_NOTICES.md link to `docs/background.md`, `docs/sources.md`, `docs/migration-plan.md`, `docs/integration-decisions.md`, `docs/dependency-audit.json`, `docs/upstream-inventory.json`, and `AGENTS.md`, none of which are in `files`. `scripts/check-package.mjs` only verifies links resolve inside the repo, so it cannot catch this. Consequence is limited today (private, unpublished) but becomes dead links in any tarball. Smallest fix: add the referenced paths to `files`, or trim README's table. Related minor note: the five verbatim leaf principles carry only a bare `license: MIT` (e.g. skills/principle-laziness-protocol/SKILL.md:5) with no author/copyright line, unlike the playbooks ("Adapted from pstack by Lauren Tan"); package-level `LICENSES/pstack.txt` + `THIRD_PARTY_NOTICES.md` cover distribution, so this is report-only.

### Tool-rule / authorization check
No conflict found. skill tool guidance matches Pi's real tool names (`read/edit/write/grep/find/ls/bash` per `dist/core/tools/*`); `ffgrep/fffind/codemode` are hedged with "when available". No skill grants delegation/commit/push/merge (poteto-mode/SKILL.md:27-33; correct/SKILL.md:28; bug-fix.md:9). No fixed model names, no `pi.subagents`, no `agents/` — consistent with single-agent default.

### Limits (could not run)
No shell tool was available to me, so I could not execute the checks. Supervisor must run, from /Users/jiangkoumo/Documents/pi-pstack:
- `npm run check`
- `PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent npm run check:pi`
Also note the repo has no committed baseline; this review covers the untracked working-tree snapshot (files changed during the review — `THIRD_PARTY_NOTICES.md` was updated mid-review).

### Merge verdict: OK with notes
No P0/P1 within the reviewed target (11 skills + 3 playbooks + checks + evidence docs). Scope, licenses, and tool/authorization rules are consistent; the checks are sound and their claims are reproducible. The four P2s are documentation-record and packaging-hygiene items to fix before any release/publish, not blockers for the P1 batch itself.
```