# Plan a verifiable program

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. The pinned source is `f713f14203cd6420cec13cd7c55c32d598dbab68`, `pstack/skills/poteto-mode/playbooks/multi-phase-plan.md` and its plan checker. See [the upstream license](../../LICENSES/pstack.txt). The JSON contract, local evidence paths and bounded Pi loop are adaptations.

Copy this file to the operator's chosen plan path. Otherwise use `<run-id>/plan.md` in the pstack run directory provided in the system prompt. Resolve this template from the installed package, not the target repository. The example is a complete *planned* CLI documentation change; replace its goal, repository, commands, paths, owners and scenarios with facts from the target project. It records no executed evidence and grants no execution permission.

## How to read this

One box is one unit of work and names the evidence that checks it. Check a box only when its evidence exists. Keep the body a how-to; appendices explain prototypes, rejected alternatives and risks. The single top-level `pstack-plan` JSON fence is the machine-readable source of truth; keep its PRs aligned with the prose. Ordinary JSON code examples do not count as contracts.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf gates have evidence, or a perf exemption has a concrete reason. Live verification is mandatory. Every PR has its own files, build steps, observable result, acceptance commands, regression lane, review decision and merge gate. Behavioral work requires a behavioral verdict; typecheck-only and blocked are not passes.

## Program checklist

- [ ] Read the named execution playbook from the installed Pi package and the project's instructions. Record their versions and paths in the run's decision trail.
- [ ] Present the protocol, owners, dependency graph and reserved actions. Start execution only on the operator's explicit go.
- [ ] Use a serial owner by default. Delegation needs authorization, available agents and exact configured models. Each writer has exclusive files in its own worktree. Cap active children and roll up their reports at drain points.
- [ ] On each audit, read standing orders, reconcile actual child/branch/PR state, check current heads against receipts, classify blockers, update the frontier, and report only newly tracked changes. A user hold sends a zero-writes order and `/loop stop`.
- [ ] Before any approved PR operation, fill [the PR template](pstack-pr.md). Opening, pushing, rebasing and merging retain separate authorization gates. Run the project's required checks with hooks enabled.
- [ ] At the code-ready head, run gates, live scenarios, perf probes and focused independent audits. Re-run affected verification after a fix; a new head needs new receipts. Interaction changes wait for operator screenshots/video review before merge.
- [ ] Boot each live lane at the recorded head in an isolated environment, start the surface, wait for readiness, drive it through available control tooling and retain artifacts. Use the operator's browser skill for browser surfaces; CLI surfaces can use exact CLI commands. Missing tooling is a recorded risk and blocker, never invented evidence.

## Publish a checker usage example (PR1)

**Depends on.** None. PR1 branches from main. Dependents must wait for the parent's accepted output or explicitly use its branch as their base. The JSON dependency graph is authoritative.

**Files.**

- [ ] Change only `docs/check-plan.md`. Save the reviewed patch at `evidence/PR1/files.patch`.

**Build.**

- [ ] Explain the checker invocation and exit codes. Save `evidence/PR1/build.md`.

**You see.**

- [ ] A reader can run the documented command and understand pass/reject results. Save `evidence/PR1/result.md`.

**Verify, unit.**

- [ ] Run `node --test scripts/check-plan.test.mjs`. Save the actual command, exit code, counts and head in `evidence/PR1/unit.log`.

**Verify, live.**

- [ ] Regression against trunk. On trunk and head, follow the documented invocation with the same valid and invalid plan. If trunk lacks the documentation, record the absence and gate the added instructions and resulting exit codes. Save `evidence/PR1/live.log`. Pass when valid exits 0 and invalid exits 1.

Scale lanes to the surface. For broad interaction changes use the upstream ten-lane method, numbered 1 to 10, with concrete scenarios, screenshots and pass predicates, including regression against trunk. Run both surfaces when a PR touches two. Without authorized delegation, one owner may run the lanes sequentially. Model configuration does not itself authorize a swarm.

**Verify, perf.** This documentation-only PR changes no executable work, so a measured perf gate is not applicable. For executable work replace `notApplicable` with `metric`, `probe`, `baseline`, `rule`, and `evidence`. Measure trunk first and alternate trunk/head at least five times. Both sides must produce the same metric. If trunk lacks the feature, record that fact and set absolute budgets for the added work and the user's end state; do not claim a ratio between unlike scenarios.

**Review gate.** No interaction changes in this example. For an interaction change set `required` to true and supply relative `screenshots` paths, `video`, and `approvalEvidence`. Stop at merge-ready until the operator reviews the media and authorizes landing.

**Merge.**

- [ ] Require a clean verdict for the exact head, resolved findings, current base and explicit operator authorization. Record merge owner and actual authorization; the plan never grants it.

## Plan contract, schema version 1

