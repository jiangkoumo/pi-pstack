# Formal verification gate bounded execution regression

This fixes the production completion gate after the p-queue E2E report of 92 repeated prompts for already passing commands. The report is operator-provided evidence; this change does not claim a new p-queue model run.

## Implemented behavior

- Production `index.ts` registration constructs a real runner without a test-injected runner. Shell commands run from the generated skill's owning project root, preserving quotes and shell syntax. Execution reuses the verification backend's process runner: 30-second timeout, process-group termination, and 128 KiB capture per stream.
- Explicit `verification_exec` TLC requests use `runTlcVerification`, retaining configured jar/path/option checks and execution isolation. Missing TLC becomes a blocked outcome with its reason.
- Both completion checks share `formal-commands.mjs`. Only `sh`/`bash` command blocks and explicit tool invocation lines inside Run it are executable; ordinary expected-output blocks are excluded. Receipts match the complete command.
- Gate state persists in branch entries. It shares `autoContinue.maxTurns` (default 3) and stops early after two identical missing-item lists. A terminal failure requests one final report listing unverified items, then forbids another automatic retry for that request. Auto-continue and `/loop` cannot override that boundary. A new user message resets state; historical skill mentions alone do not activate a new request.
- User/project configuration accepts autoContinue settings, preserves them through role edits, merges object fields, and applies project settings only when trusted. Invalid configuration yields a blocked report rather than executing commands.

## Actual validation

`node --test scripts/formal-verification-gate.test.mjs scripts/auto-continue.test.mjs scripts/p2-runtime.test.mjs scripts/verification-exec.test.mjs scripts/loop.test.mjs` exited 0: 125 tests, 124 passed, 0 failed, 1 skipped (real TLC unavailable).

`npm test` exited 0 after the review fixes: 36/36 check commands passed, 0 failed, 0 timed out (75.2 seconds). TAP suites totaled 387 tests: 353 passed, 0 failed, 34 skipped; separate script checks also passed. The complete command log is `/tmp/pi-pstack-formal-reviewed-test.log`. `git diff --check` exited 0.

Independent read-only review found no P0/P1. Its final follow-up identified that `/loop` must also inspect persisted branch state after the gate's final reporting turn. That one-line fix and repeated-settlement regression were applied afterward. The affected `formal-verification-gate`, `loop`, and `p2-runtime` suites then exited 0 (67 passed, 0 failed); `node scripts/check-package.mjs` and `git diff --check` also exited 0. The full suite above predates only that final scoped fix and this validation document.

The formal gate suite includes an actual Pi SDK host loaded through production `index.ts`, a local SSE model fixture, and a temporary `.pi/skills/x/SKILL.md`. No mock runner is passed. It asserts:

- Passing repository-relative command: one process execution, one model request, no continuation.
- Fixed failing command: two process executions, then a final unverified-report request; three model requests total, followed by settlement.
- Changing failures obey configured maxTurns even with generic auto-continue enabled.
- Terminal state prevents command execution on repeated settlements; an explicitly invoked new request resets it.
- Expected output is not executed, structured TLC calls are retained, configuration failures are reported, and a real shell timeout returns 124.

## Breakage evidence follow-up

The completion evaluator now recognizes `Break cycle N`, `cycle N`, and Chinese numbered round labels, deduplicates cycle identities, and falls back to the Record section when the report lacks sufficient breakage details. Record extraction retains nested headings. Deliberate mutation exit codes in Record no longer override the restored Run it commands' required exit code 0.

The focused command `node --test scripts/auto-continue.test.mjs scripts/formal-verification-gate.test.mjs` exited 0 with 67 passed and 0 failed. The new alias and Record fallback cases failed before the fix (2 failures); a production registration case additionally exposed and now covers the mutation-exit-code collision. Negative cases retain rejection of repeated cycle 1, successful-only cycles, unrelated cycle labels, and evidence outside Record.

After this follow-up, `npm test` exited 0: 36/36 check commands passed, 0 failed, 0 timed out (68.1 seconds); TAP suites totaled 392 tests, 358 passed, 0 failed, and 34 skipped. Log: `/tmp/pi-pstack-breakage-test.log`. `git diff --check` also exited 0.

These regression texts are synthetic reproductions of the reported wording. The original p-queue Record text was not available in this checkout; it has not been validated verbatim.

## Limits

This fixture proves production registration, command execution, and Pi settlement behavior. It does not establish that a live model follows the final reporting instruction, repeat the original p-queue E2E, or validate real TLC on a configured jar. The p-queue forwarder scripts and generated skill prose mentioned in the operator report are outside this repository and have not been cleaned up. No global Pi installation/configuration, commit, push, or release was performed.
