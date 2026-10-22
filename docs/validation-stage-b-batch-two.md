# 阶段 B 第二批验收记录

## 概述

第二批任务包括 Issue #26（形式化验证技能创建与维护）、#27（状态机 statechart 出图与测试接入）和 #28（setup-pstack 形式化验证提议与规范命名）。
三个任务在隔离的 Herdr worktree 中由子 agent（模型 `magpie/opendesign/deepseek-v4.1-flash`）独立完成，主控审核后按序 rebase 并合并到 `main`。

## 分支与提交历史

1. **Issue #28**（`feat/28-setup-and-naming`）:
   - Commit `d06aac3`: `feat(setup): offer a project formal verification skill once with TLC capability (B5, B9)`
   - 实现 `extensions/pstack/setup-formal.mjs`：扫描本地技能、根据 TLC 能力构建提议、实现“提议一次且拒绝后不再提示”、`scripts/check-package.mjs` 引入 kebab-case 技能命名门禁。
   - 22 个单测（`scripts/setup-formal.test.mjs`）全部通过。
2. **Issue #26**（`feat/26-formal-verification-skills`）:
   - Commit `a9cf5b6`（rebase 后）: `feat(skills): port create and maintain formal verification skills with Pi adaptation`
   - 移植 `/create-formal-verification-skill` 与 `/maintain-formal-verification-skill`，上游正文逐字保留（保真度 100%），在尾部追加 Pi 宿主执行约定。
3. **Issue #27**（`feat/27-statechart`）:
   - Commit `361d3a2`（rebase 后）: `feat(statechart): append Pi execution boundary and wire upstream tests (B4)`
   - 移植 `/statechart` 技能（保真度 100%），上游 7 个核心脚本从快照 verbatim 生成，将 `statechart.test.mjs` 接入 `run-checks.mjs` 测试套件（支持 `timeoutMs` 覆盖）。
   - 在真实 TLC 环境下执行 `OutputFolder.tla` 出图验收，5 项不变量全部成立，生成 `chart.mmd`、`summary.json`、`stories.md` 及 PNG。

## 主控集成与接线

1. **资源注册与清单（docs/port-map.json & docs/skill-audit.md）**:
   - `create-formal-verification-skill`、`maintain-formal-verification-skill` 与 `statechart` 在 `docs/port-map.json` 中由 `substitute` 转为 `ported`，`dispositions` 变为 80 ported / 5 substitute。
   - statechart 下的 11 个脚本与模型文件在 `preparedResources` 中状态由 `pending-acceptance` 转为 `accepted`。
   - `docs/skill-audit.md` 记录同步更新。
2. **扩展接线（extensions/pstack/index.ts）**:
   - 在 `/setup-pstack status` 中引入 `setup-formal.mjs` 的 `findFormalVerificationSkills` 与 `describeFormalSkillStatus`，展示形式化验证技能探针与提议状态。
3. **路由扩充（scripts/routing-cases.json & scripts/routing.test.mjs）**:
   - 路由用例扩充至 53 项，新增 `/create-formal-verification-skill`、`/maintain-formal-verification-skill` 与 `/statechart` 的显式触发测试；`poteto-mode` 模式指导同步对齐。

## 验证证据

- `npm test`: exit 0，34/34 检查全部通过（耗时约 65s）。
- `python3 tools/upstream-fidelity.py .`: overall kept 4443/4722 = 94.09%（>= 94% 要求达成）。
  - `skills/create-formal-verification-skill/SKILL.md`: 100%
  - `skills/maintain-formal-verification-skill/SKILL.md`: 100%
  - `skills/statechart/SKILL.md`: 100%
- `node scripts/check-package.mjs`: exit 0，80 项 ported 资源结构与 frontmatter kebab-case 校验全部通过。
- `git diff --check`: exit 0，无任何空白或格式问题。
