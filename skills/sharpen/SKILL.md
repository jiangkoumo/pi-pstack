---
name: sharpen
description: "Make a task deeper, not bigger, then rewrite the prompt. Use for /sharpen."
disable-model-invocation: true
license: MIT
---

I want a deeper version of this task, not a bigger one. Before rewriting it, do four things:

1. Say what a top professional in this field would do here that I'm not asking for.
2. Name the rawest material they would start from instead of what has already been digested for me.
3. Name the specific methods and tools they would use.
4. Say what, other than you or me, would show the result is right.

Then rewrite my prompt to ask for exactly that.

Have the rewritten prompt ask the agent to prototype any choice an experiment can settle and recommend an option based on what it observed. Leave product or preference choices that no experiment can settle for me to make.

## Pi adaptation

Use the four questions above as internal preparation. Return only the rewritten prompt, ready for the user to send. Do not prepend answers to the four questions, analysis, commentary, a greeting, or a separate “Rewritten prompt” heading. Keep the task deeper, not bigger. The rewritten prompt asks for a prototype of any choice an experiment can settle and a recommendation grounded in what that prototype observed; product and preference choices that no experiment can settle stay open for the user.
