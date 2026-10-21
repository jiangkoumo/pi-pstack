# Feature and bug-fix playbook restoration

The feature and bug-fix templates now preserve the operator-supplied bodies. Generated resources come from `adapters/pi/overrides/skills/poteto-mode/playbooks/*.md.template`; the generator itself and the pinned upstream archive are unchanged.

The pinned feature body matches after replacing the Cursor model/speed wording and adding the operator-supplied worktree paragraph. The pinned bug-fix body matches after replacing the Cursor model/speed and `/loop` wording. Exact string comparisons of both generated bodies, excluding `Pi adaptation`, passed. This comparison is not a result from `tools/upstream-fidelity.py`.

## Interface and routing

Installed pi-subagents version: 0.79.2. Public tool schema and `docs/tool-reference.md` confirm the `subagent` tool, named workflows, `cwd`, and `worktree`. The existing `scripts/check-parallel-roles.mjs` additionally executes the named parallel workflow through the public package entry with `workflow: "parallel", args: { tasks: [{ agent, task }] }`.

The adaptation sections use `args.tasks`, omit task-item and outer `model`, and document managed isolation with `cwd: "<source-repo>", worktree: true`. Manual `git worktree add` remains supported through `cwd: "<worktree-path>", worktree: false`.

Poteto-mode's routing table maps reported broken behavior to `playbooks/bug-fix.md` and new or changed behavior to `playbooks/feature.md`. Persistent mode instructs the model to read that entry and its matching playbook. The entry, harness adapter, runtime role reminder, orchestration guidance, and 14 collaborating skill templates no longer restrict role routing to direct calls. Opening a PR now requires interrogate or equivalent parallel read-only review before the external write.

## Executed checks

All commands ran from the package root:

| Check | Exit code | Result |
| --- | --- | --- |
| `npm install` | 0 | Dependencies current; audit reported no vulnerabilities |
| `npm run generate` | 0 | 107 resources generated, 19 outputs updated |
| `npm run check` | 0 | 102 Node tests passed, 0 failed, 0 skipped; package/link/generation and host probes passed |
| `npm run check:generate` | 0 | 107 resources in sync, 0 unmanaged |
| `git diff --check` | 0 | No whitespace errors |
| `python3 tools/upstream-fidelity.py /Users/jiangkoumo/Documents/pi-pstack` | 2 | Script absent: cannot open `tools/upstream-fidelity.py` |

The parallel role probe passed five reported cases with 11 actual foreground child requests through a local SSE fixture provider. This validates model binding and public dispatch mechanics. It does not establish real-model adherence to architect, implementation, or interrogate instructions. The probe uses an inline controller factory rather than the production extension entry.

## Outstanding acceptance

The requested fidelity script was not found in the repository or in the filesystem searches. Its flagged-file result remains unavailable; no replacement checker was invented to report a pass.

The p-queue issue #177 feature rerun has not been performed. No p-queue checkout was found in the filesystem searches, and the task does not identify its local checkout or prior session. The required architect parallel calls, pstack.poteto-agent implementation call, and pre-PR parallel review need a real task/session log from that rerun. Existing fixture requests do not satisfy that criterion.

No global Pi configuration was modified. No push, PR, release, merge, or rebase was performed.
