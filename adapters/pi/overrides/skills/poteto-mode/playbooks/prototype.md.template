# Prototype

Adapted from pstack by Lauren Tan. This workflow makes one design decision with a throwaway artifact; it does not ship, commit, push, open a PR, or keep the scratch code as production work.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. A prototype is one bounded exploration, so do not start a `/loop` run for it. Isolate the scratch work from production source and keep one writer per scratch directory.

1. Scope the decision the prototype exists to make: layout, interaction, density, behavior, timing, or approach. No decision means no prototype; route to Feature instead. Name the decision and the evidence that would settle it before building.
2. Gather references only when the design space is open. Summarize prior art, themes, palettes, and layouts, and let the operator pick directions before building. Skip this when the direction is already set.
3. Build throwaway code in an isolated scratch directory, not in production source. Use `~/.pi/agent/pstack-runs/<run-id>/prototype/` or another operator-approved path. For a visual decision use the lightest stack that renders the idea; for a behavioral or timing decision use the smallest script that exercises the question. No production framework, no tests, no abstractions, and no commit.
4. When comparing alternatives, put them behind one switcher with each variant labeled. Keep the comparison cheap; this is the exhaust-the-design-space principle applied without a production build.
5. Verify on the matching surface with the operator's available driver. For a visual decision, capture each variant and drive the interaction; for behavior or timing, observe the actual output, log, or render. If no suitable driver is available, state the missing capability and use the closest observable check instead of inventing a browser or screenshot.
6. Present the variants, evidence, tradeoffs, and a recommendation. Hand the chosen direction to Feature, or to an available architecture step for the shape, and say plainly that the prototype and scratch path are throwaway. Remove the scratch directory only with the operator's authorization.

The main skill owns authorization, delegation, and Git rules. This workflow never turns a prototype into a commit, push, PR, or production patch by implication.
