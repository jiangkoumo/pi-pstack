---
name: reflect
description: "Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect."
disable-model-invocation: true
license: MIT
---

# Reflect

Turn the current run's evidence into durable improvements. Read the active Pi session branch or an operator-supplied session file; never scan Cursor transcripts or unrelated workspaces.

1. Collect evidence from the current session branch: the user request, decisions, failed attempts, corrections, and the artifacts produced. Read metadata and recent messages first; for a long trail, use bounded excerpts or a read-only subagent when delegation is authorized. Do not glob `~/.cursor/projects/*` or read private sessions from other workspaces.
2. Review the run through three lenses: judgment (was the chosen approach sound), tooling (what failed or was clumsy), and divergence (what was tried and abandoned). Each lens names concrete evidence, not a vibe. When delegation is not authorized, perform the lenses yourself and label the review as self-review.
3. Synthesize only changes that would prevent a recurrence: a new rule, a check, a template, a test, or a skill edit. Prefer structural encodings over more prose. Do not add a rule that merely restates an existing one.
4. Show the proposed edits and their evidence to the operator before changing shared skills unless the edit is already authorized. Apply edits within the authorized scope only. Do not commit, push, open a PR, or rewrite unrelated skills.
5. Verify the edit by re-reading the affected skill and, when possible, replaying the failure against the new rule. Report what was learned, what changed, what was deliberately not changed, and any follow-up that needs a real task.

The session is evidence, not permission. A reflect pass never grants commit, push, PR, or cleanup authority.
