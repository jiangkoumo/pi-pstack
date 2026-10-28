# pstack 0.15.34 通用修复：Task A 审计与验收

## 已完成

本次仅同步任务说明指定的通用修复并审计 Pi 工具实现，不代表全包上游基线升级。上游行为、issue 编号及提交 SHA 来自本次任务提供的完整说明；未调用 `gh issue view`、GitHub API 或联网读取上游内容。本地固定来源仍以 [sources.md](sources.md) 为准，原有作者与 MIT 声明保持不变。

- reflect：在 [源模板](../adapters/pi/overrides/skills/reflect/SKILL.md.template) 第 5 节增加安装目录与缓存写保护。申请批准前展示持久化目标 `.pi/skills/<skill>/` 或 `~/.pi/agent/skills/<skill>/`，用户同时批准内容与位置后，复制整个技能目录再修改；已处于批准的持久化目录的技能可原地修改。禁止自动开 PR、push 或向远端提交。对应上游 #800，提交 `7054003c3723e82d099fb7620e3bc8d7d63eebc6`。
- swarm：在 [源模板](../adapters/pi/overrides/skills/swarm/SKILL.md.template) 将 Phase A 序号改为 1、2、3、4；Phase B 两处角色步骤引用均改为 step 3；Phase D 改为 “a result table”。对应上游 #807，提交 `e73df471cd4bd918367e99f3dd9c51bd53ddf5f0`。
- 运行生成器更新 [reflect](../skills/reflect/SKILL.md) 与 [swarm](../skills/swarm/SKILL.md)，146 个生成资源中仅写入这两份文件。
- 新增四个 fenced contract 解析用例及一个 deadline sleep 用例，均只增加测试，不修改工具生产实现。

## 工具修复适用性

任务标题将工具归为四项；其中 watch-pr 包含两项上游修复，以下逐项列出五个结论。

| 上游修复 | Pi 本地依据 | 结论与本次处理 |
| --- | --- | --- |
| #803 check-plan 多反引号行内代码 | [check-plan.mjs](../scripts/check-plan.mjs) 的 `parsePlan` 提取唯一顶层 `pstack-plan` fenced block 后执行 `JSON.parse`；`validatePlan` 校验 JSON 字段、依赖与证据，不扫描 prose 标点或解析行内代码 | 上游行内代码匹配补丁不适用；补充本地 fence 解析验证，生产代码无需修改 |
| #802 watch-pr sleep 截止保护 | [watch-pr.mjs](../scripts/watch-pr.mjs) 的 `main` 计算 `remaining = timeout * 1000 - elapsed`，先处理 `remaining <= 0`，再 `await sleep(Math.min(options.interval * 1000, remaining))` | 已具备等效保护；增加 interval 大于 timeout 的确定性回归测试 |
| #801 watch-pr Fork 同名分支 | 同文件 `resolvePrNumber`、`fetchSnapshot`、`normalize` 与主循环均围绕单个 PR 的快照及轮询；没有 `orderStack` 或多 PR head/base 拓扑排序 | 当前不适用；不能据此宣称支持 Fork 堆栈排序。将来增加堆栈能力时须区分仓库身份与分支名 |
| #804 orch 优先活跃 PR | [orch.mjs](../scripts/orch.mjs) 的 `loadPlan` 读取本地 JSON plan contract，`storePath`/`readStore` 读取 `units.json`；`effectiveUnits`/`computeProgress` 根据本地状态与 `dependsOn` 计算下一批任务 | 不从远程分支反查 PR，历史关闭/合并 PR 的选择问题不适用。`publishCommands` 可在显式执行时 push、创建 PR 或评论，但这不是远程 PR 发现/筛选功能；本次未执行发布 |
| #805 worktree-audit GNU stat/date | [worktree-audit.mjs](../scripts/worktree-audit.mjs) 使用 Node.js `existsSync`、`git worktree list --porcelain`；提交日期取自 `git log --format=%cI`，不执行 shell `stat -f` 或 `date -r` | GNU/BSD stat/date 参数差异不适用。该脚本实际未使用任务说明中提及的 `statSync`；可选 `--size` 仍调用 `du -sk`，因此不把它描述成完全无外部命令依赖的实现 |

