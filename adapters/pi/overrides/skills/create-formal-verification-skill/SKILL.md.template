---
name: create-formal-verification-skill
description: "Generate a project-local skill that formally verifies the code where a bug costs the most and tests reach the least, in any language, with whichever verification tool fits. Use for /create-formal-verification-skill, \"model-check this race\", \"prove this invariant\", or when concurrency, retries, state machines, parsers, or unsafe code need more than tests."
disable-model-invocation: true
license: MIT
---

# Create a formal verification skill

A test checks the cases that someone thought to write. Formal verification checks every case in a stated scope: every order of steps in a model, every input up to a bound, or every input. This skill finds the part of the repo where that matters most, verifies one property of it, and leaves a project-local skill that lets the next agent check a change against that property. Write that skill for an agent who reads it cold, mid-change, and has never seen your work. The user must be able to trust the result and act on it without learning the verification language.

## Choose the target from the code

Answer from the codebase, and ask the user only what you cannot observe. If the user named an area or a bug, start there.

A good target is a promise the code makes, where a break harms users and tests rarely reach the case that breaks it. Choose the strongest such target in the repo, not the one that is easiest to verify.

## Let the question choose the tool

Pick the tool that answers the question at the lowest cost: a model checker, a proof assistant, an SMT-backed verifier, or another tool. Whether events can happen in a bad order usually suits a model checker over a small model of the design, and TLA+ is the default for that in any language. Whether the code itself behaves for every input, as with memory safety, overflow, or a data-structure invariant, usually suits a verifier that runs on the code. If no verifier runs on this language, say so, and test the real code with generated inputs, not a hand model of the function. A property that must hold at every size, where a bound is not enough, can need a proof. Prefer a tool that the repo's developers can install and run, and tell the user why you chose it.

## What makes it good

- **True to the code.** Every part of the model or proof points to code that a reviewer can open. What the verification treats as one indivisible step is one indivisible step in the code. Names come from this repo.
- **Able to fail.** A check that you have never seen fail proves nothing. Show each property failing on a broken variant of the code it guards, such as a removed check or a reordered step.
- **Findings stay findings.** When the current code breaks the property, report it with the counterexample in the code's terms. Do not weaken the property or the model until it passes, and do not change product code unless the user asks.
- **Honest about scope.** Say what is verified, under which bounds and assumptions, and what is left out. A pass covers the model or the bound, not the whole system.
- **Readable without the tool.** State the property and the harm in one plain sentence each. Tell a counterexample as a short sequence of steps in the code's words.
- **Cheap to rerun.** One command, a reproducible tool version, and a run short enough that the next agent will use it on every relevant change.
- **Kept in step with the code.** Record which files and functions each check covers, and the commit at which you last confirmed that the verification describes them. When the covered code changes after that commit, the next agent can see that the verification needs another look.

## Generate the verify skill

Write a project-local skill with frontmatter that names the area and says when to use it. Without frontmatter, the skill never registers. From the skill alone, the next agent must be able to tell whether a change touches the verified code, run the check, tell a real bug from a modeling error, and update the verification when a change is intended. Put the coverage record and the sync commit in the skill, and tell the next agent to move the sync commit forward only after it confirms that the verification describes the code at the new commit. Use this repo's real commands, paths, and nouns, and leave no placeholders.

If the check is a TLA+ model, tell the next agent to read every result with the pstack [`/statechart`](../statechart/SKILL.md) skill. It shows each invariant violation the checker finds as its shortest path in plain words. When the check passes, `/statechart` draws a chart of how the system moves between states. Refer to `/statechart` by name. Its commands, options, and file paths change between releases and machines, so copy none of them into the generated skill or its scripts.

On Pi, run formal TLC verification through the restricted `verification_exec` entry with a structured `tlc` request, repository-relative model and config paths in a read-only repository, and only whitelisted options. Draw charts through the `/statechart` entry in the parent shell, currently `node <package>/adapters/pi/statechart/entry.mjs`; resolve that entry from the installed skill at run time. Chart rendering does not establish a formal verification pass, and a restricted TLC run does not replace chart rendering. Keep concrete jar paths and machine-specific paths out of the generated skill and its scripts.

## Prove it before you hand off

Follow the generated skill once, as the next agent would, on a scratch change that breaks the property in the real code. It must catch the break. Then drop the scratch change and confirm that the check is back where it started: passing, or failing only on the findings you will report. A verify skill that was never run is a draft. If the skill misses the break or a step does not run, fix the skill or the verification, not the scratch change.

## Hand off

Tell the user what you verified, which tool you used and why, the bounds, what the check found in plain words, how to run it, and what it does not cover. Suggest a second target only if you found a close one. Point the user at `/maintain-formal-verification-skill` for bringing the verification back in line after changes that did not recheck it.

