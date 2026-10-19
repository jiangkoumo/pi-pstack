# pstack for Pi Harness Adapter

pstack skills originate from Cursor conventions. In Pi, this adapter specifies the mapping between Cursor concepts and Pi tools, subagents, models, paths, and authority. It documents the translation contracts. Single-agent workflows and two generated package agents are available. P3 direct subagent role wiring is implemented; full multi-model, background isolation and lifecycle acceptance remains incomplete.

## Tools

| Cursor Concept | Pi Mapping | Constraints & Behavior |
| --- | --- | --- |
| `Task` | `subagent({ ... })` or direct execution | Current workflows execute directly. P3 may use bounded child agents only with operator authorization and verified integration. Never invent Cursor Task syntax. |
| `AskQuestion` | Plain-text question in response | Ask the user directly in normal reply text. If in an autonomous grant, follow non-negotiable pause criteria. |
| Open a todolist | Inline response plan or task tracking | Keep the plan, phases, and throughput checkpoints in the response or use existing task tools. |
| Run another pstack skill (`/name` or "the **name** skill") | `read` `<package>/skills/<name>/SKILL.md` or `/skill:<name>` | Explicitly read leaf skill or use `/skill:<name>`. Skills are loaded on demand, not preloaded into every turn. |
| `Grep`, `Glob` | `ffgrep` / `grep`, `fffind` / `find` | Use Pi built-in search tools. Do not shell out to `rg` or `fd`. |
| `Read`, `Edit`, `Write` | `read`, `edit`, `write` | Native file tools only. Never use `cat`, `sed -i`, `echo >`, or script file I/O to read or modify files. |
| `Bash` | `bash` (restricted) | Reserved strictly for command execution, test runners, builds, package managers, and authorized git actions. Output parsed and bounded. |

## Models and Role Preferences

| Cursor Concept | Pi Mapping | Constraints & Behavior |
| --- | --- | --- |
| Fixed slugs (`claude-*`, `grok-*`, `gpt-*`) | Role preferences in `pstack.json` via `/setup-pstack` | Do not hardcode or substitute arbitrary models. Validated against actual Pi catalog snapshot. |
| `setup-pstack` | `/setup-pstack set <user\|project> <role> <provider/id> [thinking]` | Roles: `code`, `review`, `prose`, `verification`. Saved in the active Pi agent directory (user) or the host configuration directory under cwd (project, trusted only); standard paths are `~/.pi/agent/pstack.json` and `.pi/pstack.json`. |
| `inherit-parent` / unset role | `inherit` or omit model | Unset role preserves pi-subagents user defaults. Explicit inherit resolves to the exact parent model, preserving configured thinking as a validated suffix. |
| Model validation | Strict exact match | Unknown models or unsupported thinking levels produce a visible configuration error and stop execution; never silent fallback. |

## Subagents and Isolation

| Cursor Concept | Pi Mapping | Constraints & Behavior |
| --- | --- | --- |
| `subagent_type: generalPurpose` | Default general-purpose subagent | P3 target; not yet connected by this package. |
| `poteto-agent`, `comment-sicko` | `pstack.poteto-agent`, `pstack.comment-sicko` | Generated package agents. Direct subagent calls apply code/review preferences through tool_call; script workflows and slash launches are not wired. |
| `readonly: true` | Strict read-only tool allowlist (`read`, `grep`, `find`, `ls`) | Never grant `bash`, `edit`, or `write` to read-only delegates. Git status clean does not prove read-only compliance if write tools are present. |
| `readonly: false` | Writer delegate | One writer per working directory / worktree. Isolate concurrent writers in managed git worktrees. |
| `environment: "cloud"` | Unsupported | Cursor cloud execution is not supported. Use local worktrees with explicit operator authorization. |
| `run_in_background: true` | `async: true` | Subagents run asynchronously and wake the parent session natively upon completion. |

## Paths and Configuration

| Cursor Path | Pi Equivalent | Notes |
| --- | --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `skills/` in package, or `.pi/skills/` / `~/.pi/agent/skills/` | Discovered by Pi package loader or user skill paths. |
| `.cursor/rules/*.mdc` | `AGENTS.md` (project) or `pstack.json` (config) | System instructions live in `AGENTS.md`. Role configuration lives in `pstack.json`. |
| Agent transcripts (`~/.cursor/projects/...`) | Pi session history / branch entries | Session history is stored in Pi session files; read current branch via extension APIs. |

## Authority and Safety Safeguards

1. **No Implied Authority**: Invoking a pstack skill or turning on `poteto-mode` grants NO permission to commit, push, create PRs, auto-merge, or spawn unrequested subagents.
2. **Deterministic Checks**: Never declare completion on "it compiles" or agent self-reports. Run actual observable behavior tests and verify diffs.
3. **Operator Instructions Govern**: User and project rules override skill defaults. Follow the higher-priority rule; ask only when a material decision remains unresolved.