### check-plan 解析证据

[scripts/check-plan.test.mjs](../scripts/check-plan.test.mjs) 原有测试已覆盖三反引号/三波浪线 contract、四反引号包裹的嵌套示例、HTML 注释、重复 contract、未闭合 fence 与非法 JSON。本次对反引号和波浪线分别新增：

- 四字符开启、五字符关闭可解析；JSON goal 中包含双反引号包裹且内嵌反引号的文本及标点，结构校验仍通过。
- 关闭 fence 比开启 fence 短，或使用另一种字符，均报未闭合。
- 五字符示例 fence 中的较短 fence、异类 fence 与嵌套 contract 不会暴露为顶层 plan；其后的真实顶层 contract 可以正常解析。

这验证的是 Pi contract 的 fenced block 边界，不是实现上游 prose 标点检查器。

### watch-pr deadline 证据

[scripts/watch-pr.test.mjs](../scripts/watch-pr.test.mjs) 使用现有本地 gh shim 和 `main` 的 `now`/`sleep` 注入接口，执行 `--interval 30 --timeout 1`。首轮快照模拟消耗 250ms，断言唯一一次请求的 sleep 为 750ms，虚拟时钟恰好到达 1000ms；下一轮报告 `WAITING`、`timedOut: true`、`timeout` reason，返回码 1，shim 被调用两次。测试未访问真实 GitHub。

保护范围是请求的 sleep 时长。当前循环到期后仍会获取下一次快照，且同步 gh 子进程没有单独的剩余时限；本次不将它描述为整个进程严格在 timeout 内退出的保证。

## 验证结果

以下命令均在当前独立 worktree 根目录实际执行。

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `npm ci` | 0 | 按锁文件安装 123 个包；package.json 与 package-lock.json 无改动 |
| `npm test`（修改前完整基线） | 0 | 检查运行器 38/38 通过，失败 0 |
| `node scripts/generate-pi-resources.mjs` | 0 | generated 146，written 2 |
| `node --test scripts/check-plan.test.mjs scripts/watch-pr.test.mjs` | 0 | 31 tests，31 pass，0 fail，0 skipped |
| `npm test`（修改后） | 0 | 检查运行器 38/38 通过，失败 0，超时 0；完整输出中 TAP 汇总共 546 tests、441 pass、0 fail、105 skipped、0 cancelled |
| `node scripts/generate-pi-resources.mjs --check` | 0 | checked 146，unmanaged 0，无生成漂移 |
| `npm run check:fidelity` | 0 | 114 files；kept 4467 / upstream 4752 = 94.00252525252525%，errors 为空 |
| `git diff --check` | 0 | 无空白错误；最终 diff 另核对无冲突标记、无范围外文件 |

首次 `npm test` 因依赖尚未安装而返回 1（缺少 `jiti`）；安装后一次基线执行触及工具的 60 秒调用时限，不算通过。延长调用时限后取得上表完整基线与最终结果。保真度首次执行触及 20 秒调用时限，延长后取得退出码 0 的完整结果。保真度命令会重写 `docs/fidelity.md`，执行后仅恢复该命令产生的报告内容，未将此范围外文件纳入提交。

## 未完成与具体阻碍

- 本次所要求的同步、适用性审计与本地检查均已完成，无任务范围内阻碍。
- 全量测试有 105 个显式跳过，主要涉及未配置的 TLC 1.8.0、Java/工具环境及 Pele/resvg PNG 依赖，具体原因由原测试输出记录；未把跳过计为通过。
- reflect/swarm 的本次变化是技能说明修订，验收为源模板、生成一致性、链接与流程引用检查；未启动新的模型会话验证实际遵循复制/批准流程，也未运行真实 swarm。
- 未实现 prose 标点扫描、多 PR Fork 堆栈排序或远程分支 PR 发现；这些与当前 Pi 工具架构不同，属于不适用项，并非遗漏修复。
