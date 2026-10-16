---
name: correct
description: "Find repeated agent mistakes with at least two real occurrences, then prevent them through architecture, types, checks, and behavior tests. Use for an explicit correct request."
disable-model-invocation: true
license: MIT
---

# Correct for Pi

Adapted from Lauren Tan's pstack. Change the repository so a recurring mistake is prevented even when the next agent has only read its nearest example. Work only within the operator's authorized scope and tool rules. Read [Encode lessons in structure](../principle-encode-lessons-in-structure/SKILL.md).

## Establish real mistake classes

Inspect available commits, reverts, review feedback, instruction files, and operator-provided history. Cite at least two distinct occurrences before calling a pattern repeated. A duplicated warning is not automatically two actual mistakes. Do not search unrelated workspaces or fabricate prior sessions. If evidence is missing, report what is unavailable and request the specific source only if necessary; continue any independently justified work.

Group the occurrences by the mechanism that allowed them. Rank real classes by frequency and impact. The existence of a rule alone does not establish a violation.

## Prevent at the strongest practical level

1. Eliminate the mistake through architecture: one owner for state, one supported operation, private internals, one source of truth, and removal of obsolete examples. Read [Laziness protocol](../principle-laziness-protocol/SKILL.md) before adding machinery.
2. If architecture cannot remove it, use types to exclude the bad state. Otherwise add a lint or CI check whose error names the supported replacement. For widespread legacy patterns, consider blocking newly introduced occurrences without forcing unrelated cleanup.
3. Test user-observable behavior. Read [Test behavior](../principle-test-behavior-not-implementation/SKILL.md). Fix or remove hollow tests only within scope. Do not use an assertion that merely repeats the new rule's text.
4. Write docs last for judgment that cannot be encoded. Explain why a stronger level would not work. Do not copy absolute advice such as trusting every internal value when the code has an actual untrusted boundary.

## Prove the constraint

Apply the most frequent, authorized classes. Keep changes and evidence separate per class; commit only when the operator's rules authorize it. Recreate a cited historical bad case in an isolated fixture or other reversible check. Run the exact same constraint against the bad case and the corrected case. Capture rejection before and success after, and confirm CI invokes that same check when CI is in scope. Do not claim CI ran merely because its configuration contains the command.

Read [Prove it works](../principle-prove-it-works/SKILL.md). Inspect the resulting diff and relevant checks. Never weaken enforcement to make the bad case pass. Exceptions require the operator's approval, a reason, and an expiry; do not invent approval.

If repository instruction files are within scope and a useful rule remains, pair it with the actual enforcing file or command. Remove obsolete instructions only when their purpose is enforced and the edit is authorized. Avoid duplicating mechanically guaranteed rules.

Report each class, both occurrences, chosen enforcement, why a stronger level was unsuitable, actual bad-case and corrected-case results, residual risks, and unavailable evidence. Never present a single observed error as a proven recurring class.
