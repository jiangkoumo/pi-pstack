# Investigation

Adapted from pstack by Lauren Tan. This workflow is read-only and produces an explanation or recommendation with cited evidence.

1. State the question and inspect the relevant instructions, entry points, callers, tests, and authorized history. Read only the material needed to establish the behavior. Use read and available search tools.
2. Keep the throughput checkpoint to one line: n/a, read-only investigation. Do not create files, patches, commits, or a prototype for an explanation request.
3. Trace input through the relevant code path. Check evidence against the actual implementation. Run an existing non-mutating check only when it helps answer the question and is within scope. Distinguish current behavior, historical motivation, and inference. Do not invent inaccessible history.
4. Explain the overview, key concepts, flow, source locations, and gotchas as relevant. For a choice, state a recommendation and concrete tradeoffs. Cite real files and lines or sources inspected in this run. State uncertainty and limits. If a change would help, describe it without applying it until authorized.

The main skill owns tool and authorization rules. No delegation, PR operation, or writable verification is implied by this workflow.
