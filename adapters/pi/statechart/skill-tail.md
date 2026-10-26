## Pi execution and authority

Adapted from Lauren Tan's pstack, MIT. The upstream body above is byte-preserved from cursor/plugins@076f4b2f.

The chart entry is `node <package>/adapters/pi/statechart/entry.mjs`. It keeps the upstream scripts unchanged and applies only the Pi execution boundary. Run it from the parent shell. Set `TLA2TOOLS` (or `TLA2TOOLS_JAR`) to the same absolute `tla2tools.jar` the operator declared for `verification_exec`, and `JAVA` to the Java binary. This package bundles no Java, TLC, or mise, and never installs them; when they are missing, report the installation hint and stop.

`verification_exec` with `{"command":"tlc","spec":"<repo>/Spec.tla","config":"<repo>/Spec.cfg","options":["-cleanup","-noGenerateSpecTE","-noGenerateSpecTEBin"]}` remains the restricted TLC entry. It runs one TLC invocation, resolves repository paths, and writes private scratch only, so it cannot draw a chart. Keep chart runs in the parent shell and never report them as `verification_exec` runs.

`--png` uses Pele and resvg, downloaded by the upstream script into the user cache on first use. Those packages and their platform binaries are not part of this npm package. If the renderer cannot be installed or run, keep `chart.mmd`, `stories.md`, and `summary.json`, report that PNG is unavailable, and never claim a PNG exists. `render CHART.mmd` still requires a PNG.

A chart from a run that never executed TLC proves nothing. When TLC is unavailable, say `未做形式化验证，原因是缺少 TLC`, test the real code with generated inputs, and never report fixture or generated tests as a formal pass.

Use read for contents, ls for directories, fffind/ffgrep when available and find/grep otherwise, edit/write for authorized changes, and codemode to batch independent reads. Bash is for execution and Git with an explicit working directory, never a substitute file reader or searcher. Loading this skill grants no permission to commit, push, merge, deploy, delete, or send messages.
