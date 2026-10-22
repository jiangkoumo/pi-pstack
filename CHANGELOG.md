# Changelog

Changes to the Pi adaptation are recorded here. Upstream pstack remains pinned to the revision documented in [sources](docs/sources.md).

## 0.3.4

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
