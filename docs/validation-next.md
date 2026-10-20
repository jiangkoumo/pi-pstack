# 下一轮功能与对等性验收记录（0.2.0）

本文记录对等性增强、多代理角色注册、长程编排及缺陷修复的验收依据。基线提交：`10194d6`。

---

## P0 功能覆盖

### 1. poteto-mode 路由与原则覆盖
- **24 条工程原则**：`skills/poteto-mode/SKILL.md` 中补齐全部 24 条 `principle-*` 叶子技能的相对链接与适用条件，全量可达；
- **Non-negotiables 触发**：补回 `how`、`architect`、`swarm`/`arena`、`interrogate`、`unslop`、`technical-writing`、`no-comments`、`benchmark-checklist` 的触发规则；
- **Autonomy 与写作规则**：补齐 Always-pause 清单、夜间续跑覆盖规则、短句声明式写作与注释约束；
- **验证**：`node --test scripts/coverage.test.mjs` 覆盖 24 条原则叶子链接存在性与触发词检测（13/13 项单测通过）。

### 2. 12 项原 substitute 恢复为 ported
以下 9 个独立技能与 3 个 playbook 恢复完整方法正文，替换 Cursor 专有路径为 Pi 对应规范：
- 技能：`how`、`poteto-help`、`figure-it-out`、`blast-radius`、`benchmark-checklist`、`teach`、`show-me-your-work`、`create-verification-skill`、`maintain-verification-skill`；
- Playbook：`runtime-forensics`、`trace-forensics`、`visual-parity`；
- `benchmark-checklist`：保留至少 5 次交替运行、限制因素分析、物理上限推算与结构化报告；
- `principle-explain-the-number`：更新为引用实际打包的 `benchmark-checklist` 技能，不再标为未打包；
- 剩余 9 个 `substitute` 条目在 `skills/poteto-mode/SKILL.md` 中均明确给出本地替代路径，无悬空条目。

---

## P1 多代理与角色

### 3. 公开事件运行时角色代理注册
- **公开事件协议**：仅经 `pi-subagents:runtime-agent-register:v1` 同步事件注册代理定义，不侵入 `pi-subagents` 内部模块，不改写其内部 launch；
- **包导出解耦**：从 `package.json` 移除静态 `pi.subagents.agents` 导出，消除全局代理名碰撞；
- **四角色映射**：
  - `code` → `pstack.poteto-agent`（writer）
  - `review` → `pstack.comment-sicko`（read-only）
  - `verification` → `pstack.verifier`（read-only，新增）
  - `prose` → `pstack.prose-writer`（writer，新增）
- **模型与 Thinking 绑定**：角色模型直接绑定至代理定义；`inherit` 传递为 `"inherit"`；未配置角色不写入 model/thinking（沿用默认模型）；
- **动态生命周期**：`session_start` 注册，`/setup-pstack set/unset` 增量刷新（先 dispose 旧句柄再注册），`session_shutdown` 幂等清理；
- **顶层 Model 守卫**：调用包含任何 pstack 代理时若传入顶层 `model`，机械拦截并提示使用 `/setup-pstack`；
- **验证**：
  - `node --test scripts/role-agents.test.mjs`：6 项单测覆盖定义解析、四角色分发、dispose 清理与 top-level model 拦截；
  - `node scripts/check-parallel-roles.mjs`：真实 Pi SDK + pi-subagents 0.79.2 公开入口实测，4 角色并行分发至 4 个独立 provider 端点，顺序脚本及用户级 `agentOverrides` 优先级全部通过。

### 4. 多代理方法内容与 References 恢复
- `architect`、`arena`、`interrogate`、`swarm`、`reflect`、`why`：恢复上游 prompt、评分 rubric、多源调查指南与审阅者角色；
- 共恢复 23 份 Markdown references，放于各技能目录下的 `references/` 中，通过技能链接按需加载；
- 验证：`node --test scripts/coverage.test.mjs` 验证各技能与 references 完整链接且无死链。

---

## P2 长程编排

### 5. 可执行编排与 Plan Checker
- **标准契约**：新增 `docs/templates/pstack-plan.md`（计划契约模板，含单 top-level `pstack-plan` JSON 块）与 `docs/templates/pstack-pr.md`（PR 证据模板）；
- **Node CLI 检查器**：新增 `../scripts/check-plan.mjs`，支持结构检查与 `--complete` 完成检查，严格校验 PR 依赖无环、任务证据路径有效性、live 必须含 regression lane；
- **Playbook Pi 改造**：
  - `multi-phase-plan`：产出标准计划并经 checker 验证；
  - `orchestrate`：保留 brief 规范、滚动窗口、drain 纪律与 exact-head ledger，使用 `/loop --until` 进行计划完成度审计；
  - `babysit`：保留 lowest-unmerged 优先与审查评论处理，使用 `gh` GraphQL 分页查询与 `gh pr checks`，通过有界 `/loop` 推进；
- **验证**：`node --test scripts/check-plan.test.mjs` 覆盖 16 项正反例测试，真实计划通过，循环依赖拒绝。

---

## P3 缺陷修复与类型支持

### 6. Abort 后 Loop 状态持久化
- `registerLoopAbortHooks(pi)`：监听 Pi 核心的 `agent_settled` 事件，在 `event.aborted` 为 true 且 loop 仍在运行时，将其立即持久化为 `interrupted (operator-aborted)`；
- 验证：`node scripts/check-abort-state.mjs` 验证 RPC 与 TUI 模式下中断后立即报告 `interrupted`。

### 7. TypeScript 严格模式
- 修复 `extensions/pstack/index.ts` 中 `paths[scope]` 的索引类型收窄（`scope` 收窄为 `'user' | 'project'`）；
- 补齐 `loop.mjs`、`runtime.mjs`、`config.mjs` 的 JSDoc 类型；
- 验证：`tsc --noEmit --strict --allowJs` 在 `extensions/pstack/index.ts` 上 0 错误通过。

### 8. 文档相对路径与死链
- `docs/*.md` 内所有指向脚本的相对路径统一使用 `../scripts/...` 格式，修正 41 处死路径；
- 验证：`../scripts/check-package.mjs` 遍历检查全部发布文档与链接，无死链。
