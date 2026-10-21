### Eval

**You own the experiment design. Plan, blind, run, synthesize.**

**Non-negotiables for blinding:**

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory, file, or prompt the candidate sees.
- The candidate prompt looks like an organic user request. State the goal, not the meta.
- No chain-eliciting cues. Don't ask the candidate to list which skills, principles, or files they applied. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick.
- Don't tell the candidate other candidates exist.
- The judge can know it's judging but sees outputs by sanitized label only, never by model name.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from.

**Steps:**

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from candidates.
2. **Set up sanitized environments.** Per-candidate working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the candidate would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Spawn N parallel candidates** on different models per the **arena** skill's Phase B. Each works in its own sanitized dir. Same prompt to each. Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section.
5. **Spawn one blinded judge** on a different model family per the **arena** skill's Phase C. Judge sees outputs by sanitized label and the rubric, never a model name.
6. **Verify the chain from transcripts, not self-report.** Read each candidate's Pi child transcript from `subagent({ action: "status", id: "<run>", options: { view: "transcript" } })`, or from the run's `sessionFile` and `steps[0].sessionFile`. Do not glob the sessions root or read another workspace's sessions; that crosses workspace boundaries and reads private chats from unrelated projects. Look at which files each candidate actually opened. Grade chain-following from the files it really read plus the shape of the code, never from the candidate's own claims.
7. **Read every candidate output yourself** end to end. Compare to the judge's verdict. Disagreement means a model is biased or the rubric is ambiguous. Synthesize.

**Reply:** variant under test, rubric, per-candidate notes, judge's verdict, your synthesis, and a recommendation for whether to promote the variant.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream steps with Cursor model and transcript terms replaced. These notes govern platform and authorization differences.

**Candidate isolation.** Create one sanitized directory per candidate, for example `/tmp/<project-shaped-name>/<human-label>/`, and pass it as the top-level `cwd` of that candidate's `subagent` call. Use one call per candidate in the same turn so they run concurrently. The directory name and every prompt must satisfy the blinding list above. Never reuse the repository path or another candidate's directory.

**Runner and judge roles.** Use the **arena** skill's configured seats: `pstack.poteto-agent` for implementation candidates, `pstack.prose-writer` for prose, and read-only `pstack.judgment-agent` or `pstack.strongest-agent` for the judge. Omit `model` from every `subagent` call and task item; roles bind through `/setup-pstack` and `agentOverrides`. Pi exposes thinking levels rather than Cursor's fast/standard speed, so set the seat's configured thinking and do not invent a speed argument. Report when the configured judge shares the parent's model family instead of silently claiming independence. If delegation is unauthorized or pi-subagents is unavailable, run candidates sequentially, disclose that the run was not blind or independent, and do not report it as a valid experiment.

**Transcript resolution.** A child's transcript is the Pi session it persisted plus the pi-subagents artifacts for the parent workspace. Read it with `subagent({ action: "status", id: "<run>", options: { view: "transcript" } })`; when the run has completed, the status exposes `sessionFile`, and async workflow steps expose `steps[0].sessionFile`. The parent workspace also keeps `<PI_CODING_AGENT_SESSION_DIR or PI_CODING_AGENT_DIR>/sessions/--<cwd-slug>--/subagent-artifacts/<run-id>_<agent>_transcript.jsonl`. Use only the current workspace's directory. Never enumerate `sessions/*` or another project's sessions.

**Evidence and authority.** Keep the rubric, sanitized labels, and run ids in a local note under an operator-approved run directory. The judge sees outputs by label only; you read every output yourself. Do not commit, push, or open a PR as part of an eval. Deleting candidate directories or artifacts requires the operator's cleanup rules. Report the variant, rubric, per-candidate evidence, judge verdict, disagreement, synthesis, and promotion recommendation.
