### Visual parity

**You own pixel-exact equivalence. The baseline is the spec. You do not touch it.** Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. A blocking prerequisite, not a follow-up.
2. Anti-shortcut clauses, stated and held: no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and ask, don't edit it.
3. Migrate one component at a time. With delegation authorized, parallelize across worktrees, one owner per component (the **separate-before-serializing-shared-state** principle skill). Shared primitives migrate first as a blocking phase.
4. Verify each component against its baseline via image diff on the matching surface via the approved control driver. A nonzero diff is a fail. Investigate the pixel delta. Use Pi’s bounded `/loop run --max-turns <n> --until "<image-diff-command>" "<component task>"` only when supported and authorized, with exit 0 meaning zero diff. Stop on budget exhaustion and report remaining pixels; do not relax the threshold.
5. Prepare reviewable evidence per component or safe batch. Run [Opening a PR](opening-a-pr.md) only when PR creation is authorized.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.

Pi execution follows the [mode authority rules](../SKILL.md). Use read/search tools for source, actual available profilers or image comparators for evidence, and an explicit working directory for every execution command. Missing tooling is a named gap. A diagnosis grants no authorization to fix code, send data externally, commit, push or deploy. Preserve artifacts and clean up only instrumentation/processes this run created.
