# automate-me 移植验证

固定上游：`f713f14203cd6420cec13cd7c55c32d598dbab68`（pstack 0.15.25）。分支基线：`2dbf49b`。Node `v22.22.2`，npm `10.9.7`。

## 改动

- `adapters/pi/overrides/skills/automate-me/SKILL.md.template` → `skills/automate-me/SKILL.md`（`npm run generate` 生成）。
- 上游流程、步骤顺序、guardrail、evaluation 和 reply 保留。替换项：
  - `~/.cursor/projects/<slug>/agent-transcripts/` → `$PI_CODING_AGENT_DIR/sessions/--<cwd-slug>--/`，并支持 `PI_CODING_AGENT_SESSION_DIR`。
  - `.cursor/skills/**/*-mode` 与 `~/.cursor/skills/*-mode` → `.pi/skills/**/*-mode`、`~/.pi/agent/skills/*-mode`。
  - `create-skill` → Pi 安装包自带的 `docs/skills.md` 作者契约 + `read`/`edit`/`write`。
  - `AskQuestion` → 宿主有结构化提问工具时使用，否则用对话提问。
  - subagent 的 fast/standard speed → Pi thinking level。
- 文末 `Pi adaptation` 增加：只读当前 cwd、按 mtime 排序、排除 `$PI_SESSION_FILE`、隐私边界、提交/PR 授权门。

## 实际运行

```text
$ node --test scripts/session-skills.test.mjs
ok 1 - workspace slug follows Pi session directory encoding
ok 2 - session root honors the Pi session and agent directory overrides
ok 3 - lists only current-cwd sessions, newest first, excluding the current session
ok 4 - listing sessions is read-only and never creates a missing workspace directory
ok 5 - lists subagent transcripts for the current workspace only, newest first
ok 6 - authoring validation accepts a portable skill and rejects broken structure
# tests 6
# pass 6
# fail 0
```

真实会话目录的解析与作用域：

```text
$ node --input-type=module -e "…listWorkspaceSessions('/Users/jiangkoumo/Documents/pi-pstack')…"
root=/Users/jiangkoumo/.pi/agent/sessions
slug=--Users-jiangkoumo-Documents-pi-pstack--
workspaceSessions=10
2026-10-21T06:31:17.467Z 01a15cd1-713b-7349-ab84-a6f9a5c59c49 …
2026-10-21T04:55:55.201Z 01a15c78-26da-7349-ab84-a6f705d2bc3c …
2026-10-21T03:14:41.962Z 01a15a01-6653-7349-ab84-a6f4b5f51ee0 …
newestFirst=true
allInWorkspace=true
```

`node scripts/skill-authoring.mjs skills/automate-me` 返回：

```json
{
  "ok": true,
  "name": "automate-me",
  "errors": [],
  "links": []
}
```

`npm run check:generate` 返回 `{"status":"passed","checked":116,"unmanaged":0}`。完整 `npm run check` 退出码 0，`check-package` 输出 `{"status":"passed","mapped":82,...,"dispositions":{"substitute":5,"ported":77},...}`。

## 保真度

去 frontmatter、去 `#### Pi adaptation` 后逐行 LCS：上游 62 个非空行，命中 51，**82.3%**。未命中的 11 行全部是要求替换的 Cursor 路径或工具名：

- `create-skill` 出现 6 处（编排说明、draft、YAML 规则、prose 迭代、evaluation、when-not-to-use）。
- `.cursor/skills/...` 与 `~/.cursor/skills/...` 出现 2 处。
- `agent-transcripts/` 与跨工程 glob 说明 1 处。
- 固定的 fast/standard speed 1 处。
- `AskQuestion` 1 处。

没有额外改写流程、guardrail 或 evaluation 的语义。

## 未验证

- 没有对操作者的真实私有历史跑一次完整习惯挖掘；本任务的验证覆盖目录解析、cwd 作用域、mtime 排序、当前会话排除和只读性。真实挖掘需要操作者明确授权和指定范围。
- 当前 Pi 宿主没有 `ask` 结构化提问工具时，技能按文档回退为对话提问；没有模拟一个带结构化提问工具的宿主来验证两种 UI 路径。
