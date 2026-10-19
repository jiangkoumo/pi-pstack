# Run notes — 2026-10-18 dual-model live review (rerun, passing)

These files are the artifacts of one live run of `scripts/check-p3-live-review.mjs`
with `--out` pointing at this directory. The run passed (`summary.failures: []`,
script exit code 0). Harness sha256 prefix `8b0b0f33c4534b07`.

## Provenance

Every file here was written by the harness itself; none was edited by hand.

| File | Source |
| --- | --- |
| `summary.json`, `round-A.json`, `round-A.md`, `round-B.json`, `round-B.md` | Written during the run. |
| `round-A-child-session.jsonl` | Harvested by the harness from the pi-subagents child session log and copied here; sha256 prefix `5ee4ee7278ab2f36` (also recorded as `summary.rounds[0].childSession.sha256`). |
| `round-B-child-session.jsonl` | Same; sha256 prefix `f63904179ea49fd9`. |

Timing (derived from file mtimes in UTC plus each round's `wallMs`): round A ran
about 06:14:16Z–06:14:41Z (25.3 s), round B about 06:14:41Z–06:15:17Z (36.3 s),
about 61 s end to end. Two review sessions total, one per model, no retry and no
provider substitution.

## Models and transport

| Round | Configured review role | Wire model seen by the recorder | Requests | Status |
| --- | --- | --- | --- | --- |
| A | `magpie/opendesign/deepseek-v4.1-flash` + `high` | `opendesign/deepseek-v4.1-flash`, `reasoning_effort=high` | 4 | every request `200` |
| B | `magpie/opendesign/glm-5.3-flashx` + `high` | `opendesign/glm-5.3-flashx`, `reasoning_effort=high` | 3 | every request `200` |

Both rounds were captured by the recording proxy (`wireCapture: "recorded"`), so
the temporary `models.json` isolation held for every child request this time.

## What changed since the archived attempt

This run uses `opendesign/glm-5.3-flashx` instead of `opendesign/glm-5.3-flash`.
The latter carries a model-level `baseUrl` and `api: "anthropic-messages"` in
`~/.pi/agent/models.json`; Pi resolves a model-level `baseUrl` ahead of the
provider one, which is why the archived attempt reached the gateway directly and
the recorder saw nothing. The harness now deep-copies each model entry into the
temporary catalog and strips every endpoint-shaped field (asserting none survive),
and it blocks models whose effective api is not `openai-completions`.

The pre-fix attempt's evidence is kept next door in
`runs/2026-10-18-dual-model-attempt1/`; it is historical only and no assertion
references it.

## Redaction and cleanup

The provider api key is copied only into the temporary agent directory with mode
0600 and is never written here. A credential-pattern search over this directory
matches nothing but the sentence in `summary.json` describing that redaction. The
temp agent directory and the child-session temp directories were removed by the
harness at the end of the run.
