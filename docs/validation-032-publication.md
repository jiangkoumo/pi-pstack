# Publication gate validation (Issue #12)

Date: 2026-10-21. Branch: `fix/12-publication-gate`. Scope: mechanically enforce the pinned upstream
`opening-a-pr` title/body contract before `git commit` and `gh pr create` run, and make reported test
counts traceable to the last actual run.

Source: operator report for 0.3.1 (p-queue #177 passed 307/307). The report is a reproduction lead,
not proven root cause; this change adds an independent mechanical check rather than asserting the
report's inference. Upstream policy baseline: `skills/poteto-mode/playbooks/opening-a-pr.md` at
`f713f14203cd6420cec13cd7c55c32d598dbab68` (MIT, Copyright (c) 2026 Lauren Tan).

## Baseline before this change

The worktree inherited `NODE_ENV=production` and an npm `omit=dev` setting, so the first
`npm install` left `jiti` missing and `node --test scripts/p2-runtime.test.mjs` failed with
`ERR_MODULE_NOT_FOUND`. That is an environment override, not a repository defect. Reinstalling with
`NODE_ENV=development npm install --include=dev --cache /tmp/pstack-032-cache-12` resolved it.

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run check` (baseline, before edits) | 0 | 159 Node tests passed, 0 failed; package/generation and host probes passed |

`159` is the sum of the `# tests` summaries printed by the chained `node --test` invocations in the
baseline run. (Older validation records list 162 for an earlier revision; this branch's actual run is
159.)

## Implemented

| File | Change |
| --- | --- |
| `extensions/pstack/publication-gate.mjs` | New pure inspector, receipt store, Pi handler registration, and CLI. No git/gh/shell execution. |
| `scripts/publication-gate.test.mjs` | 25 behavior tests for titles, PR headings, order, stale counts, failed receipts, exact-argv matching, multi-invocation refusal, wrappers, aliases, `gh api`, variable executables, `verification_exec`, handler wiring, linked-worktree storage, and CLI exit codes. |
| `adapters/pi/overrides/skills/poteto-mode/playbooks/opening-a-pr.md.template` | Records the mechanical gate and corrects the self-check: five sections are required; `## Tradeoffs` is optional and only sits between Scope and Blast Radius. |
| `docs/templates/pstack-pr.md` | States the gate behavior and the optional Tradeoffs position. |

### Contract enforced

- Title: `type(scope): subject`; known type; lowercase scope; no trailing `.`/`!`/`?`; one line;
  concrete subject without `<placeholder>` or `TODO`/`TBD`/`CHANGEME`.
- Body headings: `## Why`, `## What changed`, `## Scope`, `## Blast Radius`, `## Verification`
  required; `## Tradeoffs` optional and only between Scope and Blast Radius. Unknown, duplicate,
  empty required, placeholder-only, bold lead-in (`**Why**`) and out-of-order headings are rejected.
- `gh pr create`: always needs `--title` and `--body`/`--body-file`; the body must satisfy the heading
  contract.
- `git commit`: always needs a visible message (`-m` or `-F`) and a valid title. An ordinary commit
  body is not forced into the PR shape, so `Fixes #12` and prose are allowed. `requireCommitBody: true`
  opts into the stricter PR-shaped commit body. Editor, stdin (`-F -`), `--amend`/`--no-edit` without
  a new message, message reuse (`-C`/`-c`/`--fixup`/`--squash`), `--fill` and `--web` are refused
  because the gate cannot verify them.
- Test counts: any `N pass`/`N/N`/`N tests`/`N fail`/`N skipped` claim in a PR `## Verification` must
  match the last recorded run of the cited command. Matching is exact at the argv level, so a
  different `--filter`/`--test-name-pattern` is a different run. A count that matches an older run is
  reported as stale. A run recorded with `ok: false` (the command exited non-zero, failed, or timed
  out) cannot support any count claim. No recorded run means the claim is rejected. Counts are
  recorded from the actual bash or `verification_exec` result, not from the body.
- The parser is fail-closed for wrappers and hidden requests: `sudo`, `env`, `nice`, `stdbuf`,
  `timeout`, `bash -c/-lc`, `eval`, `xargs`, chained commands, quoted `git commit` text, command
  substitution, and a variable-expanded executable carrying `commit`/`pr create`/`pulls`. It does not
  expand shell variables; it refuses the request instead.
- Command-level git aliases are resolved: `git -c alias.ci=commit ci` is blocked and must use
  `git commit` directly. Aliases from global config are not visible to the gate.
- `gh api` writes to `/pulls` and GraphQL mutations are refused with a pointer to
  `gh pr create --title ... --body-file ...`; read-only `gh api` calls stay allowed.
- `verification_exec` results are recorded when the host reports structured details
  `{ok, status, exitCode}` and renders a `STDOUT` block; only `status: passed` with exit code 0
  counts as a successful run.

Receipts stay out of the working tree: a normal repository uses
`<git-dir>/pstack-publication-receipts.json`; a linked worktree whose gitdir lives in the main
repository uses a per-checkout temp store (the host can pass `receiptPath` / `--receipt-path` for a
durable location). Writes are atomic and capped at 50 runs. A command that runs more than one test
invocation (`npm test && node --test other.mjs`) is refused a receipt, because summing both summaries
would create a count that belongs to neither run; run each command separately.

## Verification

| Command | Exit | Result |
| --- | ---: | --- |
| `node --test scripts/publication-gate.test.mjs` | 0 | 25 tests, 25 pass, 0 fail |
| `node extensions/pstack/publication-gate.mjs inspect --command 'git commit -m "Update the gate"'` | 1 | `status: block`, Conventional Commits rejection |
| `node extensions/pstack/publication-gate.mjs inspect --command 'git commit -m "fix(pstack): close the publication gate"'` | 0 | `status: allow` |
| `node scripts/generate-pi-resources.mjs --check` | 1 | Only expected drift: generated `skills/poteto-mode/playbooks/opening-a-pr.md` no longer matches the edited template; the primary controller regenerates it |
| `npm run check` in a temp copy after `node scripts/generate-pi-resources.mjs` | 0 | 159 tests pass, 0 fail; `resourceGeneration: in-sync`; unrelated to the worktree's expected generation drift |
| `record --command 'npm run check' --output-file <captured check.log>` | 0 | Recorded `{tests:159, pass:159, fail:0}` from the real run |
| `check --kind pr --title 'feat(pstack): verify publication counts' --body-file <body claiming 159/159>` | 0 | `publication contract satisfied` |
| Same body with an old `162/162` claim | 1 | Rejected: both counts differ from the last recorded run |

The test suite covers: bad/missing scope/trailing period titles; missing PR heading; wrong order;
unknown/duplicate/empty/placeholder sections; bad commit title; compliant commit; ordinary commit
bodies (`Fixes #12`, count claims) staying outside the PR shape; the opt-in strict commit body;
`-F`/`--file`; `-F -`; `--amend` with and without a message; `-C`; `--fixup`; `--edit`;
PR title/body/body-file; missing body file; `--fill`; `body` plus `body-file`; `sudo`, `bash -c`,
`bash -lc`, `env`, `nice`, `stdbuf`, `timeout`, shell-escaped executables, chaining, quoted and
substituted requests; variable-expanded executables; in-command git aliases; `gh api` pull writes
versus reads; failed receipts; test summary aggregation; stale and mismatched counts; exact-argv
matching for different test filters; refusal to record a command with several test invocations;
corrupt receipt store; linked-worktree temp storage; bash full-output fallback; `verification_exec`
structured results; real Pi handler block/allow and recording; CLI exit codes 0/1/2. Read-only
commands such as `git log --grep commit` and `git show commit` stay allowed.

## Not done in this worktree (assigned to the primary controller)

This worktree was not authorized to edit the extension entry, `package.json`, or generated
`skills/`/`agents/`. The module therefore exists but is not yet wired into the shipped extension.

1. **Entry wiring** in `extensions/pstack/index.ts`: add
   `import { registerPublicationGate } from './publication-gate.mjs';` and call
   `registerPublicationGate(pi);` once during extension setup (for example after
   `registerLoopAbortHooks(pi);`). The default is an unconditional mechanical gate; pass
   `{ enabled: () => state(ctx).enabled }` only if the operator wants it behind poteto-mode, which
   would weaken the "mechanical before commit" claim.
2. **Check wiring** in `package.json`: append `&& node --test scripts/publication-gate.test.mjs` to
   the `check` script so CI runs the new suite. Also add a dedicated `check:publication` script if
   desired.
3. **Regeneration**: run `npm run generate` and commit the regenerated
   `skills/poteto-mode/playbooks/opening-a-pr.md`; then `npm run check:generate` passes.
4. **Real end-to-end commit/PR**: load the wired extension in an isolated Pi configuration, attempt a
   bad `git commit` (blocked), a compliant commit (allowed), a bad `gh pr create` body-file
   (blocked), and a compliant PR body (allowed). The external PR operation still needs the
   operator's authorization. This worktree did not push, open a PR, or run the extension through a
   real Pi host, so no end-to-end claim is made here.
5. **verification_exec wiring**: the gate now records `verification_exec` tool results using the
   Issue #13 details contract `{ok, status, exitCode}` and the rendered `STDOUT:` block. The host
   must register that tool and dispatch the `tool_result` event for this handler to see it. The
   current worktree does not include `extensions/pstack/verification-exec.mjs`.

## Limits and explicit non-goals

- The gate is a preflight over the request string, not proof that the change works and not an OS
  execution boundary. A publication command started inside `node`, `npm`, a package script, a
  release helper, or another tool the host exposes (for example PowerShell) is outside this module.
  It also does not observe detached child processes.
- Shell support is deliberately partial: known wrappers and variable-expanded executables are
  refused, but the gate does not implement full shell expansion or PowerShell parsing. When it cannot
  name the request, it blocks; when a program hides the request from the command string, only a Git
  hook, CI check, or binary-level wrapper can close that gap.
- Count extraction is heuristic for the Node test reporter (`# tests`/`# pass`/`# fail` and the
  `ℹ` spec lines) plus mocha-style `N passing`. It trusts the output the host reports: a test script
  that prints its own summary lines, or a forged stdout, can still poison a receipt. Other runners
  need their own summary support.
- Receipts are not signed. An agent that can write the store can change or delete it; the store is
  evidence of what the host reported, not a cryptographic attestation, and this module does not add
  HMAC or a privileged ledger.
- A linked worktree whose gitdir is outside the writable workspace uses a temp store keyed by the
  checkout path. It survives tool calls in the session but not a reboot or temp cleanup; pass an
  explicit receipt path when the evidence must outlive the machine.
- Global git aliases are not visible to the gate; only aliases defined in the same command are
  resolved.
- `git commit` bodies are not checked against the PR headings by default; set `requireCommitBody` if
  every commit must carry the full PR body.
