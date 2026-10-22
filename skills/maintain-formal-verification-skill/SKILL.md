---
name: maintain-formal-verification-skill
description: "Bring a project's formal verification back in line with the code after the code changes: find the commits that touched verified code, update the model, harness, or properties to describe the code as it is now, rerun, and say whether each failure is drift in the verification or a bug in the code. Use for /maintain-formal-verification-skill, \"is the model still true to the code\", or after merges and refactors that touched verified code without rechecking it."
disable-model-invocation: true
license: MIT
---

# Maintain a formal verification skill

A formal check proves a property of what it describes. When the code changes and the verification does not, the check can keep passing while it describes code that no longer exists. That pass is the dangerous case, because it looks like a proof. This skill is the upkeep loop for a verify skill that `/create-formal-verification-skill` generated, or for any project-local skill that runs a model checker, prover, or code-level verifier against named code. The project-local skill handles a change that an agent makes while it uses that skill. This skill handles the changes that skipped it: merges, edits made without the skill, and drift that builds up across many commits.

## Outcomes

Give each check one outcome, and say which:

- **in sync**: no change since the last sync alters what the check describes, and the check passes.
- **updated**: the code changed, the verification now describes the new code, and the check passes.
- **bug**: the verification describes the current code, and the code breaks the property. This is a finding about the code. It is not drift.
- **blocked**: the check could not be brought back in line or could not run. Say exactly why.

A check can be both updated and bug: the update makes the verification describe the code again, and then the property fails on it.

## Edit scope

Edit only the verification: models, harnesses, property files, and the verify skill itself. Never edit product code during a run, unless the user asks you to. When a property fails on the current code, do not weaken the property or the model to make it pass. Report the failure.

## Pass

1. **Find the checks.** A verify skill has no fixed name, so find it by what it does: a project skill that runs a model checker, a prover, or another verifier against named code. Read each one you find, or the one the user named. For each check, collect the property, the code it covers, the bounds and assumptions, the command that runs it, and the commit where it was last confirmed to describe the code. If no verify skill exists, stop and point at `/create-formal-verification-skill`. If the skill does not record a sync commit, use the last commit that changed the verification files, and say that you did.

2. **Run it as it is.** Run each check once before you change anything, and record the result. A pass here does not tell you that the code is correct. It tells you that the old description still holds. A failure here can be drift or a bug. Do not decide which until step 5.

3. **Read every change to covered code.** Diff the covered files from the sync commit to the current commit, and read each commit message. Also look for code that moved: a covered function that is renamed, split, or moved to another file is still covered code. Also look for new code that touches the state that a check guards, such as a new function that writes the same fields. For each change, decide which of these it is:
   - **No effect.** The change does not alter anything the verification describes, such as formatting, comments, or code paths that the verification does not cover. Check this against the model or harness, not against the commit message.
   - **The verification no longer describes the code.** A step that was one indivisible action is now two, a branch was added or removed, a check moved, a new path reaches the guarded state, or a value now has a different range. The model or harness must change.
   - **The promise changed on purpose.** The change alters what the code promises, and evidence in the change says that this is intended: the doc comment, the tests, the changelog, or the commit message. The property must change, and you must cite that evidence.
   - **The promise may be broken.** The code changed, and no evidence says that the promise changed. Treat a failure that follows as a bug candidate.

4. **Update from the code, not from the result.** Change the model or harness so that each changed part again points to code that a reviewer can open, and keep one indivisible step in the code as one step in the verification. Write the update from the code before you rerun, and do not shape it by what makes the check pass. Change a property only for a promise that changed on purpose. Write down the old wording, the new wording, and the evidence. Keep the bounds unless the change makes them wrong. If you must reduce a bound, say so in the report.

5. **Rerun and judge each result.**
   - **Pass:** the check can now pass on a description that has lost the ability to fail. Break the new code the way the property guards against, such as removing a new check or reordering a new step, and confirm that the check catches it. Then drop the break.
   - **Fail:** replay the counterexample against the real code, step by step. If a step cannot happen in the code, the verification is wrong. Fix the verification, and say what was wrong. If every step can happen, it is a bug. Name the commit that introduced it, tell the counterexample as a sequence of steps in the code's own words, and state the harm in one sentence. If a cheap test or reproduction against the real code shows the bug, add it to the report as evidence. Do not commit it to the product code.

6. **Update the verify skill.** Update the code that each check covers, the commands, the bounds, the assumptions, and the sync commit. Set the sync commit to the commit that you checked. Do not move the sync commit for a blocked check, and say so in the report. Then follow the verify skill once as the next agent would, so that you know its steps still run.

