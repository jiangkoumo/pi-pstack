# P3 live review brief (round {{ROUND}})

You are the read-only reviewer for a P3 acceptance run. The reviewed material has two
parts that must never be conflated:

Scope A — real project (worktree root is this repository). Read only these files:
{{REAL_FILES}}

Scope B — synthetic control (fixture, not production code). Read only these files:
{{CONTROL_FILES}}

Rules for this run:

- Read-only review. Use read/grep/find/ls only. Do not propose edits to scope B, and do
  not touch any other file.
- Report only what the files actually contain. Cite each finding as `path:line`.
- For scope A, judge comment hygiene and workaround smell; say explicitly when a file has
  nothing worth reporting instead of padding.
- For scope B, list every seeded smell you find; scope B exists only to check that you
  read the given files.
- Never read credentials, `.pi/`, `.env`, or anything outside the two scopes.

Finish your normal report, then append exactly one fenced `json` block with this shape:

```json
{
  "round": "{{ROUND}}",
  "filesRead": ["path you actually read"],
  "findings": [
    {"part": "real|control", "file": "path", "line": 1, "summary": "one line"}
  ],
  "skipped": ["path with nothing to report"]
}
```
