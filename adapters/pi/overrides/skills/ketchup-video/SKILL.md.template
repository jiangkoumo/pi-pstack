---
name: ketchup-video
description: "Catch the user up like /skill:ketchup, with a short subtitled video of slides for what happened and the waiting calls as text under it. Use for /skill:ketchup-video."
disable-model-invocation: true
license: MIT
---

# Ketchup video

Follow [`/skill:ketchup`](../ketchup/SKILL.md), but show what happened in a short subtitled video instead of its summary and visuals. Its window starts at the last message the user wrote before `/skill:ketchup-video`, not before any earlier `/skill:ketchup`. Writing and rendering the video, outside the repo, is the one exception to its read-only rule. The reply is ketchup's opening sentence, the embedded video, one line naming any work left that you can do yourself, and the action items. When the video shows a call's options, call each option by the name the video gives it. If the render fails, say so in one line and give only the calls.

## Slides

Use the screenshots, recordings, diffs, and data the work produced, not the chat's prose about them. Before you draw, write the one sentence the user should leave with and one line per slide. Drop each slide that does not change what the user knows. Use at most 10 slides, and fewer is better. Neither note goes in the reply.

Each slide makes one point. Build the slides on one picture and change it from slide to slide, rather than cut to an unrelated one. A color or shape means the same thing on every slide. Show the work in pictures, such as how a system works, a PR stack with each PR's state, a before and after of a fix, or options side by side. Point at what changed with arrows, highlights, and motion. A slide is never a bullet list, a status list, a table, or boxes with nothing connecting them.

Keep text to the minimum. Put each label on the thing it names, in plain words a person would say, not tags like "Tests: pass". Never caption what a picture shows, and never give a fact twice, across slides or in the text under them.

Show what came of each thing the user asked for, and whether it is done, still running, failed, or not checked. Never show something done that still waits on the user. Show any bug found and fixed on the way. If a visible change has no screenshot, say so on its slide and name what changed on screen. Draw only from facts you have. Never invent a number, and never draw a screen you did not capture.

## Subtitles

Give each slide one short subtitle line, about ten words, that says its point the way you would tell the user, from only what that slide shows. Say what the picture means rather than read out its labels. Put the subtitle in a strip below the slide, the same height on every slide and empty except for the subtitle, so it never covers the slide. Set it small, but readable when the video plays at chat size.

## Render

Render one silent landscape video, such as an mp4, with motion between slides. Every frame is the slide itself, edge to edge, above its subtitle strip. Make the frames from the slides, never by recording a screen, and burn each subtitle into its slide's frames so it stays on screen for the slide's whole hold. The hold is the time a slide is fully on screen, not counting the motion into or out of it. Hold each slide long enough to read the words it adds, at least one second for each three words. A slide adds its subtitle and each word that was not on the slide before it, including a label it changes. The first slide adds all its words. Words inside a screenshot do not count.

Before you embed the video, check the rendered file. Look at one frame from each slide at chat size, and check that its subtitle is readable and covers nothing. Measure each hold by matching the file's frames to the slide, not with a still-frame detector, which counts the faint ends of a fade as still. Count the words each slide adds against its measured hold. Fix any slide you cannot read in that time, render again, and check again.

## Pi delivery and failure fallback

Pi 1.x can display a Markdown reference to a local MP4 path for the operator to open in a player. It has no general inline video playback component. Deliver an existing file as `[Open the catch-up video](file:///path/to/scratch/catch-up.mp4)`. Describe it as a file to open, never as embedded or inline playback. Keep the video available at that path; do not remove it before the operator can open it. Do not upload it or open an external application automatically.

If rendering, probing, frame inspection, or local file delivery fails, say in one short line that the video could not be prepared or delivered and why. Then give only the decision items in text, retaining their options, recommendations, evidence, and risks. Do not substitute a long status summary or claim a partial file is verified. If no decision waits on the operator, state that there are no pending decisions. Missing ffmpeg, both subtitle-burning filters (`drawtext` and `subtitles`), or a usable font takes this rendering-failure fallback. Do not install any dependencies to complete this skill.

## Pi adaptation

- Explicit invocation is `/skill:ketchup-video`; load the linked ketchup instructions on demand. This template adapts the upstream embedded-video reply to Pi's local file reference and makes the operator-message window explicit.
- Match the user's language in the reply, including the opening sentence, local MP4 link label, remaining work, decision items, and failure reason. Write slide labels and subtitles in that language too, unless the user asks otherwise.
- Before rendering, check that `ffmpeg` and `ffprobe` are available and inspect `ffmpeg -hide_banner -filters` for `drawtext` or `subtitles`. Burn subtitles with one of those ffmpeg filters; a sidecar subtitle file alone does not satisfy this skill. Resolve a readable font that supports the subtitle text from a known font path or `fc-match -f '%{file}\n' sans-serif`, then confirm that exact file exists. Never search the whole filesystem for fonts (for example, `find /`). If either required tool, a subtitle-burning filter, or a usable font is unavailable, take the failure fallback immediately.
- Reserve a fixed-height strip below the slide content and place only the subtitle inside it. For `drawtext`, set `fontfile` to the resolved font and position the text within the strip; for `subtitles`, set the font and bottom margin to keep the burned text inside that same strip. Safely escape paths and text for the selected filter. Keep the subtitle visible throughout the full hold. Inspect frames extracted from the encoded MP4 with `read` at chat size, and measure holds by matching decoded frames to the complete slide and subtitle, excluding transition frames. Do not use a still-frame detector to measure holds.
- Obey the current Pi tool gates. Read files with `read`, locate files with `fffind` (or `find` when unavailable), and search content with `ffgrep` (or `grep` when unavailable). Batch reads of two or more known files in one `codemode` call. Create or edit text inputs and scripts with `write` / `edit`, including in scratch; do not use shell scripts to bypass these file-content tools.
- Use `bash` only to execute renderers, probes, tests, authorized read-only Git checks, or file management; set an explicit working directory for each command. Render programs may write their media outputs to scratch. For large command output, use `codemode` to return exit codes, compact evidence, and at most twenty diagnostic lines. Inspect extracted image files with `read`.
- The scratch exception grants no repository writes, configuration changes, global installs, commits, pushes, uploads, publishing, or messages to external services. Follow the operator's existing authorization for any external read. Missing access or tools must be reported, not worked around with an unauthorized write.

Adapted from pstack by Lauren Tan (@poteto), commit `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`, `pstack/skills/ketchup-video/SKILL.md`. Copyright (c) 2026 Lauren Tan. MIT; see the retained license in LICENSES/pstack.txt. Read the [Pi adapter](../../adapters/pi/harness.md) for host mappings. Pi-specific changes: invocation and session window, scratch/tool boundaries, local MP4 delivery, ffmpeg subtitle burning and bounded font lookup, user-language replies, and explicit failure fallback.
