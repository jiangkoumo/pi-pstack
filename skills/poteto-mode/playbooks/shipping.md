# Shipping

Adapted from pstack by Lauren Tan. This workflow lands a verified run of PRs; it requires explicit landing authorization and never merges on green CI alone.

Before acting, read [Poteto mode for Pi](../SKILL.md) for the mode's tool and authority rules. Resolve that link from this playbooks/ directory: ../SKILL.md is the parent poteto-mode skill.

1. Resolve the forge once: `gh` by default, `origin pr` when the operator's tooling supports it. Verify each PR independently before it lands, using a reviewer that did not write the code and, where possible, a different model family. A verdict is PASS, PASS+NOTES, or FAIL; green CI and bot approval are not verdicts.
2. Walk up from the lowest unmerged PR and stop at the first one without a PASS or PASS+NOTES. That contiguous run is what may land. A verified PR above an unverified one waits.
3. Re-check that each verdict still describes the code. Compare the patch id at the verdict SHA with the current head before trusting it. A rebase or retarget can move the patch without failing checks.
4. Land bottom-up, one PR at a time, and only after the operator authorizes landing for that run. Do not arm auto-merge or bypass a forge approval. Read the PR back after a merge command; a queued merge is not a landed merge.
5. After a merge, perform only the sanctioned retarget of the next PR and move its patch onto the merge result. Do not force-push a shared branch. If a merge stalls, find out why before changing anything.
6. Leave the rest of the stack alone while it lands. Stop at the ceiling of the verified run; extending it takes fresh verdicts.
7. Do not commit, push, retarget, or merge outside the explicit authorization. If landing authority is withheld, stop at merge-ready and report the exact gate.

Report the verified run and ceiling, each PR's verdict and who produced it, what landed and how it was confirmed, and what the next gap needs.
