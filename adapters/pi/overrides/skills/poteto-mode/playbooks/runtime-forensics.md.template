### Runtime forensics

**You own the diagnosis. Instrument the live process, don't theorize from source.** The deliverable is a cited diagnosis, not a fix.

1. Capture the live signal on the matching surface via the operator’s available control driver: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess.
2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Reduce large artifacts with an available parser under local tool rules, or an authorized read-only delegate. Keep bounded results in the main thread. Honor operator delegation authorization and exact available model settings.
3. Prove the mechanism before believing it. Use authorized, reversible instrumentation in a disposable or operator-approved process to distinguish competing mechanisms. Live evaluation or hotfixing changes process behavior and requires scope authorization. If unavailable, return the strongest supported hypothesis with that gap; do not claim confirmation.
4. Map the finding back to source: file, symbol, the line that allocates or schedules.
5. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

**Reply:** the signal captured, the reduced finding, how you proved the mechanism, the source location, artifact paths. No fix unless asked. Hand back to Bug fix or Perf once the cause is known.

Pi execution follows the [mode authority rules](../SKILL.md). Use read/search tools for source, actual available profilers or image comparators for evidence, and an explicit working directory for every execution command. Missing tooling is a named gap. A diagnosis grants no authorization to fix code, send data externally, commit, push or deploy. Preserve artifacts and clean up only instrumentation/processes this run created.
