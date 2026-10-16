# Feature

Adapted from pstack by Lauren Tan. Own the design, the change, and its observable result.

1. Read affected entry points, callers, data types, instructions, and existing checks. State the requested behavior and acceptance criteria. Resolve observable facts from evidence; ask only for product choices that cannot be inferred and materially change the result.
2. Read [Model the domain](../../principle-model-the-domain/SKILL.md) and [Laziness protocol](../../principle-laziness-protocol/SKILL.md). Name the input/output or state shape before adding logic. Choose the smallest structure that represents it. Compare alternatives only when the choice matters; do not force a multi-agent design exercise.
3. Write the throughput checkpoint: blocking checks; independent work; shared mutable state; smallest safe decomposition. Each dimension may be n/a with a reason. Keep one writer per cwd/worktree. Follow existing delegation authorization.
4. Build small verifiable units. Read [Sequence verifiable units](../../principle-sequence-verifiable-units/SKILL.md) when the task spans multiple steps. Read [Boundary discipline](../../principle-boundary-discipline/SKILL.md) when introducing validation or adapters. Preserve existing user work and migrate affected consumers together.
5. Read [Test behavior](../../principle-test-behavior-not-implementation/SKILL.md) if adding tests. Use meaningful observable examples, including relevant boundaries. Do not add implementation-mirroring tests or tests for low-impact text edits. Read [Prove it works](../../principle-prove-it-works/SKILL.md), exercise the new behavior, run relevant existing checks, and inspect the diff.
6. Report consumer-visible behavior, the chosen shape and reason, actual verification, limits, and blockers. Follow project requirements for independent review when authorized. Do not turn a feature request into automatic commits, pushes, PRs, or merges.
