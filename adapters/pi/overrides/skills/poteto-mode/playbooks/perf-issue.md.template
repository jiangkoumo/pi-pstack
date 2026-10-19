# Perf issue

Adapted from pstack by Lauren Tan. This workflow fixes one measured performance problem; it does not commit, push, open a PR, or claim a speedup it did not measure.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill. For sustained improvement against a metric, use Hillclimb instead.

1. Capture a baseline on the real surface with the operator's available driver or a runnable harness. Record the command, the workload, the metric, and the environment. If the surface cannot be driven, state the gap; do not substitute source reading for a measurement.
2. Vet the baseline with the benchmark checklist's questions: limiter, tuning, limits, errors, reproducibility, relevance, and whether the work actually happened. Use a median of repeated samples when noise matters, and report platform tools that are unavailable rather than inventing their output.
3. Ground hypotheses in the architecture and try the cheapest performance moves first: don't do it, don't do it again, do it less, do it later, do it when nobody is looking, do it concurrently, do it cheaper. Stop when an earlier move meets the target.
4. Plan the smallest fix. Delegate implementation only when authorization and pi-subagents are available, with one writer per worktree and a model from the configured role, not a fixed Cursor slug. Otherwise implement directly and review your own diff.
5. Capture the post-fix trace on the same workload and surface. Parse and compare the artifacts; "inconclusive" or a wrong-surface comparison is not a pass. Flag regressions and revert a change that does not improve the measured result.
6. Keep the evidence with the number: run count, spread, limiter, baseline and post-fix values, and the artifact path. Do not commit, push, open a PR, or merge automatically; those need separate authorization.

Report the baseline, post-fix number, delta, limiter, artifact paths, what was reverted, and any remaining uncertainty.
