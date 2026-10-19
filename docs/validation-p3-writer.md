# P3 writer 委派与 review gate

状态：**父代理流程与机械门禁已实现并单测通过；端到端 host 子代理流程尚未验收。** 本文件记录写代码委派闭环中已经能执行的部分，以及仍然不能宣称的部分。

对应计划项：[移植计划](migration-plan.md#p3多代理与多模型) 的“先迁移一个多模型只读审阅流程，再迁移写代码的委派流程”和“交接明确目标、允许路径、禁止事项、已批准决定、验收证据和联系主代理的方法”。

## 已实现

### 1. 父代理交接契约

[poteto-mode 技能](../skills/poteto-mode/SKILL.md) 新增 “Delegate a writer only through a review gate” 一节，来源是 [适配模板](../adapters/pi/overrides/skills/poteto-mode/SKILL.md.template)。它要求：

- 只在操作者授权且 pi-subagents 可用时委派；缺少集成时保持单代理。
- handoff 必须写明：目标、允许路径、禁止事项、已批准决定、验收命令、遇阻报告方式。
- writer 用 `worktree: true` 隔离，父代理 checkout 保持干净，同一 cwd 不放两个 writer。
- writer 完成只是提案；`review-required` 不是批准。
- 独立 reviewer 以 writer worktree 为 cwd、携带 base/head/diff；父代理逐条核实 findings。
- 审阅后冻结 tree id，写 review 记录，再过门禁；合并需要单独授权。

该节还明确写出边界：门禁是父代理侧约束，不是沙箱，也不能阻止父代理绕过脚本直接跑 Git。

### 2. 机械门禁

[scripts/writer-gate.mjs](../scripts/writer-gate.mjs) 在应用 writer 补丁前检查：

| 检查 | 失败码 |
| --- | --- |
| review JSON 结构、版本、verdict | `review-shape` / `review-version` / `review-verdict` |
| baseCommit 与 worktree HEAD 一致 | `stale-base` |
| reviewedTree 与当前 `git write-tree` 一致 | `stale-tree` |
| 没有 blocking finding | `review-blockers` |
| reviewer 只声明 `read/grep/find/ls` | `review-tools` |
| worktree 注册在该 repo 下 | `not-a-worktree` |
| 源仓库干净、HEAD 未移动 | `source-dirty` / `source-moved` |
| 补丁非空且能 `git apply --check` | `empty-patch` / `apply-check` |
| 可选验收命令在 writer worktree 内通过 | `check-failed` |

通过后：

- 默认只做检查，不改源仓库。
- `--apply` 才把审阅过的补丁应用到源 **工作树**；不 commit、不 push。
- `--receipt` 写出包含 base、reviewed tree、patch/review sha256 和检查结果的 JSON。
- 任一失败都不修改源工作树。

## 实际验证

```bash
node --test scripts/writer-gate.test.mjs
# 10 tests, 10 pass, 0 fail，约 2 秒
```

测试覆盖：正常通过且不动源仓库、`--apply` 应用补丁、blocking 拒绝、审阅后 tree 变化拒绝、reviewer 带写工具拒绝、源仓库脏拒绝、源 HEAD 移动拒绝、验收命令失败拒绝、空补丁拒绝、receipt 生成。

`npm run check` 与 `npm run check:p3` 已接入该测试；命令与结果见 [P3 验收](validation-p3.md)。

## 尚未实现 / 不能宣称

1. **没有端到端 host 子代理验收**：尚未用真实 Pi + pi-subagents 跑通“父会话启动 writer → 完成后启动 reviewer → 父代理写 review 记录 → 门禁应用补丁”的完整链路。现有证据是门禁单测与已有 writer/reviewer 各自 lane 的 host 测试，不能拼成完整闭环。
2. **不是自动合并**：reviewer 不会被自动启动，review 结果也不会回写 pi-subagents 的 `reviewed` 状态；0.79.0 要求父代理另外编排 reviewer。
3. **门禁可被绕过**：父代理若直接运行 `git apply` / `git merge`，脚本拦不住；本流程只约束按技能执行的父代理。
4. **只处理补丁应用**：不处理分支合并、commit、push、冲突解决、worktree 清理或外部 CLI runner。
5. **review 记录由父代理写入**：门禁校验记录与 tree，但不验证父代理没有伪造 reviewer 字段；reviewer 的实际工具使用仍依赖 host 运行证据。

## 复现

```bash
# 单测
node --test scripts/writer-gate.test.mjs

# 对一个 writer worktree 执行检查（不应用）
node scripts/writer-gate.mjs \
  --repo /path/to/source \
  --worktree /path/to/managed-worktree \
  --review /path/to/review.json \
  --check "npm test"

# 通过后应用补丁（需要合并授权）
node scripts/writer-gate.mjs ... --apply --receipt /path/to/gate-receipt.json
```

review 记录的最小形状：

```json
{
  "version": 1,
  "verdict": "pass",
  "baseCommit": "<40-64 hex>",
  "reviewedTree": "<40-64 hex>",
  "reviewer": { "runId": "<id>", "model": "<provider/id>", "tools": ["read", "grep", "find", "ls"] },
  "findings": [{ "severity": "non-blocking", "issue": "..." }]
}
```
