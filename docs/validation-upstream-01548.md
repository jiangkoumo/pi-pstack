# pstack 0.15.48 同步验收记录

日期：2026-11-24。记录 `pi-pstack` 同步至上游 `9e278fe4d4ecd8bfe98b1b79bf4be662efb338cc`（pstack `0.15.48`）后各任务结论、保真度分析与可复现检查命令。本文件只记录已实测运行的输出，不改 `package.json` 版本号，也不发布。

## 1. 各任务集成结论

| 任务 | 合并状态 | 关键产出与结论 |
| --- | --- | --- |
| `U44-1`–`U44-4` | 已合入 `main` | 同步 `0.15.42–0.15.44` 上游重构：单文件 `how`/`why`、精简版 `architect`/`reflect`/原则/`poteto-mode`/playbooks、新增 `poteto-mode/worker.md`，移除上游已删 `orchestrate`、`check-plan` 与旧参考文件 |
| `U48-1` | 已合入 `main`（`2c0cb1c`） | 归档 516 文件与 `9e278fe4` 字节一致；`source-files.json`（516）、`upstream-inventory.json`（63 技能 / 22 流程 / 2 代理 = 87 项）、`port-map.json`（82 `ported` / 5 `substitute` / 0 `deferred`，417 preparedResources）与 `upstream-manifest.json`（925 项 LF 归一化 sha256）全部校验通过 |
| `U48-2` | 已合入 `main`（`f768484`） | `skills/reframe/SKILL.md` 通过 `inherit-body` 逐字继承生成；`poteto-help` 路由表加入 `../reframe/SKILL.md`；Pi `check:pi` 发现全部 57 个技能目录、`diagnostics: []`、`defaultPromptCharacters: 0`；确认 `dd24b670` 的 `gemini-4-neon-xhigh` 仅限 Cursor 模板，未写入 Pi |
| `U48-3` | 已合入 `main`（`b34f076`） | 验证 `statechart` 适配器在 `0.15.42`（`sany-errors`、父状态入边）与 `0.15.46`（`janitor.ts`、`kill.ts`、`\r\n` 处理）下保持 fail-closed 不自动运行 `mise`；统一 `skills/statechart/SKILL.md` 的 POSIX 与 Windows 入口至 `entry.mjs`；将 `messages.test.ts` 接入默认检查计划 |
| `U48-4` | 当前分支 `u48/4-docs-fidelity` | 同步全仓来源与状态文档；在 [接入决策](integration-decisions.md) 登记 `setup-pstack`（`0.15.42–0.15.48`）仅为 Cursor `.mdc` 变更、不适用 Pi 的结论；微调 6 份覆盖模板在不丢失 Pi 适配前提下消除 `skills/how/SKILL.md` `< 70%` 报错并提升整体保真度，同时记录 `0.15.48` 整体 94% 阈值的结构性分母问题 |

## 2. 保真度门禁现状与模板调整

### 2.1 为何 `overall` 在 `0.15.48` 下低于 94%

