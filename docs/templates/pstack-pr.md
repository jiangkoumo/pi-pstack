# PR evidence template

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT, pinned at `f713f14203cd6420cec13cd7c55c32d598dbab68`. See [license](../../LICENSES/pstack.txt) and [plan contract](pstack-plan.md). This template preserves independently verifiable PRs and current-head evidence while replacing automatic shipping with explicit authorization.

Copy the body below to the run's PR body file. Resolve this source template from the package root. Replace every placeholder before use. Evidence paths are relative to the plan file, not this template or the shell cwd. Creating or editing a remote PR requires authorization; prepare this local body first and use the authorized CLI's `--body-file` option. Do not interpolate review text into shell commands.

---

## Problem and resulting behavior

<Concrete trigger, previous behavior, resulting behavior, and who benefits.>

## Scope and dependencies

- Plan path and PR id: <path and id>.
- Parent PR ids and accepted heads: <ids and full SHAs, or none>.
- Branch, base and current head: <branch, base, full SHA>.
- Allowed files and exclusions: <paths>.
- Observable acceptance result: <scenario and pass predicate>.

## Verification at the current head

Tests alone are not sufficient verification. Unit, live and perf gates need evidence; a perf exemption needs a concrete reason. CI green is an input, not the verdict. Re-verify affected behavior at every new head.

| Gate | Command or procedure | Exit / result | Evidence relative to plan | Head SHA |
| --- | --- | --- | --- | --- |
| Unit | <exact command and cwd> | <actual code and counts> | <log> | <full SHA> |
| Live | <drive real surface, concrete scenario and pass predicate> | <actual observation> | <log or screenshot> | <full SHA> |
| Regression | <same load-bearing scenario on trunk and head> | <actual comparison or documented trunk absence> | <artifact> | <full SHA> |
| Perf | <metric, interleaved trunk/head probe, baseline, numeric fail threshold> | <actual measurements, or reasoned not applicable> | <artifact or exemption> | <full SHA> |
| Independent audit | <reviewer, inspected files, finding disposition> | <pass, failed, blocked> | <report> | <full SHA> |

For ten live lanes list each lane's scenario, drive method, saved screenshot and pass predicate. A missing or blocked lane remains incomplete. If trunk lacks the feature, isolate added work and use absolute budgets for the user's end state; never report an incomparable speed ratio.

## Interaction review gate

<No interaction change, with reason; or screenshot paths, video path, exact operator review evidence and approval state.>

## Risks and unresolved findings

<Owner for each blocker, failures and deviations, follow-ups outside scope, rollback considerations. Do not mark a failed or blocked verifier as a pass.>

## Landing authorization

- Exact-head verdict: <verifier, verdict and receipt path>.
- Frontier generation and lowest unmerged PR: <generation and PR>.
- Owner approval / authorization: <actual grant or pending>.
- Next authorized action: <one concrete action>.

Stop at merge-ready when authorization is pending. Opening a PR, pushing, rebasing, retargeting, force-pushing, merging and deleting each retain their own operator gates. Babysitting cannot grant them. Keep the PR body aligned with the plan receipts and re-read the forge head immediately before any authorized operation.