## Pi execution and authority

Adapted from Lauren Tan's pstack v0.15.30, MIT, fixed revision eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

### Write the generated skill where Pi loads it

Write the generated skill to `.pi/skills/<verify-area>/SKILL.md` in the target repo, with `name: <verify-area>` matching its directory and a description that names the area and the property it guards. That is the project skill path Pi discovers: read it back with `read .pi/skills/<verify-area>/SKILL.md`, or invoke it as `/skill:<verify-area>`. After writing or renaming it, reload the session with `/reload` and confirm the skill is discovered with no name or frontmatter diagnostic. Discovery is not a run; the skill still owes the breaks below before it counts as done. Do not install it into `~/.pi/agent/skills/` and do not change global Pi configuration to make it appear — a project-local verify skill belongs to the repo you generated it for.

### Probe the tool before you model

Check the tool the question needs before you write a model. For TLA+ the host needs Java 11 or later and an operator-configured `tla2tools.jar`, declared through `TLA2TOOLS_JAR` (or the older `TLA2TOOLS`) or through `tla.tla2toolsJar` in a trusted `.pi/pstack.json`; `/setup-pstack status` and `/poteto status` report the resulting `tlc` field. Never download, install, upgrade or repoint a JDK or a jar yourself, and never copy this machine's absolute jar path into the generated skill.

When no TLC or no verifier for this language is available, say exactly that: 未做形式化验证，原因是缺少 TLC. Then follow the upstream no-verifier rule — test the real code with generated inputs through the repo's existing test entry — and label the result generated-input test coverage, never a formal pass. In that case the generated skill must not claim that any property was checked, and the handoff must say which part stayed unverified.

### Run the check through the restricted entry

Run TLC through the host's restricted entry rather than a hand-written `java` command: `verification_exec` with `{command: 'tlc', spec: 'repo/path/Spec.tla', config: 'repo/path/Spec.cfg', options: ['-cleanup', '-noGenerateSpecTE', '-noGenerateSpecTEBin']}`. `spec` and `config` must be real repository-relative `.tla` and `.cfg` paths, and `options` may only use the whitelisted TLC switches. The read-only `pstack.verifier` agent (verification role model) carries that entry for an isolated run; where no verifier integration is available, run the same argv from the parent shell and record that capability boundary in the handoff. Only a run that TLC completes with no violation and no tool error is a pass, and a read-only model directory needs both `-noGenerateSpecTE` and `-noGenerateSpecTEBin`. A stub or substitute java, a generated model file, a loaded session, or a skill that merely reads as correct is not evidence.

### Two breaks in the real code, then restore

Twice, on the real code the property guards, make a deliberate break — remove the check, reorder the step, widen the range — then follow the generated skill as the next agent would and confirm it reports the counterexample in the code's words with a failing exit status. A break reported from the model alone does not count. Then undo both breaks, confirm the check is back at its pre-break result (passing, or failing only on the findings you will report), and confirm the tree carries no leftover break. Keep both breaks uncommitted and restore them exactly: a check you never saw fail, or a break you left behind, fails this step. When a break is not caught, fix the skill or the verification, never the break.

### What the generated skill must record

Record the tool version and how it was resolved (the jar configuration source plus Java major version, without a concrete jar or machine-specific path), the exact command and options, the sync commit — the commit at which you actually ran the check — and the bounds and assumptions the check relies on, including what is left out. Tell the next agent to move the sync commit forward only after it re-ran the check at the new commit and confirmed the verification still describes the code there. A skill that was never executed, or that has only ever seen a passing run, is a draft, and the handoff must say `draft` instead of reporting a verified property.

### Completion self-check

Before declaring this task complete or handing off, execute the completion self-check. The generation is not complete until every item below is satisfied:
- Re-run every "Run it" command documented in the generated SKILL.md from the target repository. Confirm that all quantities, counts, and conclusions in the command output (such as step counts, state counts, distinct states, queue/member counts, and scenario totals) match the descriptions in SKILL.md exactly. Any discrepancy between execution output and the written skill must be reconciled before finishing.
- The Record section in the generated skill must be fully written, specifying the tool version and resolution (the jar configuration source plus Java major version, without a concrete jar or machine-specific path), exact command and options, sync commit, bounds, assumptions, and explicit exclusions of what is left out.
- Deliver the final completion report covering:
  1. The verified scope and target promise;
  2. Concrete evidence of deliberate breakage: the two break-and-restore cycles on the real code, citing the modified code, the observed counterexample in code terms, and non-zero failing exit status;
  3. What remains unverified or out of scope.
All of these must be completed before the task counts as finished. A run ending at a draft, with unexecuted commands, mismatched quantities, an incomplete Record section, or without the final report is incomplete.

Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
