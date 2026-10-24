# Changelog

Changes to the Pi adaptation are recorded here. Upstream pstack remains pinned to the revision documented in [sources](docs/sources.md).

## 0.3.12

- Fix #35: activate the formal verification completion gate only from explicit parameters, leading `/skill:create-formal-verification-skill` or `/skill:maintain-formal-verification-skill` commands, actual Pi skill-loading wrappers, recorded read calls, or modified workspace verification skills containing `## Run it`. Help text, ordinary mentions, negations, recommendations and paths in tool output no longer trigger verification. Use the latest invocation evidence to select create/maintain and report its actual source.
- Resolve #34: use `/poteto on|off|status` for persistent mode; `/poteto` without arguments shows status. Keep `/skill:poteto-mode` unchanged and preserve stored state, branch restoration and on/off behavior without migration. Update current docs and regenerate the affected skills from their Pi adaptation sources.
- Deprecate `/poteto-mode`: retain the alias throughout 0.3.x and 0.4.x, warn before every invocation, and remove it in **0.5.0**. Its description begins with `[已弃用]`. Pi 1.4.0 has no public API to hide one command from completion, so the old alias remains visible during this period. Invalid-argument usage points to `/poteto`.
- Add trigger, lifecycle, command, alias and state compatibility regressions; validate the help/explicit-formal trigger behavior and new completion entries in real Pi TUI sessions with isolated configuration. Compare discovered skill commands against the generation manifest instead of a stale fixed count.

## 0.3.11

- Accept Chinese coverage and unverified-scope labels in formal completion reports, plus Chinese tool-version, sync-commit, bounds/assumption, and exclusion fields in Record. Exclusion-only text cannot establish positive coverage. Add Chinese-report unit and production registration regressions.

## 0.3.10

- Recognize `Break cycle N`, `cycle N`, and Chinese numbered round labels in formal breakage evidence; count distinct cycle numbers and accept common nonzero exit-code notation.
- Fall back to breakage evidence in the generated skill's Record section, including nested headings, when the final report omits the cycle details. Keep deliberate mutation failures separate from the restored Run it commands' expected successful exit. Add unit and production registration regressions.

## 0.3.9

- Connect the production formal gate to real shell execution from the generated skill's repository root, with a 30-second command timeout; route explicit `verification_exec` TLC requests through the existing restricted TLC backend.
- Share Run it parsing between execution and completion checks: accept `sh`/`bash` blocks and explicit tool invocations, exclude output examples, and match execution receipts by the complete command.
- Bound formal retries with `autoContinue.maxTurns` (default 3); stop on two identical missing-item lists, request one final report listing unverified items, and suppress further automatic continuation until a new user message.
- Accept and preserve autoContinue settings in user/project configuration. Add production registration and real Pi host tests for successful execution, failed checks, budget exhaustion, and reset.

## 0.3.8

- Fix formal verification gate lifecycle in `-p` mode when `event.entries` is empty (`extensions/pstack/formal-verification-gate.mjs`):
  - Merge historical session entries from `branch` with pending turn entries, ensuring trigger detection and completion evaluation inspect session history.
  - Safe handling of empty or missing entries in `auto-continue.mjs` runCheck.
- Fix untracked skill file discovery in workspace git status (`extensions/pstack/formal-verification-gate.mjs`):
  - Pass `-uall` (`--untracked-files=all`) to `git status --porcelain` to prevent untracked directories like `.pi/` from being collapsed into `?? .pi/`.
- Fix skill kind misclassification between `create` and `maintain` (`extensions/pstack/formal-verification-gate.mjs`):
  - Distinguish loaded skill declarations and user prompt requests from cross-reference links in skill body text, preventing `create-formal-verification-skill` from being misclassified as `maintain`.
- Broaden continuation intent detection and prevent false positive delivery stops (`extensions/pstack/auto-continue.mjs`):
  - Generalize sentence-initial `Let me <verb>` intent detection while strictly excluding non-continuation pleasantries like `Let me know`.
  - Tighten `Next step:` regex to prevent completed handovers like `Done... Next step: you can review the PR at ...` from falsely triggering continuation.
- Update `THIRD_PARTY_NOTICES.md` to current pinned upstream baseline `eb4db2b5` (v0.15.30) with 55 adapted skills.

## 0.3.7

