# 跟进 pstack 0.15.36 的实施计划（U36）

日期：2026-11-02。目标：将 `pi-pstack` 从上游 `cursor/plugins@519d36aa98955bf680db01bcde5fdfba686dc901`（0.15.34，此前全包基线 `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10` + `statechart`/`ketchup-video` 局部 pin `519d36aa`）统一同步到 `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`（pstack `0.15.36`），消除局部 `sourceOverrides`，并完成六个子任务（U36-1 至 U36-6）的同步与验证。

## 1. 目标 SHA 与上游提交范围

| 项目 | 值 |
| --- | --- |
| 上游仓库 | `https://github.com/cursor/plugins`（子目录 `pstack/`） |
| 历史全包基线 | `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10`（0.15.30） |
| 前置跟进基线 | `519d36aa98955bf680db01bcde5fdfba686dc901`（0.15.34） |
| 本次目标 SHA | `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`（0.15.36，2026-10-27T23:12:40Z） |
| 包含上游提交 | `ab1f702`（`feat(pstack): port recent skill updates (#986)`）、`c742dd6`（`feat(pstack): make Orchestrate agentic and delete the orch scripts (#1043)`） |
| 集成分支 | `sync/upstream-01536`（基于 `main` `7af23c2` = `v0.3.15`） |

核心原则：能照搬的照搬（playbook 与 skill 正文逐字对齐，只替换 Cursor 专有 token），不能照搬的按 Pi 宿主特性适配，Pi 授权与工具门禁追加在尾部；上游已删除的资源与脚本同步清理。

## 2. 上游变更清单与逐文件处置（照搬 / 适配 / 删除）

### 2.1 `519d36aa..c742dd61` 上游 `pstack/` 变更（共 29 个路径）

