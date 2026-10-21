### Orchestrate

**You own the program, never the code. Author briefs, drain the queue, keep the frontier green, decide.** For a whole project handed to one standing coordinator chat: multi-day, many stacked PRs, dozens to hundreds of subagents, the human checking in twice a day instead of every five minutes. One task driven to a predicate is Autonomous run. One ambitious run needing a bespoke workflow is figure-it-out. Route here when the work outlives any single agent. Work one agent could finish inside the session's budget is not a program.

Ceremony must scale with the program. On cheap near-identical units, collapse it as each section directs.

Three rules carry the rest.

- Completions are queue events, not interrupts.
- Every spawn and every resume carries the standing orders verbatim.
- The brief is the product. A vague brief fails quietly, because a worker cannot ask you a question.

#### Roles and placement

- **Coordinator (this chat).** Local. Frames, authors briefs, drains the inbox, owns the human report, makes judgment calls. It never authors or edits code. Conflicted merges, chain rebases, and code changes are always tasks. Mechanically landing a verified unit (fast-forward or clean cherry-pick of a worker's commit, then push) is bookkeeping the coordinator may do itself on repos where local git is cheap. Queueing finished work behind an idle stacker is how a deadline harvests nothing. The loop is agentic end to end. Agents are spawned, resumed, and drained only through the `subagent` tool. Pick each subagent's thinking level for the job, per the Subagents section. State reads and writes go through `node scripts/orch.mjs` at drain points, one command in and one line out. The CLI never spawns, waits, or wakes anything.
- **Sub-coordinator.** Always local, durable, one per track, and only when the program exceeds what one coordinator's drains can manage. A track the coordinator can drain itself needs no middle layer. Each nested layer re-pays a full orientation preamble, and a blocking sub-coordinator hides its children while the parent idles. Owns its track's units and boards, authors its workers' briefs, spawns its own workers and verifiers (nesting works to depth 3, and a nested spawn has the full `subagent` schema including `cwd` and `worktree`). Rolls up aggregates at wave boundaries. Never forwards raw child reports. Cap in-flight children at what one drain can process, roughly ten, as a rolling window. Never as blocking batches, which cost the slowest child of every batch.
- **Worker / verifier.** Always a local child in its own branch or worktree unless the task needs this machine's browser or CLI runtime verification. Reading Pi session transcripts. Simulators and local IDE state. Auth that exists only here. Local children read the same store, so their briefs still inline what they need or point at repo paths. Prefer fewer, broader workers. One writer per worktree or branch (principle-separate-before-serializing-shared-state). Run a unit's verifier on a different model family from its worker.

Depth stays at coordinator, track, worker. Author the track decomposition per project (build, landing, and verification are common cuts, not a required shape). Hard-coded swarm trees were tried and parked as too rigid.

#### Store layout

Create `orchestrate/<project-slug>/` in the pstack run directory provided in the system prompt. Every file has exactly one writer. Owners publish facts, readers aggregate at read time. Use `node scripts/orch.mjs` for bookkeeping, written below as `orch`, while its canonical JSON state and receipts stay readable without the CLI.

- `preferences.md` is the standing-orders register: numbered lines, one constraint each (model policy, stack shape and count, verification bar, forbidden paths, escalation policy). Paste it verbatim into every spawn and every resume. Directives decay across resumes, and each dropped one costs a human turn. When you catch yourself restating an instruction, append the line before you act (principle-encode-lessons-in-structure).
- `plan.md` is the durable PR and issue DB, filled from the plan contract. Append. Never rewrite wholesale per event.
- `units` state has one row per unit: id, track, state, branch, PR, head SHA, brief path. It lives in the `orch` state file outside the repository; update rows in place through `orch record`.
- `frontier.json` is the computed merge frontier, per Stack safety.
- `receipts.jsonl` is the verification ledger, per Verification.
- `inbox.md` holds completion pointers. `gates.md` parks human gates (question, options, default on no answer).
- `decisions.tsv` is the trail via the show-me-your-work skill.
- `status.md` is derived from `orch status` and the receipts at each drain, never hand-maintained. Regenerate it from the tables instead of narrating events into it.

#### The brief

Your prompts to agents are your only product, and a sloppy brief compounds into slop across the whole tree. Every spawn carries all of it. A field you cannot fill is a unit you have not scoped yet.

```
GOAL         one sentence, the outcome, executable by a stranger with no chat access
SCOPE        paths this unit may write; paths it may not; its exclusive worktree or branch
CONTEXT      pointers to files and PRs; upstream reports pasted in full when this unit
             depends on them, because workers cannot see siblings
ACCEPTANCE   checkable criteria, one per line
VERIFY       exact commands or the control-skill path, plus known gotchas
TIMEBOX      rough cap on runtime; on expiry, return partial findings and stop rather than run on
FORBIDDEN    no PR retargets or merges, no rebase, no force-push, no fixes outside scope,
             plus unit-specific bans
REPORT       status, branch, head SHA, PRs, verdict, what you actually ran, deviations,
             suggested follow-ups
STANDING     <preferences.md pasted verbatim>
```

Size the brief to the unit. A one-command unit gets the template collapsed to a paragraph that still names goal, scope, the verify command, and the report shape. A 4KB scaffold around a two-line edit costs more to write and obey than the edit. Local spawns may reference the standing-orders file by store path. Verbatim paste is for every resume and every spawn whose child cannot read the store.

A sub-coordinator brief adds its track boundary and unit list, its spawn budget with the local default and the exception list, the drain protocol, and the rollup format (per child: name, status, PR, head SHA, verdict, one line, plus track status and frontier delta).

A dependency is a context relay, not just ordering. Undeclared upstream context makes the worker guess. Missing fields are a refuse-to-spawn condition. Audit one sampled worker brief per sub-coordinator per wave, concurrently with the wave it samples, never as a gate in front of it. A failing brief stops that track and fixes the sub-coordinator's instructions, not just the worker, because brief quality decays late in a run. Never resume-chain a brief. Respawn fresh with consolidated scope.

#### Steps

1. **Frame.** State the done predicate as something countable ("all 126 units merged, each ledger-verified `unit-test-verified` or better"). Quantify scope: units, rough effort, expected stacks, and the wall-clock budget. If one agent could finish inside that budget, stop here and run Autonomous run instead. Collapsing must not depend on another document being present. It means do the work directly in this session, plain workers where they help, verification inline, landing as you go, and none of the store, register, or pilot machinery below. Schedule landing against the budget. By roughly 70% of it, stop spawning and land what is verified. Name the tracks per project. A contested decomposition or one-way door goes through the arena skill before the pilot. Present the framing once. Reversible prep proceeds without waiting.
2. **Install the runtime.** Run `orch init --plan <plan.md>`. Open the trail via the show-me-your-work skill, write the standing orders before any spawn, and seed `frontier.json` from existing PRs with `gh pr view` queries, adding the Origin form when the forge is Origin.
3. **Pilot.** Push one unit through the whole path: brief, worker, verification, stack entry, ledger row, merge. The pilot exists to falsify the brief template, the verify recipe, and the unit size while that costs one agent instead of fifty. Fix the contract from pilot evidence before any fan-out. Scale the pilot to the unit. On programs of near-identical cheap units, the first unit is the pilot, run as a normal unit with its verify command inline, and fan-out starts the moment it lands. The dedicated pilot pipeline (separate verifier agent, audit gate) is for expensive or novel unit shapes, not for clone-units where a serialized pilot has nothing to falsify.
4. **Scale.** Spawn a rolling window of workers up to the in-flight cap, refilling as children finish. Blocking batches pay the slowest child of every batch. Spawn track sub-coordinators only past the one-drain threshold in Roles. Recompute ready work after each drain with `orch next`. Relay upstream reports into downstream briefs. Keep sibling communication upward only. The sampled brief audit runs alongside the wave it samples and stops the next refill on failure, not the current one.
5. **Drain.** Run the queue discipline below at every drain point.
6. **Land.** Landing is continuous, never a terminal phase. Integration starts with the first verified unit and runs alongside the remaining waves. On heavy repos the stacker is a standing role from wave one, integrating as units verify. On repos where local git is cheap, the coordinator lands verified units itself per Roles. Keep the frontier green before upper-stack work. Stack safety governs. Advance `frontier.json` only on merge or reported new head SHAs.
7. **Close.** Drain the final inbox, reconcile every spawned agent to a terminal row (done, abandoned, zombie-reconciled), confirm the predicate on the real artifact, confirm every landed PR has a verdict for its current head SHA, audit the trail per show-me-your-work including its cross-model review, encode recurring corrections into `preferences.md` or the brief template. Leave the store intact. It is the postmortem.

#### Queue and drain

- On a completion notification, run `orch record <unit> --state verified --head <sha> --evidence <path> --summary "<what you saw>"` and return to what you were doing. Never deep-review inline. A completion that needs review becomes a verifier unit. Never review a diff inside a drain.
- Drain in batches at four points: the end of a critical section, a track rollup, a frontier watcher wake (arm it via the loop skill, with a long heartbeat fallback), and before a human report. Begin each batch by reading `inbox.md`. Arrivals during a drain wait for the next one.
- Critical sections you finish first: authoring a brief, a stack operation, a conflict decision, writing a gate, updating ledger or frontier.
- Each drain classifies every pointer (landed, needs-verify, failed, zombie, noise), writes the resulting rows through `orch record`, runs `orch status`, then spawns the next wave in one message.
- Account for every spawned child at its track's rollup: arrived, respawned, or its scope explicitly absorbed. Silently redoing a missing child's work hides both the wasted spend and the coverage gap its result existed to close.
- A drain turn ends with the three lines from `orch status`: counts against the states, what changed, gates open. Detail lives in `status.md`. The full reply contract applies at checkpoints and close.

#### Stack safety

- The frontier is a computed object, never narrative. Recompute `frontier.json` after every merge and stack mutation: ordered PR list, branch names, head SHAs, a generation number, the lowest unmerged PR. Query the PR base chain through the checkout's current branch with `gh`, so chain order and PR states come from the forge. Use the Origin form when the program resolved the forge to Origin. Head SHAs come from local branch refs, so resolve it from the stacker's clone. A branch with no PR errors rather than guessing.
- Exactly one stacker per stack may mutate topology (chain rebases, force-pushes, base retargets, merges), serialized within its stack. Record the holder in the standing orders. Chain rebases run in a separate worktree. A local rebase at this scale stays off the laptop's only checkout.
- Workers never rebase and never retarget or merge PRs. Babysitters follow `playbooks/babysit.md`, one per stack, scoped to one immutable frontier generation. They report conflicts to the stacker rather than rebasing.
- PR closes and retargets go through the stacker only. Closing a base PR orphans every chain above it. Merges and stack surgery are units with briefs like any other.
- One retro watcher follows merged PRs for reverts, post-merge CI breaks, and orphaned follow-ups.

#### Verification

Scale verification to the unit. When VERIFY is a single cheap command, the worker runs it and reports the output, and the coordinator spot-checks receipts. A dedicated verifier agent (on a different model family than the worker) is for units whose verification is expensive, judgment-laden, or high-blast-radius. A verifier agent whose entire product would be rerunning one command is ceremony, not verification.

Write ledger rows with `orch record <unit> --evidence ...`. Check the current PR and head SHA with `orch status` and a real `gh pr view`. `receipts.jsonl`, one row per verdict, keyed by unit plus head SHA: `live-ui-verified | unit-test-verified | type-check-only | verifier-blocked | verifier-failed`. CI green is an input to a verdict, not a verdict. Behavioral work needs better than `type-check-only`. `verifier-blocked` is not a pass. Respawn when the environment heals. `verifier-failed` gets a fix unit, not a re-verify. A worker may self-report. A verifier overrides it on the same key. A new head SHA voids the row, so re-verify after restack. The ledger answers "was this verified", not memory and not the transcript.

A unit is not done until its output is externalized the moment it lands, never batched to the end of the run. A worker pushes its branch, a verifier writes its ledger row, receipts land in the store. Work that exists only on one machine when that machine dies was never done.

#### Liveness and failure

- Never resume an agent to check on it. A resume restarts an idle agent. Probe read-only: the ledger, the units state, `gh`, pushed branches, the child's status in the subagent tool. Transcript mtime is not liveness.
- A silent death gets a synthetic postmortem row in the inbox (unit, failure mode, last evidence, options). Replan on evidence as it arrives. Never wait for full quiescence.
- Retry by mode: cap-hit or oom, respawn with smaller scope. Network-drop, retry as-is. Tool-error, retry on a different model. Unknown, retry once. Two retries, then abandon the unit and replan around it.
- A zombie that returns hours late reconciles against the current frontier and ledger before anything is accepted. Salvage unique findings through a fresh unit, never a blind merge.
- When continued spawning would produce garbage tree-wide (bad upstream output, broken acceptance, dead infra), write a stop line at the top of the standing orders, let in-flight work finish, fix the cause, clear it.
- Bound your own infra retries the same way you bound a child's. After a few consecutive tool aborts, stop retrying. Write a terminal handoff to durable state (what is done, where it lives, the exact command to resume) and end the run.
- After a host restart: local children are dead, and no cloud work survives. Re-read the standing orders and the units state, recompute the frontier, reattach work by PR and branch rather than agent id, respawn one sub-coordinator per track from its stored brief plus current state, drain, resume. The dead session's `orch` state file is written atomically, so inspect and clear only a stale temporary file; never assume a lock service exists.

#### Escalation

Reaches the human, batched into the status page rather than per item: irreversible actions (force-push to shared branches, deploys, deletions, closing someone else's PR), genuine product or preference calls no experiment settles, a standing order that contradicts observed reality, a program-level dead end that survived a replan. Park each as a `gates.md` entry before asking, and route work around it.

Never reaches the human: frontier nudges, rebase mechanics, retries, CI flake triage, review-thread triage, format fixes, scope the brief already forbids (refuse and continue), and "should I keep going". When in doubt, act and log.

Mid-run discoveries fix only what blocks the frontier. Everything else parks in follow-ups. At this fan-out a small scope leak multiplies into PRs nobody asked for.

**Reply:** at checkpoints and close: the predicate and the count against it from the units state and receipts, tracks and what each landed, the frontier (PR list plus SHAs), verdicts summary, what was abandoned and why, gates awaiting the human (the only asks), the store path, and the trail path. Numbers from the tables, not narrative. Include PR links.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body preserves the upstream roles, brief, queue, stack, verification, and escalation rules with Cursor cloud, model, and `orch` substitutions.

Read [Poteto mode for Pi](../SKILL.md) and [the plan contract](../../../docs/templates/pstack-plan.md) before acting. `scripts/orch.mjs` is a plan-driven bookkeeping CLI, not the upstream TSV store daemon. It accepts `init`, `next`, `status`, `record <unit>`, and `publish <unit>`; state lives in a JSON store outside the repository, defaulting under the OS temp directory, and `--store` relocates it. `next` prints suggested `subagent` arguments; it never spawns, waits, or wakes a child. `publish` is a dry run unless `--execute` is passed, and that still needs the operator's separate authorization. There is no `frontier`, `inbox`, or `ledger` subcommand: keep `frontier.json`, `inbox.md`, and `gates.md` as coordinator-authored files and derive the ledger from `record` receipts. Never present an upstream `orch` subcommand here as installed behavior.

Coordinator state, standing orders, briefs, gates, and receipts stay under `<run-id>/orchestrate/` in the pstack run directory provided in the system prompt, or another durable operator-approved directory; never in the target repository and never at a hard-coded home path. Keep exactly one writer per file and worktree. The coordinator writes; children report and never edit shared state.

A concrete audit cadence for the coordinator, after replacing the package, repository, and plan paths:

```text
/loop run --max-turns 8 --until "cd '/absolute/target-repository' && node '/absolute/pi-pstack/scripts/check-plan.mjs' --complete '/absolute/run/<run-id>/orchestrate/plan.md'" "Read standing orders and the plan; reconcile real heads, drain completion pointers, audit current-head receipts, advance only authorized units, update counts and gates. Stop on a hold or exhausted budget."
```

The predicate is read-only and returns 0 only for the selected completion gate. `/loop` runs after agent turns; it is not an hourly scheduler or a queue daemon, and the audit still needs the coordinator's own drain. Use TUI or RPC, not print/JSON mode. A dirty worktree is rejected by default; inspect it and use `--allow-dirty` only deliberately. Do not add a second sleep loop. `/loop status` reports state; `/loop stop` stops continuation. Owner approval waits and dead infrastructure stop the loop with a durable handoff instead of consuming every turn.

Delegation needs current operator or project authorization and verified pi-subagents registration. Use configured pstack roles and thinking, never `model` in a task item or on the outer `subagent` call. `cwd` and `worktree` are outer-call fields; the `parallel` schema accepts `{ agent, task }` items only, so a reviewed worktree path goes in the task text. Wait for native completion notices. Without the integration, run units sequentially, label self-review, and report `BLOCKED: independent review` where independence is required.

Pushing, opening or editing a PR, merging, and every destructive action need explicit authorization in the current session for that action and scope. An upstream imperative, a green check, or a loop tick grants none. Auto-merge needs its own grant. Without landing authority, stop at merge-ready and report the exact gate.