## Report

Tell the user, for each check:

- the outcome, and the commits that you read;
- what changed in the verification and why, with a short reason for each change: the code changed shape, or the promise changed on purpose (with the evidence);
- the rerun result, and the break that you used to show the updated check can still fail;
- each bug, in plain words: the counterexample as steps in the code's words, the harm, and the commit that introduced it;
- what the verification still does not cover, including new code that it should cover and does not.

Say outright which failures were drift in the verification and which were bugs in the code. For a check that passed before you updated it and fails after, say that the old pass was on a stale description.

Put the verification updates in a change of their own, separate from any product fix.

## Pi execution and authority

Adapted from Lauren Tan's pstack v0.15.30, MIT, fixed revision eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

### Find the checks in Pi

A verify skill in this host is project-local: `.pi/skills/<verify-area>/SKILL.md`. Find a check by what it does, not by its name — search the project skills for `tlc`, `verification_exec`, `*.tla`, or the property file — then read each candidate with `read` and use the one the user named if there is a choice. If no verify skill exists, stop and point at `/skill:create-formal-verification-skill`. If a skill records no sync commit, use the last commit that touched the verification files and say that you did. A verify skill with no runnable command is not maintainable: report it as blocked and send the user back to the create skill.

### Run each check for real

Probe the tool before rerunning: Java 11 or later plus an operator-configured `tla2tools.jar`, declared through `TLA2TOOLS_JAR` (or the older `TLA2TOOLS`) or through `tla.tla2toolsJar` in a trusted `.pi/pstack.json`; `/setup-pstack status` and `/poteto-mode status` expose the resulting `tlc` field. Run TLC only through `verification_exec` with `{command: 'tlc', spec: 'repo/path/Spec.tla', config: 'repo/path/Spec.cfg', options: [...]}` on real repository-relative `.tla` and `.cfg` paths with whitelisted options, either through `pstack.verifier` or, where no verifier integration is available, from the parent shell with that boundary recorded. Never download, install or repoint a JDK or a jar. A pass is TLC completing with no violation and no tool error; a stub java, a generated model file, a loaded session, or an unexecuted skill body is not a result.

With no TLC, report 未做形式化验证，原因是缺少 TLC and mark the check `blocked` rather than `in sync` or `updated`. A generated-input fallback can show the promise still holds on the real code, and that is worth reporting, but it is fallback test coverage, not a rerun of the formal check, and the sync commit does not move.

### Verification-only edit scope in Pi

Edit only the verification: the project verify skill, its models, harnesses and property files under `.pi/skills/<verify-area>/`, and the model or config files that skill names. Never edit product code during a maintenance run, even when a one-line fix would clear a counterexample; report it instead. Keep drift and bug apart: a failing or stale check whose model or harness no longer describes the current code is drift, and you fix the verification; code that breaks a promise which did not change on purpose is a bug, and you report it with the introducing commit. Say outright which one each finding was.

### Keep the failing run honest

After an update, rerun, then break the new real code once the way the property guards against, confirm the check fails with the counterexample in the code's words, and restore the break exactly so the tree carries nothing of it. Report that break, the command, and the exit status, because a check that passes on a new description may have lost the ability to fail. Record the new sync commit — the commit you actually re-ran at — plus the bounds and assumptions you kept or changed, and tell the reader what the verification still does not cover. Do not move the sync commit for a blocked check. Follow the verify skill once as the next agent would after updating it.

### Completion self-check

Before declaring maintenance complete, execute the completion self-check. Maintenance is not complete until every item below is satisfied:
- Re-run every "Run it" command documented in the updated verify skill. Confirm that all quantities, counts, and conclusions in the command output (such as step counts, state counts, distinct states, queue/member counts, and scenario totals) match the descriptions in the verify skill exactly.
- The Record section in the updated skill must be fully written, recording the tool version and resolution, exact command and options, the new sync commit, bounds, assumptions, and explicit exclusions of what remains unverified.
- Deliver the final completion report covering:
  1. The verified coverage and check outcome (in sync, updated, bug, or blocked);
  2. Concrete evidence of deliberate breakage: the break-and-restore cycle showing the updated check can still fail, citing the modified code, observed counterexample in code terms, and non-zero failing exit status;
  3. What remains unverified or out of scope.
All of these must be completed before the maintenance task counts as finished. A run ending at a draft, with unexecuted commands, mismatched quantities, an incomplete Record section, or without the final report is incomplete.

Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages; put verification updates in their own change, separate from any product fix. A run that never executed the entry is a draft, and the report must say so.