| 上游路径 | 状态 | 处置方式 | 说明与负责任务 |
| --- | --- | --- | --- |
| `pstack/skills/poteto-mode/playbooks/orchestrate.md` | M | 适配（正文照搬 + Pi token 替换 + 尾部保留门禁） | 上游改为 agentic 编排，去掉 `orch` CLI；Pi 替换 `Task`、云环境、事件订阅与本地 store 路径（U36-2） |
| `pstack/skills/poteto-mode/scripts/orch/orch.ts` | D | 删除 | `upstream/` 快照与清单在 U36-1 删除；端口 `scripts/orch.mjs` 在 U36-2 随上游删除 |
| `pstack/skills/poteto-mode/scripts/orch/orch.test.ts` | D | 删除 | `upstream/` 快照与清单在 U36-1 删除；端口 `scripts/orch.test.mjs` 在 U36-2 随上游删除 |
| `pstack/skills/poteto-mode/scripts/orch/store.ts` | D | 删除 | `upstream/` 快照与清单在 U36-1 删除；端口 `scripts/orch.mjs` 在 U36-2 随上游删除 |
| `pstack/skills/poteto-mode/scripts/package.json` | M | 不纳入快照（随 `orch` 测试脚本清理） | 上游移除 `orch` 测试入口；端口 `scripts/run-checks.mjs` 等引用在 U36-2 同步移除 |
| `pstack/skills/interrogate/SKILL.md` | M | 适配（正文照搬 + Pi 角色与 worktree 映射） | 重写为 Frame → Fan out（借用 `arena` Phase A/B）→ Verify → Output（Intent / Findings / Dropped）（U36-3） |
| `pstack/skills/interrogate/references/code-quality-review.md` | D | 删除 | `upstream/` 快照与 `port-map.json` 在 U36-1 移除；模板与生成文件在 U36-3 删除 |
| `pstack/skills/interrogate/references/lead-judgment.md` | D | 删除 | `upstream/` 快照与 `port-map.json` 在 U36-1 移除；模板与生成文件在 U36-3 删除 |
| `pstack/skills/interrogate/references/reviewer-prompt.md` | D | 删除 | `upstream/` 快照与 `port-map.json` 在 U36-1 移除；模板与生成文件在 U36-3 删除 |
| `pstack/skills/interrogate/references/rubric.md` | D | 删除 | `upstream/` 快照与 `port-map.json` 在 U36-1 移除；模板与生成文件在 U36-3 删除 |
| `pstack/skills/arena/SKILL.md` | M | 适配（正文照搬 + Pi 模型/角色映射） | 同步 cross-judge 异 family 约束、`auto`/`inherit` 不当评委、Phase C 跳过说明（U36-3） |
| `pstack/skills/poteto-mode/SKILL.md` | M | 适配（正文照搬 + Pi token 替换） | 新增首条消息复述目标触发器、后台 resume/steer、slug 回退、Explain the Number 与 Autopilot-stack 描述（U36-4） |
| `pstack/skills/poteto-mode/playbooks/autonomous-run.md` | M | 适配（正文照搬 + Pi token 替换） | 同步上游自主运行流程描述，保留 Pi `/loop` 与门禁段（U36-4） |
| `pstack/skills/poteto-mode/playbooks/autopilot-full.md` | M | 适配（正文照搬 + Pi token 替换） | 同步上游队列协调正文，保留 Pi 门禁段（U36-4） |
| `pstack/skills/poteto-mode/playbooks/autopilot-stack.md` | M | 适配（正文照搬 + Pi token 替换） | 对齐上游“Autopilot-full 去掉 merge”定义，保留 Pi 门禁段（U36-4） |
| `pstack/skills/poteto-mode/playbooks/babysit.md` | M | 适配（正文照搬 + Pi token 替换） | 同步上游 PR 监视正文，保留 Pi 门禁段（U36-4） |
| `pstack/skills/poteto-mode/playbooks/multi-phase-plan.md` | M | 适配（正文照搬 + Pi token 替换） | 同步上游多阶段计划正文，保留 Pi 门禁段（U36-4） |
| `pstack/skills/poteto-mode/playbooks/opening-a-pr.md` | M | 适配（正文照搬 + Pi token 替换） | 子代理开 PR 不再跑 `interrogate`、只报 merge-ready，保留 Pi 门禁段（U36-4） |
| `pstack/skills/principle-explain-the-number/SKILL.md` | M | 照搬（更新模板正文与链接） | 同步上游 Explain the Number 正文更新（U36-4） |
| `pstack/skills/setup-pstack/SKILL.md` | M | 替代路线（更新 `upstream/` 快照） | Pi 继续通过 `/setup-pstack` 扩展命令实现；快照在 U36-1 更新，引用说明在 U36-4 核对 |
| `pstack/skills/poteto-help/SKILL.md` | M | 适配（正文照搬 + Pi 入口替换） | 同步 Autopilot-stack 触发词并将 `ketchup-video` 描述改为 `subtitled`（U36-4） |
| `pstack/skills/poteto-help/references/recipes.md` | M | 适配（正文照搬 + Pi 入口替换） | 同步上游 recipes 变更（U36-4） |
| `pstack/skills/ketchup-video/SKILL.md` | M | 适配（正文照搬 + Pi 字幕渲染与降级段） | 改为带字幕视频（Subtitles 段、烧录字幕、hold 规则与帧检查），追加 Pi `ffmpeg` 与降级说明（U36-5） |
| `pstack/README.md` | M | 适配（对应段落同步） | 端口 `README.md` 对应段落按需同步（U36-4） |
| `pstack/docs/guide/04-design.md` | M | 不纳入快照（如端口有对应段落则同步） | 上游指南文档更新（U36-4 核对） |
| `pstack/docs/guide/07-overnight.md` | M | 不纳入快照（如端口有对应段落则同步） | 上游指南文档更新（U36-4 核对） |
| `pstack/docs/guide/10-recipes-and-pitfalls.md` | M | 不纳入快照（如端口有对应段落则同步） | 上游指南文档更新（U36-4 核对） |
| `pstack/plugin.json` | M | 元数据同步 | 版本号升至 `0.15.36`，同步至 [upstream-inventory.json](upstream-inventory.json) 与 [port-map.json](port-map.json)（U36-1） |
| `pstack/.cursor-plugin/plugin.json` | M | 不纳入快照 | Cursor 插件清单版本号升至 `0.15.36` |

### 2.2 全包基线从 `eb4db2b5` 统一切换至 `c742dd61` 的其余快照同步

此前 #45、#46、#47 已在端口实现中吸收了 `eb4db2b5..519d36aa` 的改动，但 `docs/source-files.json` 仍保持 `eb4db2b5` 基线 + `sourceOverrides`。本次在 U36-1 将 `upstream/pstack` 快照与三份清单原子切换到 `c742dd61`，一并更新以下 10 个已在 0.15.34 审计/吸收的上游快照文件并清空 `sourceOverrides`：