- **调整前基线**：`files=125`，`kept=2874`，`upstream=3118`，`overall=92.1745%`（`errors: ["Overall fidelity 92.1745% < 94%", "skills/how/SKILL.md: 69.23% < 70%"]`）。
- **单文件问题已修复**：通过调整 `adapters/pi/overrides/skills/how/SKILL.md.template`（保留 `coverage.test.mjs` 约束的 `Spawn one read-only explainer...` 句并恢复 `Present the subagent's output.`），`skills/how/SKILL.md` 从 `9/13 (69.23%)` 升至 `10/13 (77%)`，单文件 `< 70%` 报错清零。
- **整体 94% 结构性缺口（待操作者裁决口径）**：
  - 上游在 `0.15.42–0.15.48` 大幅精简了已移植技能（`0.15.42` `bf0c7cd` 删除 `how/references/*`、`why/references/*`，`0.15.43` `2f87c85` 删除 `architect/references/*`、`reflect/references/*`，并压缩多份原则与主流程正文），使整体非 Cursor 替换句分母从 `0.15.36` 的 `4720` 降至 `3118`（减少 `1602` 句）。
  - 同时，两项在 [port-map.json](port-map.json) 登记为 `substitute`、不存在对应端口 Markdown 的条目被 [check-upstream-fidelity.mjs](../scripts/check-upstream-fidelity.mjs) 计入整体分母且 `kept=0`：`skills/make-bot-ui/SKILL.md`（`71` 句）与 `skills/setup-pstack/SKILL.md`（由 `0.15.36` 的 `46` 句增至 `60` 句），合计 `131` 句，单独拉低整体分值 `131 / 3118 = 4.20%`。
  - 在模板层微调 6 份文件后（不损失 Pi 适配、权限门禁、角色绑定与 `coverage.test.mjs` 契约前提下追回 18 句），所有 123 个非缺失文件合计保持率为 `2892 / 2987 = 96.82%`，但整体仍为 `2892 / 3118 = 92.7518%`（距 `94%` 门槛 `2931` 句仍差 `39` 句）。
  - 要在不改动 `scripts/check-upstream-fidelity.mjs` 口径/阈值的前提下跨过 `94%`，全部 123 个非缺失文件最多只能保留 `56` 句差异；而当前仅保留必要 Pi 工具/安全门禁/无自动提交与云代理替换的不可压缩差异（`poteto-help`、`worktree-cleanup`、`swarm`、`automate-me`、`statechart`、`runtime-forensics`、`shipping`、`trace-forensics`、`poteto-mode` 等）已超过此上限。

### 2.2 本次安全调整的模板（共 6 份）

| 模板文件 | 调整内容与保真收益 | 保留的 Pi 适配 |
| --- | --- | --- |
| `adapters/pi/overrides/skills/how/SKILL.md.template` | 恢复 `Present the subagent's output.`（`9/13 → 10/13`） | 保留 `pstack.judgment-agent`、`judgment` 角色、只读约束与未授权本地回退 |
| `adapters/pi/overrides/skills/poteto-mode/SKILL.md.template` | 将内联路径/追加说明拆为独立短句，恢复 `Difficulty alone never qualifies.` 等上游断句（`108/127 → 119/127`） | 保留 `/skill:poteto-mode`、`/poteto on|off|status`、角色路由表与写代码 review gate |
| `adapters/pi/overrides/skills/figure-it-out/SKILL.md.template` | 将检查点豁免条件与 Pi 委派授权说明拆为独立句（`40/44 → 42/44`） | 保留授权门、`/setup-pstack` 角色与不自动 git commit |
| `adapters/pi/overrides/skills/automate-me/SKILL.md.template` | 恢复 `orchestrates three others` 与 `Pi session transcripts` 措辞（`83/90 → 85/90`） | 保留 Pi 会话目录解析、`/reload` 与对话问答回退 |
| `adapters/pi/overrides/skills/no-comments/SKILL.md.template` | 保留原 `reasoning level` 句并将 `/setup-pstack` 拆为独立句（`34/36 → 35/36`） | 保留只读 `pstack.comment-sicko` 与 lead 供给 diff 约束 |
| `adapters/pi/overrides/skills/poteto-help/SKILL.md.template` | 恢复 `Other tools can read the skills, because they use the Agent Skills format.`（`135/156 → 136/156`） | 保留 Pi 包机制、`/poteto`、`/setup-pstack` 与 `pstack.json` 说明 |

## 3. 可复现检查命令

在仓库根目录执行（重型检查按顺序单次运行）：

```bash
npm ci
npm run check:generate
node scripts/check-package.mjs
node scripts/upstream-manifest.mjs --check
npm test
npm run check:fidelity
```

- 前四项与 `npm test` 的实际执行输出见本次验收报告；`npm run check:fidelity` 单文件错误已清零（`skills/how/SKILL.md` 为 `77%`），整体 `92.7518% < 94%` 留待操作者裁决是否调整 `scripts/check-upstream-fidelity.mjs` 口径（例如从整体分母剔除已登记为 `substitute` 的未移植入口或重新校准阈值）。
