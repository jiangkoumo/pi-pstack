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

## Pending

The three implementation branches are still active. Their full suites, fresh-context reviews, single-run live routing 46/46, no-bwrap verifier execution, p-queue external PR evidence, long-task prompting count, and combined clean-clone `npm ci && npm test` under 180 seconds are not yet established. Existing workflow fixtures and earlier release records do not substitute for these checks.

No merge, rebase, push, tag, publish, global installation, or worktree deletion has been performed for Stage A. Remote check/publish status cannot be established for unpushed changes.