- Formal verification completion judgment transitions from regex patterns to artifact self-check and command re-run verification (`extensions/pstack/formal-verification-gate.mjs`, #32):
  - Detects activation via create/maintain-formal-verification-skill invocation in session or modified `.pi/skills/*/SKILL.md` (and `.agents/skills/*/SKILL.md`) containing `## Run it`.
  - Re-runs every command in `## Run it` from the target directory and parses actual execution metrics (exit code `rc`, `distinct` states, `depth`, total `states`, `steps`, `members`, and `scenarios`).
  - Itemizes exact differences when output metrics mismatch descriptions in `SKILL.md`, and includes discrepancies in continuation prompts.
  - Requires satisfied command metrics, complete Record section, and final delivery report with deliberate breakage evidence (2 break/restore cycles for create, 1 for maintain) before marking completion.
  - Registers `registerFormalVerificationGate` into host `agent_before_settle` lifecycle.
- Narrow `auto-continue` activation scope and user-facing turn bounds (`extensions/pstack/auto-continue.mjs`, #33):
  - Default activation scoped to sessions where poteto-mode is active, remaining inactive by default in plain sessions unless explicitly enabled in `pstack.json` via `autoContinue`.
  - Halts auto-continuation whenever assistant text contains questions (`?`, `？`), approval requests (`approve`, `approval`), multi-choice queries (`which`), user decisions (`你决定`, `是否`), or authorization gate keywords.
  - Removes `waiting for approval to proceed` from waiting continuation signals.
  - Appends mandatory caution to `renderAutoContinuePrompt`: "不要越过任何待用户确认的授权门；如果上一条是在等用户，就原样停下。".
  - Ignores checklist items marked with `(optional)` or `[optional]` from triggering incomplete task continuation.
- Session state reset on new user messages and continuation intent fixes (`extensions/pstack/auto-continue.mjs`, #33):
  - Resets continuation state and turn budget upon receiving subsequent user messages, preventing previous terminal states (`completed`, `stopped`) from blocking later turns in the session.
  - Extends continuation intent detection to recognize action-verb leads such as `"Let me fix those and add the missing timer updates."`.
  - Adds unit test suite with 6 regression cases (5 false-positive user gate cases + 1 true-positive continuation case) and comprehensive lifecycle tests.

## 0.3.6

- Add pre-completion self-check protocol to formal verification skill templates (`/create-formal-verification-skill` and `/maintain-formal-verification-skill`): requires all "Run it" commands in generated SKILL.md to be re-executed, output counts and conclusions to match skill description, complete Record section, and final report delivery.
- Implement unified auto-continue and unfinished expression detection mechanism (`extensions/pstack/auto-continue.mjs`): inspects assistant messages for forward-looking unfinished intent (e.g. "Now let me...", "接下来要做...", uncompleted task lists) and automatically triggers continuation under `autoContinue` configuration with strict max turn limits.
- Wire auto-continue lifecycle into `extensions/pstack/index.ts` and add full unit test suite `scripts/auto-continue.test.mjs` to `run-checks.mjs`.
- Document verified TLC2 version recommendations and note upstream `statechart.test.mjs` test #55 sensitivity to TLC2 standard module extraction path formatting in `README.md` and `docs/validation-statechart-outputfolder.md`.

## 0.3.5

- Pinned upstream pstack baseline to `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10` (pstack 0.15.30).
- Support restricted TLA+/TLC model checking in `verification_exec`: sandboxed OS execution, strict jar binding, whitelisted flags, `.tla`/`.cfg` path restriction, output classification with invariant violation detection (exit 12), and explicit fallback reporting `未做形式化验证，原因是缺少 TLC` with generated-input real code tests (never claimed as a formal pass).
- Port formal verification skills: `/create-formal-verification-skill` (formal invariant verification with real code checks), `/maintain-formal-verification-skill` (specification maintenance and drift triage), and `/statechart` (Mermaid statecharts from specs/code, TLC model generation, and diagram rendering via OutputFolder).
- Add step 8 to `/setup-pstack`: prompt once per project for formal verification skill setup, adaptively guided by host TLC capability probe, with persistent decision recording in project-local state.
- Reverse `/skill:sharpen` behavior to deepen instead of widen tasks, returning strictly the rewritten prompt.
- Update `/skill:ketchup` to itemize all pending user decisions with complete context while strictly preserving conversation boundary against past sessions.
- Enforce strict type guard patterns over `as` type assertions in `skills/typescript-best-practices`.
- Add `docs-vs-tree` verification in `scripts/check-package.mjs` ensuring all skills and slash commands mentioned in documentation exist.
- Standardize all skill frontmatter names to kebab-case matching folder names.


- Declare `subagentOnlyExtensions: ../extensions/pstack/index.ts` in `pstack.verifier` and `pstack.comment-sicko` agent definitions and templates so foreground child sessions (which never load ambient parent extensions) receive `verification_exec` and `git_read`.
- Preserve ambient extension loading in background child sessions without disabling ambient provider extensions, keeping third-party provider models resolvable.
- Add foreground child verification in `scripts/verifier-child.test.mjs` covering both foreground and detached background execution under sandbox constraints.
- Validate `subagentOnlyExtensions` in generation checks and reject read-only agents missing required extension paths.

## 0.3.3

- Include this changelog in the npm package and require a release heading for the current package version in the package check.
- Require exact upstream fidelity of at least 94%, with a regression for the former score that rounded to 94% but did not meet that threshold. Restore two applicable upstream sentences while keeping the existing authorization boundaries.
- Add a real Pi CLI check of immediate poteto-mode persistence status, without a model request.
- Bound every npm check with a process-tree timeout; close SDK/SSE fixtures with a five-second cleanup budget, preserve failure exits, and stop detached checks on interruption.
- Preserve ambient provider extensions in child fixtures and prefer the locked repository-local pi-subagents dependency.
- Execute verification in a temporary Git workspace when no OS sandbox is usable; expose degraded execution, limitations, and responsibility in tool results and status commands. This fallback does not enforce network or filesystem isolation.
- Require verifier evidence or a named responsible verifier before PR publication. Add read-only Git/PR completion checks and preserve bounded-loop stop controls.
- Separate ketchup current-conversation recaps from recall history; preserve the original 46 routing cases and add two ketchup cases. A single branch-level live run passed 48/48; full external PR workflow acceptance remains pending.

## 0.3.2

Published by GitHub Actions on 2026-10-21. Local and CI validation passed; evidence is in docs/validation-032-release.md.

- Fix `/poteto-mode status` after `on` before the first chat: report the durable mode-state file instead of requiring a transcript. Persisted `off` also reports `persistent: true`.
- Track `package-lock.json` so clean clones can use `npm ci`; explicitly install dev dependencies in CI, including the existing `jiti` dependency.
- Bound CI test execution to 180 seconds and update the clean-clone check to measure install plus test time, then check generated resources and upstream fidelity.
- Publish from GitHub Actions using the repository NPM_TOKEN secret configured from the operator’s existing npm authentication. OIDC support is available, but Trusted Publisher registration is not used for this release.
- Shut down the extension runtime before disposing reviewer fixture sessions, and assert that watcher intervals are cleared. Discover the locked local pi-subagents dependency in clean CI.
- Mechanically check Conventional commit/PR titles, required ordered PR headings and the latest recorded test counts; reject common shell wrapper, alias and API bypasses.
- Add verifier execution under an OS sandbox with real exit codes, write/network denial, timeouts and output bounds; validate the production detached verifier child and require sandbox checks before CI publishing.
- Restore recall/TDD/sharpen/correct routing and replace obsolete substitute routes. Add a reconstructed 46-case live routing suite, skill-reference checks and exact current-workspace session guidance.
- Require shipped worktree-audit and watch-pr invocations in their playbooks, with explicit package-root paths and read-only defaults.
- Restore show-me-your-work to 96.92% and why to 93.75% text fidelity; swarm improves to 84.38% and its remaining gap is recorded. Remove the three lost-sentence allowlist entries.

## 0.3.1

- Persist poteto-mode by session ID before the transcript is created.
- Preserve ambient model-provider extensions in background reviewer sessions and add restricted Git inspection for comment-sicko.
- Port recall, automate-me, eval and authoring-a-skill to Pi workspace sessions.
- Add Node implementations of PR watching, worktree auditing and local orchestration.
- Restore playbook text and add the supplied upstream-fidelity analyzer to check and publish workflows.
- Bundle the TypeScript patterns reference and declare pi-subagents as an optional peer dependency.

## 0.3.0

- Integrate playbook role selection and persistent mode state.
- Restore upstream wording in engineering playbooks and review skills, including feature and bug-fix delegation guidance.
- Align PR body guidance and generated templates and record upstream fidelity comparisons.
- Standardize the repository's GitHub Issues workflow for parallel development.
