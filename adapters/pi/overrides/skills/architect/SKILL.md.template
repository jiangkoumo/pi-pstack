---
name: architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
disable-model-invocation: true
license: MIT
---

# Architect

Sketch the shape before code, then stay available while implementation fills it in. The sketch is a design artifact, not a license to commit, push, or open a PR.

1. Ground the design in the caller's usage. Read the affected entry points, callers, data shapes, tests, and constraints. Write the usage first, then derive the type sketch from it. Separate observed requirements from guesses.
2. Sketch two or three candidate shapes. For each, name the core types, signatures, module boundaries, and the state it makes impossible. Compare them against the red flags you can check locally: hidden mutable state, one-caller wrappers, leaky boundaries, optional-field bags, and a shape that only looks right from one file.
3. If the `arena` skill is available and the operator authorized delegation, use it for independent sketches. Otherwise compare the candidates sequentially. Use the configured pstack role or the parent model; never copy Cursor Task syntax, fixed model slugs, `.cursor` rule paths, or cloud-environment fields.
4. Choose a base, graft the strongest parts of the alternatives, and write the usage sketch, type signatures, module map, and a short rationale to a local design artifact under `~/.pi/agent/pstack-runs/<run-id>/` or an operator-approved path. Inline the red-flag checklist rather than citing unavailable `references/` files.
5. Checkpoint with the operator before implementation when the shape is a real fork. The implementation then follows Feature; this skill does not write production code by implication. Do not commit, push, open a PR, or merge from the design step.

Report the usage sketch, the chosen shape and rejected alternatives, the unresolved assumptions, and the artifact path. If a required capability is missing, say so instead of inventing it.
