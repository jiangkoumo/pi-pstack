# Bug fix

Adapted from pstack by Lauren Tan. Own reproduction, the mechanism, the smallest justified patch, and verification.

1. Read [Fix root causes](../../principle-fix-root-causes/SKILL.md). Reproduce the defect through the affected interface before changing production code. If the surface is inaccessible, state the specific limitation and use the closest observable check. An inconclusive reproduction is not a pass.
2. Trace the failing input to the first wrong decision. Test competing explanations with runtime evidence. Read affected callers and contracts, not just the failure site. Do not ship speculative guards or retries. Remove experimental changes that the evidence refutes, using scoped edits that preserve user work.
3. Plan the smallest fix. Name the data shape if it changes. Record blocking checks, independent work, shared state, and why the chosen decomposition is safe. Work directly unless delegation is already authorized. For an obvious cheap local regression path, read [TDD](../../tdd/SKILL.md) and run the failing check before the fix. Otherwise record the practical alternative; do not build a large harness for ceremony.
4. Apply the fix at the source of the invalid state. Check sibling callers for the same mechanism. Read [Test behavior](../../principle-test-behavior-not-implementation/SKILL.md) before adding tests. Keep changes within the authorized scope.
5. Read [Prove it works](../../principle-prove-it-works/SKILL.md). Rerun the original reproduction on the same surface and the closest relevant checks. Inspect the final diff and preserve user changes. When project rules call for independent review, use an authorized reviewer; report missing review honestly.
6. Report broken behavior, root cause, patch, exact failing-before and passing-after evidence, unresolved limits, and blockers. Keep evidence excerpts small and verbatim. Commits and PRs require separate authorization under the operator's rules.
