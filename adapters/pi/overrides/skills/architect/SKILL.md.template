---
name: architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
disable-model-invocation: true
license: MIT
---

# Architect

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

For a large or contested design, run the [arena](../arena/SKILL.md) skill instead of sketching alone.

## Outputs

Write the caller's usage first and derive the type sketch from it: one file with new types and signatures for small changes, a module map plus type definitions for larger work. Store the sketch under `<run-id>/` in the pstack run directory provided in the system prompt, or an operator-approved artifact directory. Do not assume a global home path.

## Pi adaptation

Adapted from Lauren Tan’s pstack v0.15.44, MIT, fixed revision e58dd043600587dbaf58ba315e7f2b38373eeb43. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings.

Architect sketches alone and launches no candidate. Independent candidates, their isolated worktrees and the cross-judge belong to the arena skill, and the delegation authorization for them is checked there before anything is spawned. Trace a system with the [how](../how/SKILL.md) skill when the subsystem is unfamiliar, and with the [why](../why/SKILL.md) skill when the design redefines ownership or layering so the rationale becomes a constraint, not a guess.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise. Use edit/write for authorized changes. Batch independent reads with codemode when available. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
