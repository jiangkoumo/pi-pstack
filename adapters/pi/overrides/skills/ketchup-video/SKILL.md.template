---
name: ketchup-video
description: "Catch the user up like /ketchup, with a short silent video of slides for what happened and the waiting calls as text under it. Use explicitly with /skill:ketchup-video."
disable-model-invocation: true
license: MIT
---

# Ketchup video

Follow [`ketchup`](../ketchup/SKILL.md), but show what happened in a short silent video instead of its summary and visuals. Its window starts at the last message the user wrote before `/skill:ketchup-video`, not before any earlier `/skill:ketchup`. Writing and rendering the video, outside the repo, is the one exception to its read-only rule. The reply is ketchup's opening sentence, the embedded video, one line naming any work left that you can do yourself, and the action items. When the video shows a call's options, call each option by the name the video gives it. If the render fails, say so in one line and give only the calls.

## Slides

Use the screenshots, recordings, diffs, and data the work produced, not the chat's prose about them. Before you draw, write the one sentence the user should leave with and one line per slide. Drop each slide that does not change what the user knows. Use at most 10 slides, and fewer is better. Neither note goes in the reply.

Each slide makes one point. Build the slides on one picture and change it from slide to slide, rather than cut to an unrelated one. A color or shape means the same thing on every slide. Show the work in pictures, such as how a system works, a PR stack with each PR's state, a before and after of a fix, or options side by side. Point at what changed with arrows, highlights, and motion. A slide is never a bullet list, a status list, a table, or boxes with nothing connecting them.

Keep text to the minimum. Put each label on the thing it names, in plain words a person would say, not tags like "Tests: pass". Never caption what a picture shows, and never give a fact twice, across slides or in the text under them.

Show what came of each thing the user asked for, and whether it is done, still running, failed, or not checked. Never show something done that still waits on the user. Show any bug found and fixed on the way. If a visible change has no screenshot, say so on its slide and name what changed on screen. Draw only from facts you have. Never invent a number, and never draw a screen you did not capture.

## Render

Render one silent landscape video, such as an mp4, with motion between slides. Every frame is the slide itself, edge to edge. Make the frames from the slides, never by recording a screen. Hold each slide long enough to read its words, at least one second for each three words it adds. Words inside a screenshot do not count. Before you embed the video, look at one frame from each slide in the rendered file, and count the words it adds against its hold in that file. Fix any slide you cannot read in that time, render again, and check again.

## Pi delivery and failure fallback

Pi 1.4.0 can display a Markdown reference to a local MP4 path for the operator to open in a player. It has no general inline video playback component. Deliver an existing file as `[Open the catch-up video](file:///path/to/scratch/catch-up.mp4)`. Describe it as a file to open, never as embedded or inline playback. Keep the video available at that path; do not remove it before the operator can open it. Do not upload it or open an external application automatically.

If rendering, probing, frame inspection, or local file delivery fails, say in one short line that the video could not be prepared or delivered and why. Then give only the decision items in text, retaining their options, recommendations, evidence, and risks. Do not substitute a long status summary or claim a partial file is verified. If no decision waits on the operator, state that there are no pending decisions. Missing render tools take this fallback; do not install dependencies without authorization.

## Pi adaptation

- Explicit invocation is `/skill:ketchup-video`; load the linked ketchup instructions on demand. This template adapts the upstream embedded-video reply to Pi's local file reference and makes the operator-message window explicit.
- Obey the current Pi tool gates. Read files with `read`, locate files with `fffind` (or `find` when unavailable), and search content with `ffgrep` (or `grep` when unavailable). Batch reads of two or more known files in one `codemode` call. Create or edit text inputs and scripts with `write` / `edit`, including in scratch; do not use shell scripts to bypass these file-content tools.
- Use `bash` only to execute renderers, probes, tests, authorized read-only Git checks, or file management; set an explicit working directory for each command. Render programs may write their media outputs to scratch. For large command output, use `codemode` to return exit codes, compact evidence, and at most twenty diagnostic lines. Inspect extracted image files with `read`.
- The scratch exception grants no repository writes, configuration changes, global installs, commits, pushes, uploads, publishing, or messages to external services. Follow the operator's existing authorization for any external read. Missing access or tools must be reported, not worked around with an unauthorized write.

Adapted from pstack by Lauren Tan (@poteto), commit `519d36aa98955bf680db01bcde5fdfba686dc901`, `pstack/skills/ketchup-video/SKILL.md`. Copyright (c) 2026 Lauren Tan. MIT; see the retained license in LICENSES/pstack.txt. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings. Pi-specific changes: invocation and session window, scratch/tool boundaries, local MP4 delivery, and explicit failure fallback.