- `pstack/skills/create-formal-verification-skill/SKILL.md`（快照更新，已在 `96e2a40` 适配）
- `pstack/skills/reflect/SKILL.md`（快照更新，已在 #45 适配）
- `pstack/skills/swarm/SKILL.md`（快照更新，已在 #45 适配）
- `pstack/skills/poteto-mode/scripts/check-plan.mjs`、`check-plan.test.ts`（快照更新，已在 #45 审计）
- `pstack/skills/poteto-mode/scripts/watch-pr/github.ts`、`github.test.ts`、`policy.ts`、`policy.test.ts`、`types.ts`（快照更新，已在 #45 审计）
- `pstack/skills/poteto-mode/scripts/worktree-audit.sh`（快照更新，已在 #45 审计）

切换后，`upstream/pstack` 快照共 535 个文件（原 542 个文件减去上游删除的 7 个文件）。

## 3. sha256 清单校验机制

为替代原先散落在测试中的逐字节 `Buffer` 对比，新增 [upstream-manifest.json](upstream-manifest.json) 与 `scripts/upstream-manifest.mjs`：

- 清单结构：`{ "upstreamSha": "<40位SHA>", "files": { "<path>": "<sha256>" } }`。
- 覆盖范围：全部 535 个 `upstream/pstack/**` 快照文件，以及 406 个 `strategy: "verbatim"` 的打包文件（`skills/statechart/scripts/**` 与 `skills/statechart/references/render.md`），合计 941 项。由 `adapters/pi` 模板或替换规则有意修改的端口文件不进入该清单。
- 换行规范：计算 `sha256` 前统一将 `CRLF`（`\r\n`）转为 `LF`（`\n`）。
- 生成命令：`node scripts/upstream-manifest.mjs --from <上游目录> --sha <SHA>`。
- 校验命令：`node scripts/upstream-manifest.mjs --check`，并在 `scripts/statechart-adapter.test.mjs` 与 `scripts/generation.test.mjs` 中执行校验；发现不一致时打印具体文件路径、期望 hash 与实际 hash。

## 4. U36 任务划分

| 任务编号 | 分支名 | 范围与职责 |
| --- | --- | --- |
| U36-1 | `u36-1-baseline` | 更新 `upstream/pstack` 快照到 `c742dd61`（删除 `orch/*` 与 `interrogate/references/*` 共 7 个文件，更新 26 个变更文件）；切换 `docs/source-files.json`、`docs/upstream-inventory.json`、`docs/port-map.json` 至 `c742dd61`；新增 `docs/upstream-manifest.json` 与 `scripts/upstream-manifest.mjs` 并接入测试；编写本计划文档 |
| U36-2 | `u36-2-orchestrate` | 按 `c742dd6`（#1043）重写 `orchestrate.md.template` 并生成 `skills/poteto-mode/playbooks/orchestrate.md`；删除端口 `scripts/orch.mjs`、`scripts/orch.test.mjs` 及测试计划、`dependency-audit.json` 中的相关引用 |
| U36-3 | `u36-3-interrogate` | 按 `ab1f702`（#986）重写 `interrogate/SKILL.md.template` 并同步 `arena/SKILL.md.template`；删除 `skills/interrogate/references/*` 及其 override 模板，清理所有引用 |
| U36-4 | `u36-4-playbooks` | 同步 `poteto-mode/SKILL.md`、6 份 playbooks（`autopilot-stack`、`autopilot-full`、`multi-phase-plan`、`babysit`、`opening-a-pr`、`autonomous-run`）、`principle-explain-the-number`、`poteto-help`、`recipes.md` 及 `README.md` |
| U36-5 | `u36-5-ketchup-video` | 同步 `ketchup-video/SKILL.md` 带字幕视频要求（Subtitles、烧录字幕、hold 计算与帧检查），补充 Pi 本地 `ffmpeg` 字幕烧录与缺依赖降级说明 |
| U36-6 | `u36-6-gitread` | 修复 `extensions/pstack/git-read.mjs` 对 `-n N` / `-N` 参数与默认分支（`origin/HEAD` → `main` → `master`）的解析；升级锁文件 `pi-coding-agent` / `pi-ai` 至 `1.5.0` 并补 `pi-schema` 工具参数兼容测试 |