```pstack-plan
{
  "schemaVersion": 1,
  "goal": "Document a reproducible check-plan CLI invocation and its exit codes",
  "repository": ".",
  "execution": {
    "playbook": "skills/poteto-mode/playbooks/autonomous-run.md",
    "approval": "explicit-go-required",
    "maxTurns": 6,
    "maxParallel": 1,
    "stopCommand": "node /absolute/package/scripts/check-plan.mjs --complete /absolute/run/plan.md",
    "standingOrders": ["One writer per worktree", "Keep scope limited to the approved documentation", "Record actual head and command exits before claiming verification"],
    "reservedActions": ["commit", "push", "open-pr", "merge", "rebase", "retarget", "force-push", "delete"]
  },
  "prs": [
    {
      "id": "PR1",
      "title": "Publish a checker usage example",
      "owner": "session-owner",
      "branch": "docs/check-plan-usage",
      "base": "main",
      "dependsOn": [],
      "files": ["docs/check-plan.md"],
      "state": "planned",
      "head": "pending",
      "build": [{"task": "Document checker invocation and exit codes", "evidence": "evidence/PR1/build.md"}],
      "observable": [{"result": "A reader can run valid and invalid examples", "pass": "Instructions produce exit 0 and exit 1 respectively", "evidence": "evidence/PR1/result.md"}],
      "verification": {
        "unit": [{"command": "node --test scripts/check-plan.test.mjs", "pass": "All checker behavior tests pass with exit 0", "evidence": "evidence/PR1/unit.log"}],
        "live": [{"scenario": "Regression against trunk for the documented valid and invalid plans; record missing trunk documentation if absent", "drive": "Run both documented invocations at trunk and head", "regression": true, "pass": "Valid exits 0 and invalid exits 1 at the head", "evidence": "evidence/PR1/live.log"}],
        "perf": {"notApplicable": "Documentation only; no executable path or runtime work changes"}
      },
      "review": {"required": false, "reason": "Documentation example changes no interaction"},
      "merge": {"owner": "operator", "gate": "explicit-authorization"},
      "receipts": []
    }
  ],
  "prototypes": ["No empirical design uncertainty remains for this documentation example"],
  "risks": ["Replace the example repository paths and commands with inspected project facts before handoff"],
  "reading": ["Project instructions", "Installed Pi execution playbook", "The target repository's checker and tests"]
}
```

Each PR id matches `[A-Z][A-Z0-9-]*` and is unique. `dependsOn` contains existing ids, never itself; cycles and duplicate dependencies fail. `state` is `planned`, `active`, `blocked` or `verified`; `head` is `pending` or a full 40/64-character Git SHA. `build` entries require `task` and `evidence`; `observable` requires `result`, `pass`, `evidence`; unit entries require `command`, `pass`, `evidence`; live entries require `scenario`, `drive`, `pass`, `evidence`, with at least one `regression: true`. All artifact paths are unique within a PR and relative below the plan directory. File scope is relative to `repository`; `repository` is relative to the plan directory unless absolute. Commands execute only when the authorized owner deliberately runs them in that repository. The checker never executes a plan command.

For completion, set `state` to `verified`, set `head` to the current full SHA and add one receipt for every declared artifact. Each receipt has `evidence` equal to the declared relative path, `head` equal to the PR head, `exitCode: 0`, and a concrete `summary`. Include screenshots, video and operator approval artifacts when review is required. For non-command evidence `exitCode: 0` records the verifier's successful inspection, with that inspection described in `summary`. A blocked lane has no successful receipt. Perf exemptions need no fabricated artifact. Existing files and receipts are necessary but the coordinator must still audit their contents; this is not a proof engine or a merge authorization service.

## Close the program

- [ ] Run `node /absolute/package/scripts/check-plan.mjs /absolute/run/plan.md`. This validates the planned contract without requiring future artifacts.
- [ ] During authorized execution use `node /absolute/package/scripts/check-plan.mjs --complete /absolute/run/plan.md` only after receipts exist. It rejects stale heads, missing files, nonzero exits and unverified PRs.
- [ ] Reply with plan path, PR ids and dependencies, review gates, unresolved decisions, actual checker output and exit code. Stop after planning; a structural pass does not start execution.

CLI accepts exactly one file and optional `--complete` in either order. Exit 0 means the selected gate passed; exit 1 means a malformed or rejected plan; exit 2 means usage or file-read failure. Diagnostics include absolute filename, contract line and JSON field path. Resolve checker and execution playbook paths from the package root even when planning another repository; resolve artifact paths from the copied plan, never the process cwd.

## Appendix A. Prototype evidence

Record each empirical question, branch, full SHA and artifact paths. If no prototype was needed, explain why. Unproven questions stay explicit.

## Appendix B. Alternatives rejected

Record competing designs and the evidence for rejection. Keep explanation outside the how-to steps.

## Appendix C. Risks

Tie each risk to an owner and PR. Include missing control tooling, model availability, dependency changes, verification cost and reserved operator decisions.

## Appendix D. Links and reading list

Use inspected repository and package paths. Keep a decision trail with evidence pointers. The source method used cloud workers, `/loop 1h`, automatic publishing and fixed model names; this Pi contract uses local isolation, bounded `/loop run --until`, actual configured models and explicit publishing gates.
