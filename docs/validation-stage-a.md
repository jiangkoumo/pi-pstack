# Stage A (0.3.3) validation

This record distinguishes executed checks from pending integration. The starting main commit is `a9b36f1`; implementation is tracked in issues [#18](https://github.com/jiangkoumo/pi-pstack/issues/18), [#19](https://github.com/jiangkoumo/pi-pstack/issues/19), and [#20](https://github.com/jiangkoumo/pi-pstack/issues/20). Shared packaging and acceptance work is tracked in [#21](https://github.com/jiangkoumo/pi-pstack/issues/21) and [#22](https://github.com/jiangkoumo/pi-pstack/issues/22).

## Executed on the main working tree

- `node --test --test-name-pattern="B6 mode status" scripts/p2-runtime.test.mjs`: exit 0, 1 pass, 0 fail. The registered command handler reports durable persistence immediately after activation, before the first assistant message.
- `node --test scripts/mode-persistence.test.mjs`: exit 0, 3 pass, 0 fail, 0 skipped. Added a separate real Pi CLI invocation of `/poteto-mode status` immediately after `/poteto-mode on`, using the same session ID and an isolated agent directory. It reports `persistent: true` and `enabled: true` without making a model request. An initial assertion incorrectly assumed the sessions directory itself would be absent; Pi creates that directory, so the check now asserts the relevant behavior: zero model requests.
- Changelog package guard before the packaging change: `node scripts/check-package.mjs` exited 1 with `Missing CHANGELOG.md in package.json files`. After adding the file entry and current-version heading, the same command exited 0 and checked 155 documents and 354 relative links.
- `npm pack --dry-run --json --ignore-scripts`: exit 0; package version 0.3.3, 510 files, including `CHANGELOG.md`. This is a packaging preview, not a registry publication.
- `npm run generate`: exit 0, 117 generated resources, 2 written. These restore applicable upstream sentences in blast-radius and benchmark-checklist while keeping the delegation authorization and process ownership rules.
- `node --test scripts/upstream-fidelity.test.mjs`: the new exact 94% boundary initially failed (2 pass, 1 fail) under the old 85% gate. After raising the wrapper's gate, exit 0, 3 pass, 0 fail, 0 skipped. It rejects 4229/4501 even though that fraction rounds to 94% in the Markdown report.
- `npm run check:fidelity`: exit 0, 111 files, 4231/4501 = 94.001333%, errors empty. The unchanged Python analyzer is invoked with `--min-overall 0.94`; every ported Markdown file must still reach 70%.
- `git diff --check`: exit 0 after these changes.
- `node --test --test-timeout=30000 scripts/mode-persistence.test.mjs scripts/mode-state.test.mjs scripts/p2-runtime.test.mjs scripts/upstream-fidelity.test.mjs scripts/writer-gate.test.mjs scripts/worktree-audit.test.mjs scripts/playbook-role-routing.test.mjs scripts/comment-sicko.test.mjs`: exit 0, 46 pass, 0 fail, 0 skipped.
- `node --test --test-timeout=30000 scripts/publication-gate.test.mjs scripts/publication-host.test.mjs scripts/playbook-script-invocation.test.mjs scripts/delegation-default.test.mjs scripts/generation.test.mjs`: exit 0, 67 pass, 0 fail, 0 skipped.
- `npm test`: exit 0, 217 pass, 0 fail, 0 skipped, 55.4 seconds, natural exit on the main working tree. This is not a combined-branch or clean-clone result.

## Four flagged fidelity files

The baseline was 4229/4501 = 93.956898%, which failed the exact 94% requirement despite displaying 94% after rounding. Restoring two applicable sentences brings the current main working tree above the threshold without changing the analyzer or exempting more files. The following four files remain flagged; they are already individually listed in [fidelity-allow.txt](fidelity-allow.txt).

| File | Reason and scope |
| --- | --- |
| `skills/make-bot-ui/SKILL.md` | Deliberate substitute, with no generated skill. The upstream workflow requires webhook routines, sender secrets, and a routine wake mechanism. It remains in the overall denominator and is not claimed as a Pi implementation. |
| `skills/setup-pstack/SKILL.md` | Replaced by the `/setup-pstack` extension command and JSON role configuration. Upstream Task slugs, aliases, and `.mdc` rule persistence are not exposed as a same-named generated skill. It remains in the overall denominator. |
| `skills/poteto-help/SKILL.md` | 138 kept out of 149 non-substitution sentences; four lost sentences are the Cursor installation entry and references to guide pages 2, 6, and 9 that are not distributed with this package. |
| `skills/poteto-mode/playbooks/orchestrate.md` | 183 kept out of 202 non-substitution sentences; four lost sentences concern cloud-default selection, Cursor transcript paths, and the upstream store-lock recovery service. The Pi adapter documents the local orchestration substitute and does not claim that service. |

## Integration and remaining acceptance

The three implementation branches were merged locally in order #18, #19, #20 after user approval. #19 and #20 were rebased onto the updated main before their checks and merges. Shared integration connects npm check/test to the bounded runner, adds verifier capability to both status commands, updates verifier documentation, and wires the ketchup override before regenerating four resources.

Pre-merge checks: #18 14/14 plus the real third-party provider child probe; rebased #19 65/65 plus generated-resource check; rebased #20 11/11 plus skill-reference check. All returned exit 0. Shared status integration first failed its new capability assertion, then passed with the implementation; the combined status/generation/routing checks passed 55/55.

The integrated npm runner completed all 33 checks in 62700ms with 239 tests passed, 0 failed, 0 skipped. This run preceded two review fixes: preferring repository-local pi-subagents in the parallel-role probe, and handling SIGINT/SIGTERM to kill detached check children. The latter's regression failed before implementation and passed afterward; the runner suite passed 6/6. The isolated-agent parallel-role probe returned passed with 22 actual child requests and no empty-extensions warning. Integrated fidelity remains 4231/4501, 94.001333%.

Fresh-context read-only review used two new dsh-tui conversations. The lifecycle reviewer reproduced the dependency-discovery and interrupted-run orphan issues; the lead verified and fixed both. Verifier review identified missing strict-sandbox CI enforcement, overly permissive completion-verdict text checks, omitted ignored-file disclosure, a read-only rev-parse parser bug, and stale integration audit wording. The lead verified and fixed those issues. `PSTACK_VERIFY_REQUIRE_SANDBOX=1 node --test --test-timeout=30000 scripts/verification-exec.test.mjs scripts/verifier-child.test.mjs scripts/publication-gate.test.mjs` returned exit 0, 53 pass, 0 fail, 0 skipped, including actual OS-sandbox execution on the main host. Historical release evidence is marked as historical; ketchup's map and audit refer to this integration record. Branch-level live routing evidence is [48/48 in one run](validation-a3-routing.md); it is routing-layer evidence, not a full workflow run.

Remaining acceptance gaps: p-queue local-forge PR evidence, the same-model long-task prompting count, and OS isolation in the degraded path. Per the operator's explicit fallback, #22's p-queue workflow and prompting-count checks are **待 Hark E2E**; see the [handoff](hark-pqueue-e2e.md). The supplied method uses a local bare origin and gh shim, without creating a real GitHub PR. Preparation still needs the pinned source: both clone attempts failed with exit 128 because github.com:443 could not be reached; no model task was started. A temporary worktree plus command/environment restrictions cannot enforce scratch-only writes or prevent network access; degraded results explicitly say so. Existing fixtures and earlier releases do not substitute for those checks.

Final integrated `npm test` completed all 33 bounded checks in 60575ms: 243 pass, 0 fail, 0 skipped. `npm pack --dry-run --ignore-scripts --json` returned exit 0, version 0.3.3, 516 files including CHANGELOG.md. The three clean, merged worktrees were removed with `herdr worktree remove` (exit 0 for w18, w19, w1A); `herdr worktree list` and `git worktree list --porcelain` show only the main checkout. Branch refs are retained.

Final clean-clone `npm run check:ci` produced `status: passed` for committed `d50262bd981c799e7ab672383a850705623c567e`. The clone started clean; `npm ci --include=dev && npm test` took 65557ms, with 243 tests passed, 0 failed, 0 skipped. Generated-resource checking passed (117 checked, 0 unmanaged), and fidelity passed at 4231/4501 (94.001333%). The check process exited and was confirmed absent; full local output is `/tmp/pi-pstack-stage-a-final-ci.log`. This is local CI-equivalent evidence, not a GitHub Actions run.

Local merge/rebase and removal of the three completed worktrees were explicitly authorized. No push, tag, publish, or global installation has been performed. Remote check/publish status cannot be established for unpushed changes.
