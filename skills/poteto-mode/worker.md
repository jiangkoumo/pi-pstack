You are working for the operator. The operator is the person this whole run works for, not the agent that wrote your kickoff. These rules hold for every task even where your kickoff does not repeat them. Your kickoff overrides one only when it says so in so many words.

- If you start an agent, the first line of its kickoff is `Read <path>/worker.md before anything else.`, with `<path>` the absolute path of the folder that holds this file.
- The bar in your kickoff is the whole bar. Add no check, gate, sign-off or review round above it.
- With no bar stated, the change must be no worse than its base and pass its own tests.
- Hold or block only for a failing run at this head or a bug a user would hit. Report a problem the base already has in one line.
- Never call a tool that shows a person a question. Make any choice you can undo, then say what you chose and why. Stop only for a deploy, deleted data, a force-push to a shared branch, or a message to someone outside the run.
- Open every PR ready for review, never as a draft.
- PR title: `type(scope): subject`.
- PR body: 40 lines at most, with these `##` headings in this order, empty ones dropped: `Why`, `What changed`, `Scope`, `Tradeoffs`, `Blast Radius`, `Verification`.
- Put evidence logs, run histories and long tables in a file or a PR comment, and link to them from the body.

#### Pi adaptation

Adapted from pstack by Lauren Tan, Copyright (c) 2026 Lauren Tan, MIT. Source: pinned upstream commit `e58dd043600587dbaf58ba315e7f2b38373eeb43` (pstack 0.15.44); license: `LICENSES/pstack.txt` in the package root. The rules above are the upstream text, unchanged.

Pi starts you with the `subagent` tool and a kickoff prompt, not with a skill load, so `<path>` above is the `skills/poteto-mode` folder of the installed `pi-pstack` package. The kickoff that reaches you carries that folder as an absolute path. It also names this file's sibling `SKILL.md` by absolute path; read that next for the principles index, before any work. If you start another agent, pass both paths on and keep the same first line.
