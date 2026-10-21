# recall 移植验证

固定上游：`f713f14203cd6420cec13cd7c55c32d598dbab68`（pstack 0.15.25）。分支基线：`2dbf49b`。Node `v22.22.2`，npm `10.9.7`。

## 改动

- `adapters/pi/overrides/skills/recall/SKILL.md.template` → `skills/recall/SKILL.md`（`npm run generate` 生成）。
- 上游正文逐句保留；替换 Cursor transcript 路径为 Pi session 路径，替换 subagent 的 speed 概念为 Pi thinking，其余步骤、输出契约和回复格式不变。
- 文末新增 `Pi adaptation`：session 根与 slug 规则、只读当前 cwd、mtime 排序、`$PI_SESSION_FILE` 排除当前会话、`pstack.verifier` 只读挖掘、缺失 MCP 明确记为空结果。

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

真实 Pi 会话目录（不是 fixture）：

```text
$ node --input-type=module -e "…listWorkspaceSessions('/Users/jiangkoumo/Documents/pi-pstack')…"
root=/Users/jiangkoumo/.pi/agent/sessions
slug=--Users-jiangkoumo-Documents-pi-pstack--
workspaceSessions=10
2026-10-21T06:31:17.467Z 01a15cd1-713b-7349-ab84-a6f9a5c59c49 2026-10-21T04-56-32-316Z_01a15cd1-713b-7349-ab84-a6f9a5c59c49.jsonl
2026-10-21T04:55:55.201Z 01a15c78-26da-7349-ab84-a6f705d2bc3c 2026-10-21T03-19-00-571Z_01a15c78-26da-7349-ab84-a6f705d2bc3c.jsonl
2026-10-21T03:14:41.962Z 01a15a01-6653-7349-ab84-a6f4b5f51ee0 2026-10-20T15-50-03-605Z_01a15a01-6653-7349-ab84-a6f4b5f51ee0.jsonl
newestFirst=true
allInWorkspace=true
```

`node scripts/skill-authoring.mjs skills/recall` 返回 `{"ok":true,"name":"recall","errors":[]}`，解析到两个跨目录链接：

```text
adapters/pi/harness.md
skills/poteto-mode/SKILL.md
```

`npm run check:generate` 返回 `{"status":"passed","checked":116,"unmanaged":0}`。完整 `npm run check` 退出码 0，`check-package` 输出 `{"status":"passed","mapped":82,...,"dispositions":{"substitute":5,"ported":77},...}`。

## 保真度

按去 frontmatter、去 `#### Pi adaptation` 后的逐行 LCS 计算：上游 19 个非空行，命中 17，**89.5%**。未命中的 2 行是 transcript 路径段和 subagent 速度/思考级别句，均为本轮要求的 Cursor→Pi 替换。

## 未验证

- 没有用模型真实执行一次“回忆最近工作”的端到端任务；本轮验证的是会话发现契约、作用域、mtime 排序和只读性。
- 共享记录扫描依赖操作者实际配置的 MCP；本机没有在本任务中逐个连接 Slack/Notion/Sentry/Datadog/Linear，技能要求缺失时明确报告空结果与缺口。
