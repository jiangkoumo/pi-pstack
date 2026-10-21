# Changelog

## Unreleased — 0.3.2 in progress

Changes are listed here as their commits land. This section is not a release or acceptance claim.

- Fix `/poteto-mode status` after `on` before the first chat: report the durable mode-state file instead of requiring a transcript. Persisted `off` also reports `persistent: true`.
- Track `package-lock.json` so clean clones can use `npm ci`; explicitly install dev dependencies in CI, including the existing `jiti` dependency.
- Bound CI test execution to 180 seconds and update the clean-clone check to measure install plus test time, then check generated resources and upstream fidelity.
- Prepare the publish workflow for npm Trusted Publishing with an OIDC token permission and a compatible npm version. Publisher registration and a successful CI publication are still pending.

## 0.3.1

- Persist poteto-mode by session ID before the transcript is created.
- Preserve ambient model-provider extensions in background reviewer sessions and add restricted Git inspection for comment-sicko.
- Port recall, automate-me, eval and authoring-a-skill to Pi workspace sessions.
- Add Node implementations of PR watching, worktree auditing and local orchestration.
- Restore playbook text and add the supplied upstream-fidelity analyzer to check and publish workflows.
- Bundle the TypeScript patterns reference and declare pi-subagents as an optional peer dependency.
