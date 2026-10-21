# Changelog

## 0.3.2

Release candidate validated locally and in CI; npm publication is tracked in the release validation record.

- Fix `/poteto-mode status` after `on` before the first chat: report the durable mode-state file instead of requiring a transcript. Persisted `off` also reports `persistent: true`.
- Track `package-lock.json` so clean clones can use `npm ci`; explicitly install dev dependencies in CI, including the existing `jiti` dependency.
- Bound CI test execution to 180 seconds and update the clean-clone check to measure install plus test time, then check generated resources and upstream fidelity.
- Prepare the publish workflow for npm Trusted Publishing with an OIDC token permission and a compatible npm version. Publisher registration and a successful CI publication are still pending.
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
