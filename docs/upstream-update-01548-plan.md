# pstack 0.15.48 同步计划与实施拆分

日期：2026-11-24。目标：将 `pi-pstack` 的上游固定基线从 `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`（pstack `0.15.36`）分两阶段追平到 `9e278fe4d4ecd8bfe98b1b79bf4be662efb338cc`（pstack `0.15.48`），保持「固定上游快照 + Pi 适配层 + 生成资源」三层结构与全部既有安全门禁。

## 1. 上游基线演进

| 阶段 | 上游区间 | 目标提交 | 插件版本 | 合入方式 |
| --- | --- | --- | --- | --- |
| 基线起点 | — | `c742dd61706fbacc1b95f1a20b7b988cf096ce6c` | `0.15.36` | [U36 同步](upstream-update-01536-plan.md) |
| 第一阶段（`U44-1`–`U44-4`） | `0.15.36 → 0.15.44` | `e58dd043600587dbaf58ba315e7f2b38373eeb43` | `0.15.44` | 已随 `bf0c7cd` / `2f87c85` / `e58dd04` 差异契约合入 `main` |
| 第二阶段（`U48-1`–`U48-4`） | `0.15.44 → 0.15.48` | `9e278fe4d4ecd8bfe98b1b79bf4be662efb338cc` | `0.15.48` | 串行收口后合入 `main` |

两份既有中间差异契约继续保留在仓库中供追溯：[0.15.42 差异](validation-upstream-01542-delta.json)、[0.15.44 差异](validation-upstream-01544-delta.json)、[0.15.48 差异](validation-upstream-01548-delta.json)。

## 2. 第二阶段（`0.15.44 → 0.15.48`）任务分工

| 任务 | 分支 | 职责范围 |
| --- | --- | --- |
| `U48-1` | `u48/1-repin` | 按 `9e278fe4` 重建 `upstream/pstack/` 归档（516 文件），同步四份来源与清单 JSON（`source-files.json`、`upstream-inventory.json`、`port-map.json`、`upstream-manifest.json` 共 925 项），新建 [0.15.48 差异契约](validation-upstream-01548-delta.json)，登记 `skills/reframe/SKILL.md` 与 `statechart/scripts/{janitor,kill}.ts` 并重新生成受管产物 |
| `U48-2` | `u48/2-reframe` | 核实 `reframe` 以 `inherit-body` 逐字继承的可行性，在 [poteto-help 覆盖模板](../adapters/pi/overrides/skills/poteto-help/SKILL.md.template) 技能选择表加入 `/reframe` 路由并生成产物；核实 `dd24b670` 中 `poteto-mode`/`arena` 的 Cursor 模型改动无需抄入 Pi 模板 |
| `U48-3` | `u48/3-statechart` | 对齐 `0.15.42`（`sany-errors`、父状态入边）与 `0.15.46`（`janitor.ts`、`kill.ts`、Windows `\r\n` 处理与运行说明），修复 [statechart 替换规则](../adapters/pi/statechart/skill-replacements.json) 中 POSIX/Windows 统一路由至 `entry.mjs`，将无外部依赖的 `messages.test.ts` 接入默认检查计划 |
| `U48-4` | `u48/4-docs-fidelity` | 同步 `README.md`、`CHANGELOG.md`、[来源记录](sources.md)、[移植计划](migration-plan.md)、[首批移植记录](port-status.md)、[逐项审计](skill-audit.md)、[接入决策](integration-decisions.md)，新建本计划与 [0.15.48 验收记录](validation-upstream-01548.md)；核实 `setup-pstack` `0.15.42–0.15.48` 变动并记录于决策文档；调整模板措辞以通过单文件保真度下限并记录整体分母现状 |

## 3. 架构与范围边界

- `setup-pstack` 在 Pi 中维持 `substitute`（`extension-command`），由 `/setup-pstack` 读写 `pstack.json` 与宿主可用模型目录，不修改 `extensions/**`、不引入 Cursor `.mdc` 预算或默认模型 slug。
- `/skill:reframe` 保持显式技能调用（`disable-model-invocation: true`），不新增扩展命令。
- 原则、技能与工作流继续由 `npm run generate` 从 `upstream/` 与 `adapters/pi/` 生成；所有验证结果与待裁决项统一汇总在 [0.15.48 验收记录](validation-upstream-01548.md)。
