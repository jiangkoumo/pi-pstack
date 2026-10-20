# P3 live 审阅意见逐条核实

状态：**26 条已逐条核实（2026-10-19）。** 本文件补上 [Live 审阅验收](validation-p3-live.md) 第 6 节留给主代理的部分：意见内容是否成立、引用位置是否成立、是否值得修改。脚本的机械门槛结论不因本文件改变。

- 来源运行：`../scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model/`
- 原始报告：[round-A.md](../scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model/round-A.md)、[round-B.md](../scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model/round-B.md)
- 结构化结果：`round-A.json`、`round-B.json` 的 `structured.findings`
- 核实对象：Round A 20 条（9 条真实项目 + 11 条合成对照），Round B 6 条（1 条真实项目 + 5 条合成对照），合计 26 条

## 方法

1. 逐条读取报告中的 `file:line` 与摘要。
2. 用当前工作树核对引用位置：真实项目文件用 `nl -ba` 定位；合成对照逐行比对。
3. 判断意见内容是否成立（描述与代码是否一致），再判断是否应当修改。
4. 合成对照文件是测试种子，**只核实、不修改**；真实项目文件按“是否改变可读性且不影响行为”决定。
5. 核实后删除的注释只涉及 `extensions/pstack/runtime.mjs` 一行；改后运行 `npm run check` 与 `npm run check:p3` 回归。

## 结论

| 类别 | 数量 | 处理 |
| --- | --- | --- |
| 真实项目意见 | 10（去重后 9 个位置） | 1 处接受并修改；8 处保留 |
| 合成对照意见 | 16 | 内容成立，全部保留（fixture 种子不可修改） |
| 引用位置错误 | 5 | 均属 Round A 的对照意见，行号整体偏移 +2 |
| 合计 | 26（去重后 25 个位置） | — |

两条模型在 `extensions/pstack/runtime.mjs:87` 上判断一致，该注释已删除。Round A 对 `../scripts/check-p3-readonly-gate.mjs` 的 8 条注释意见没有被采纳：Round B 明确把该文件列为跳过，并说明这些是诊断探针的场景标签；删除会降低排错时可读性，且不改变任何行为或权限。该分歧记录在案，不以任一模型单独意见冒充结论。

## 逐条核实

`判定` 列：**接受**＝已按意见修改；**保留**＝内容成立但决定不改，附理由；**对照**＝内容成立，属合成 fixture，不修改。

| # | 轮次 | 部分 | 引用（报告） | 意见摘要 | 核实结果 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A | 真实 | `extensions/pstack/runtime.mjs:87` | 注释复述显式模型覆盖与同一套校验，属旁白 | 行号与内容一致；函数体已表达该行为 | **接受**，删除该行 |
| 2 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:8` | “1. Isolate user configuration”编号横幅复述赋值 | 存在且确为编号横幅 | 保留：诊断脚本段标 |
| 3 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:41` | “2. Test tool plan…”复述后续断言 | 存在 | 保留：段标 |
| 4 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:42` | planner 边界说明与输出字段重复 | 存在；输出确有 `validationLayer` | 保留：边界说明 |
| 5 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:52` | 跨文件说明应结构化 | 存在 | 保留：指向真实 host 检查 |
| 6 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:57` | “3. Test tool plan…”段标 | 存在 | 保留：段标 |
| 7 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:67` | “4. Test role…”段标 | 存在 | 保留：段标 |
| 8 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:74` | “Test review role…”段标 | 存在 | 保留：段标 |
| 9 | A | 真实 | `../scripts/check-p3-readonly-gate.mjs:89` | “Test unavailable…”段标 | 存在 | 保留：段标 |
| 10 | A | 对照 | `comment-slop-sample.ts:1` | SYNTHETIC FIXTURE 横幅 | 存在 | 对照 |
| 11 | A | 对照 | `comment-slop-sample.ts:2` | 说明种子用途的元叙述 | 存在 | 对照 |
| 12 | A | 对照 | `comment-slop-sample.ts:3` | 同句续行 | 存在 | 对照 |
| 13 | A | 对照 | `comment-slop-sample.ts:4` | ASCII 分隔横幅 | 存在 | 对照 |
| 14 | A | 对照 | `comment-slop-sample.ts:5` | IMPORTANT / DO NOT REMOVE / too risky 横幅 | 存在 | 对照 |
| 15 | A | 对照 | `comment-slop-sample.ts:6` | 第二条分隔横幅 | 存在 | 对照 |
| 16 | A | 对照 | `comment-slop-sample.ts:11` | 复述函数返回值 | **实际在第 9 行**；内容成立 | 对照（引用偏差 +2） |
| 17 | A | 对照 | `comment-slop-sample.ts:12` | 注释掉的 corpse + rollback | **实际在第 10 行** | 对照（引用偏差 +2） |
| 18 | A | 对照 | `comment-slop-sample.ts:13` | `eslint-disable` 抑制 | **实际在第 11 行** | 对照（引用偏差 +2） |
| 19 | A | 对照 | `comment-slop-sample.ts:14` | 被抑制掩盖的 `console.log` | **实际在第 12 行** | 对照（引用偏差 +2） |
| 20 | A | 对照 | `comment-slop-sample.ts:15` | 无 issue 的 TODO | **实际在第 13 行** | 对照（引用偏差 +2） |
| 21 | B | 真实 | `extensions/pstack/runtime.mjs:87` | 与 A1 同一处：删除该旁白 | 同 A1，重复指出 | **接受**（与 A1 合并执行） |
| 22 | B | 对照 | `comment-slop-sample.ts:4` | 盒装横幅，scent 非 conviction | 存在 | 对照 |
| 23 | B | 对照 | `comment-slop-sample.ts:9` | 复述 `retryDelay` 返回值 | 存在 | 对照 |
| 24 | B | 对照 | `comment-slop-sample.ts:10` | `legacyDelay` corpse | 存在 | 对照 |
| 25 | B | 对照 | `comment-slop-sample.ts:11` | `no-console` 抑制，真正问题在第 12 行 | 存在，第 12 行为 `console.log` | 对照 |
| 26 | B | 对照 | `comment-slop-sample.ts:13` | 悬空 TODO | 存在 | 对照 |

## 代码改动与回归

- 删除 `extensions/pstack/runtime.mjs:87` 的注释；`applySubagentRole` 的函数体与行为未变。
- 受审文件在审阅时保持原样（脚本断言 sha256 前后一致）；本次删注释发生在审阅之后，不改变该次运行的只读结论。
- 改后回归（2026-10-19）：`npm run check` 25 项通过；`npm run check:p3` 退出码 0（本机默认 npm cache 报 EPERM，使用临时 `npm_config_cache` 复现）。结果同步记录在 [P3 验收](validation-p3.md)。

## 限制

- 本核实是人工判断，不是第二次模型审阅；不把“已核实”扩大为“所有意见都正确”。
- Round B 对真实项目只给出 1 条意见，且与 Round A 重合；不能据此认为 `check-p3-readonly-gate.mjs` 没有其他问题。
- 合成对照只证明 reviewer 读到了给定文件；对照意见不进入项目修改范围。
