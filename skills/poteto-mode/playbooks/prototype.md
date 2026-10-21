### Prototype

**You own the design decision, not the code. The prototype is a throwaway instrument. The real build follows Feature.**

The one playbook where the Laziness Protocol's "smallest change" and the verification bar invert. Speed over polish, code quality does not matter, no planning. The rigor is in picking the right design cheaply. Propose variations the user didn't ask for, throw an approach away and try another.

1. Scope the decision the prototype exists to make: which layout, which interaction, which density, or for an empirical fork which behavior, timing, or approach. No decision means no prototype. Route to Feature.
2. Gather references when the design space is open. Search for prior art, summarize a moodboard of themes, palettes, and layouts, let the user pick directions before building. Skip when the direction is set.
3. Build throwaway in an isolated scratch dir, separate from production source. For a visual decision, vanilla HTML/CSS/JS or the lightest stack that renders the idea, CDN deps, a dev server with hot reload. For a behavioral or timing decision, the smallest script that exercises the question. No production framework, no tests, no abstractions.
4. When comparing alternatives, build them behind one switcher (buttons or a keypress), each variant labeled. This is the **exhaust-the-design-space** principle skill made cheap.
5. Verify on the matching surface. For a visual decision, screenshot each variant via the control skill and drive the interaction. For a behavioral or timing decision, observe the thing you are deciding by logging the timing, printing the output, or watching the render. The observation is the test here, not an assertion.
6. Present alternatives, tradeoffs, and a recommendation. The output is the decision plus the throwaway artifact, not shippable code. Hand the chosen direction to **Feature** (or `architect` for the shape) for the real build.

**Reply:** the variants explored, the evidence (screenshots for a visual decision, the observed output or timing for a behavioral one), tradeoffs, your recommendation, and the scratch path. Say plainly that the prototype is throwaway.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `f713f14203cd6420cec13cd7c55c32d598dbab68`; license: `LICENSES/pstack.txt` in the package root. The body above preserves the upstream steps with the listed Cursor tool, model, and skill substitutions. These notes govern platform and authorization differences.

Read [Poteto mode for Pi](../SKILL.md) before acting. Resolve skill names through `read <package>/skills/<name>/SKILL.md` or `/skill:<name>`; load them on demand. `/unslop` replaces Cursor's deslop pass. Use Pi's `read`, `edit`, `write`, `ffgrep`/`grep`, `fffind`/`find`, and `ls` for file content; `bash` executes programs and checks. Ask the operator in plain text when a decision is needed.

Store local trails, patches, resume notes, and prototype artifacts under `<run-id>/` in the pstack run directory provided in the system prompt, or another durable operator-approved local directory. Keep evidence out of the repository unless its inclusion is authorized. A path in an upstream example is not permission to write unrelated user state.

The operator's current task grant governs delegation, local commits, and worktrees. Keep one writer per worktree; a replacement takes over only after the previous writer has stopped. Give every delegate the goal, allowed paths, prohibitions, approved decisions, acceptance commands, and a route back to its parent. Use configured role models and thinking from `/setup-pstack`; never put `model` on the outer `subagent` call or in a parallel task item. Wait for completion notices. If pi-subagents is unavailable or delegation is forbidden, execute the steps in sequence within the current grant, label self-review, and report `BLOCKED: independent review` where independent review is required.

Pushing, opening or editing a PR, and merging require explicit authorization in the current session for the action and scope. Auto-merge needs its own explicit grant. Rebase, amend, reset, force-push, and deletion follow the operator's Git and cleanup rules; an upstream imperative does not bypass them. Without push/PR authorization, prepare and display the proposed Conventional Commits title and PR body locally, then report the branch, checks, and pending action. Green CI, a loop tick, and a previous PR do not grant authority.

Use an available platform driver or the control skill's Pi adapter to drive the matching surface and save the observations. Browser tools and native-app drivers are environment capabilities, not bundled services; if the required surface cannot be driven, report that evidence as missing. Keep the throwaway artifact isolated with one writer. Hand the decision to Feature for a production build; cleanup follows the operator's path-specific grant.
