# P3 writer 委派与 review gate

状态：**父代理交接契约、机械门禁和端到端 host 流程均已实现并验证（fixture 模型）。** 写代码委派闭环不再停留在文档：真实 Pi 1.3.0 + pi-subagents 0.79.0 下跑通了 writer → reviewer → review 记录 → 门禁 → 应用补丁；限制见文末。

对应计划项：[移植计划](migration-plan.md#p3多代理与多模型) 的“先迁移一个多模型只读审阅流程，再迁移写代码的委派流程”和“交接明确目标、允许路径、禁止事项、已批准决定、验收证据和联系主代理的方法”。

## 已实现

### 1. 父代理交接契约

[poteto-mode 技能](../skills/poteto-mode/SKILL.md) 的 “Delegate a writer only through a review gate” 一节（来源：[适配模板](../adapters/pi/overrides/skills/poteto-mode/SKILL.md.template)）要求：

- 只在操作者授权且 pi-subagents 可用时委派；缺少集成时保持单代理。
- handoff 写明：目标、允许路径、禁止事项、已批准决定、验收命令、遇阻报告方式。
- writer 用 `worktree: true` 隔离，父代理 checkout 保持干净，同一 cwd 不放两个 writer。
- writer 完成后以 handoff 里的 patch 为准；managed worktree 通常已被清理。
- 独立 reviewer 只读审阅 patch；父代理逐条核实 findings。
- 冻结 patch sha256 与 base，写 review 记录，再过门禁；应用补丁需要单独授权。

该节明确写出边界：门禁是父代理侧约束，不是沙箱，也不能阻止父代理绕过脚本直接跑 Git。

### 2. 机械门禁

[scripts/writer-gate.mjs](../scripts/writer-gate.mjs) 支持两种输入：

- `--worktree <path>`：现场 managed worktree，用 `git write-tree` 冻结。
- `--patch <path>`：writer handoff 捕获的补丁，用 sha256 冻结。异步 writer 完成后 worktree 会被清理，这是正常路径。

应用前检查：

| 检查 | 失败码 |
| --- | --- |
| review JSON 结构、版本、verdict | `review-shape` / `review-version` / `review-verdict` |
| baseCommit 与 writer base 一致 | `stale-base` |
| `reviewedTree`（worktree 模式）或 `patchSha256`（patch 模式）未变化 | `stale-tree` / `stale-patch` |
| 没有 blocking finding | `review-blockers` |
| reviewer 只声明 `read/grep/find/ls` | `review-tools` |
| worktree 注册在该 repo 下 | `not-a-worktree` |
| 源仓库干净、HEAD 未移动 | `source-dirty` / `source-moved` |
| 补丁非空且能 `git apply --check` | `empty-patch` / `apply-check` |
| 可选验收命令通过（patch 模式在临时 worktree 中运行） | `check-failed` |

通过后：

- 默认只做检查，不改源仓库。
- `--apply` 才把审阅过的补丁应用到源 **工作树**；不 commit、不 push。
- `--receipt` 写出包含 base、patch sha256、review sha256 和检查结果的 JSON。
- 任一失败都不修改源工作树。

## 实际验证

### 门禁单测

```bash
node --test scripts/writer-gate.test.mjs
# 13 tests, 13 pass, 0 fail
```

覆盖：worktree 模式通过/apply、blocking、审阅后 tree 变化、reviewer 写工具、脏源、HEAD 移动、验收失败、空补丁、receipt；patch 模式通过/apply、patch 被篡改、临时 worktree 验收失败。

### 端到端 host 流程

```bash
PI_PSTACK_PI_ROOT=<Pi 1.3.0 包根> npm run check:p3:writer-flow
# 先跑正向：writer → reviewer → gate --apply，exit 0
# 再跑 P3_FLOW_BLOCK=1 反向：reviewer 返回 blocking，gate 拒绝，exit 0（断言拒绝成立）
```

实际结果（2026-10-19）：

| 项 | 正向 | 反向 |
| --- | --- | --- |
| writer 子代理 | `pstack.poteto-agent`，managed worktree，完成后 worktree 已移除 | 同左 |
| writer acceptance | `review-required` / `evidenceStatus: checked` | 同左 |
| writer patch | 从 handoff 读取，sha256 `d8ea1015…`，修改 `app.txt` | 同左 |
| reviewer 子代理 | `pstack.comment-sicko`，cwd=源仓库，声明工具恰为 `find/grep/ls/read` | 同左 |
| reviewer 结论 | `pass` + non-blocking | `block` + blocking |
| gate | `passed`，`applied: true`，源 `app.txt` 变 `PATCHED` | `rejected`，`review-verdict`，源保持 `ORIGINAL` |
| 源 HEAD | 未移动 | 未移动 |
| 完成通知 | 2 | 2 |

该流程验证了真实 host 下的子代理启动、worktree 捕获/清理、handoff patch、只读 reviewer、review 记录、门禁拒绝/应用；不验证外部真实模型的写作质量。

## 尚未实现 / 不能宣称

1. **不是自动审阅**：pi-subagents 0.79.0 要求父代理另行编排 reviewer；writer 的 `review-required` 状态不会被自动改写为 `reviewed`。
2. **不是自动合并**：门禁只应用补丁到源工作树；commit、push、分支合并、冲突解决、worktree 清理仍需单独授权。
3. **门禁可被绕过**：父代理直接跑 `git apply` / `git merge` 时脚本拦不住；流程只约束按技能执行的父代理。
4. **review 记录由父代理写入**：门禁校验 patch/base/工具声明，但不验证父代理没有伪造 reviewer 字段；reviewer 的实际行为仍依赖 host 运行证据。
5. **端到端用 fixture 模型**：没有用外部真实模型跑 writer；真实模型的行为质量不在该检查范围。
6. **没有 external CLI runner / 非原生 worktree（Worktrunk / Windows）路径。**

## 复现

```bash
# 门禁单测
node --test scripts/writer-gate.test.mjs

# 端到端 host（需要 PI_PSTACK_PI_ROOT）
PI_PSTACK_PI_ROOT=<Pi 1.3.0 包根> npm run check:p3:writer-flow

# 对 writer handoff patch 执行检查（不应用）
node scripts/writer-gate.mjs \
  --repo /path/to/source \
  --patch /path/to/handoff/worktree-diffs/.../task.patch \
  --review /path/to/review.json \
  --check "npm test"

# 通过后应用补丁（需要合并授权）
node scripts/writer-gate.mjs ... --apply --receipt /path/to/gate-receipt.json
```

review 记录的最小形状（patch 模式）：

```json
{
  "version": 1,
  "verdict": "pass",
  "baseCommit": "<40-64 hex>",
  "patchSha256": "<64 hex>",
  "reviewer": { "runId": "<id>", "model": "<provider/id>", "tools": ["read", "grep", "find", "ls"] },
  "findings": [{ "severity": "non-blocking", "issue": "..." }]
}
```

worktree 模式把 `patchSha256` 换成 `reviewedTree`。
