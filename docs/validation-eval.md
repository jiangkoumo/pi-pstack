# eval 移植验证

固定上游：`f713f14203cd6420cec13cd7c55c32d598dbab68`（pstack 0.15.25）。分支基线：`2dbf49b`。Node `v22.22.2`，npm `10.9.7`。

## 改动

- `adapters/pi/overrides/skills/poteto-mode/playbooks/eval.md.template` → `skills/poteto-mode/playbooks/eval.md`（`npm run generate` 生成）。
- 上游 blinding 规则、7 个步骤和 reply 保留。只替换 transcript 定位：
  - Cursor `agent-transcripts/` 与 `~/.cursor/projects/*/` → Pi 子代理 `subagent({action:"status", id, options:{view:"transcript"}})`、`sessionFile` / `steps[0].sessionFile`，以及当前工作区 `subagent-artifacts/<run-id>_<agent>_transcript.jsonl`。
  - 保留“不跨工作区”的约束，并明确禁止枚举 `sessions/*`。
- 文末 `Pi adaptation` 增加：候选隔离 `cwd`、`pstack.poteto-agent` / `prose-writer` / 只读 judge、省略 `model`、角色模型族相同时必须报告、delegation 不可用时不得冒充盲测、证据与授权边界。

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

真实 pi-subagents 子代理 transcript：

```text
$ node --input-type=module -e "…listSubagentTranscripts('/Users/jiangkoumo/Documents/pi-pstack')…"
transcripts=16
2026-10-21T02:46:12.839Z edc0959c-4311-46b9-88a8-55c95499e1de worker
2026-10-21T02:46:12.802Z d9ff27fb-12e5-4b7c-9100-754357298694 worker
2026-10-21T02:46:12.790Z 6e7cb932-1bb8-4b42-83dd-6f6daf17f439 worker
newestFirst=true
onlyWorkspace=true
```

目录为 `~/.pi/agent/sessions/--Users-jiangkoumo-Documents-pi-pstack--/subagent-artifacts/`；同一目录下的 `*_meta.json` 记录 `runId`、`parentSessionId`、`agent`、`model`、`usage`，但 eval 的链路判定只读 transcript，不依赖 meta 的自报。

`npm run check:generate` 返回 `{"status":"passed","checked":116,"unmanaged":0}`。完整 `npm run check` 退出码 0，`check-package` 输出 `{"status":"passed","mapped":82,...,"dispositions":{"substitute":5,"ported":77},...}`。

## 保真度

去 `#### Pi adaptation` 后逐行 LCS：上游 19 个非空行，命中 18，**94.7%**。唯一未命中的行是第 6 步的 transcript 路径句，替换为 Pi 的子代理 session/transcript 定位；步骤 4、5 的模型与 arena 分工保持上游原文，角色绑定差异写在 Pi adaptation。

## 未验证

- 没有执行一次真实的 N 候选 × 盲 judge 端到端实验；本轮验证的是子代理 transcript 的真实存在、当前工作区作用域、mtime 排序和 fixture 行为。
- 没有验证“judge 与父会话模型族不同”的配置组合；当前机器上的模型目录和角色配置不足以在不改用户配置的前提下构造该组合。
