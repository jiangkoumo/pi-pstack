# P3 多代理与多模型接入验收

P3 多模型只读审阅流程、前后台只读隔离与并发 writer 工作树隔离已全量通过并完成实证验收；26 条 live 审阅意见已逐条核实，见 [核实记录](validation-p3-live-findings.md)。写代码委派的父代理交接契约、机械 review gate 与端到端 host 流程（fixture 模型）均已实现并验证，见 [writer 验收](validation-p3-writer.md)；P4 打包安装推进中。代理生成与包清单声明已完成；直接单子任务的角色接线、前台真实 child 检查、后台真实 runner 隔离与 ambient 扩展防护、并发 writer 的 managed worktree 隔离，以及基于真实网关的双模型（DeepSeek v4.1 Flash 与 GLM-5.3 FlashX）wire 级只读审阅流程均已全部通过并固化。

此前“P3 全部完成、planner 等于运行期拒写、多轮同模型 review 等于多模型验收、最后一轮 review 覆盖后续修改”的声明均已撤回。上一轮 review `fba6b9a4` 只覆盖当时版本，不覆盖其后增加的角色函数和完成状态。

## 验收子 Lane 与独立文档

本次 P3 验证拆分为多个相互隔离的验收 lane，各项具有可复现脚本与独立文档：

| 验证项 | 独立文档 | 检查脚本 | 状态 | 关键依据 |
| --- | --- | --- | --- | --- |
| 代理生成与清单 | [P3 验收](validation-p3.md) | `../scripts/check-p3-agents.mjs` | 通过 | `pi.subagents.agents` 导出两个代理，`package: pstack`，工具 allowlist 准确 |
| 前台只读与角色接线 | [P3 验收](validation-p3.md) | `../scripts/check-p3-host.mjs` | 通过 | 真实 Pi 1.3.0 + pi-subagents 0.79.0；9 次写操作被拒；角色与 thinking 准确分发 |
| 后台隔离与 ambient 防护 | [后台验收](validation-p3-background.md) | `../scripts/check-p3-background.mjs` | 通过 | 真实 detached runner 进程；普通/忽略/未跟踪文件 12 次写入全拒；`extensions: []` 阻止 ambient 扩展；超时/取消/红例通过 |
| 并发 writer 与 worktree | [工作树验收](validation-p3-worktrees.md) | `../scripts/check-p3-worktrees.mjs` | 通过 | 两个并发 writer 在 managed worktrees 互不干扰；同 cwd 证明宿主不自动互斥（单 writer 属父调度纪律）；review-required 状态记录 |
| writer 交接与 review gate | [Writer 验收](validation-p3-writer.md) | `../scripts/writer-gate.test.mjs` / `../scripts/check-p3-writer-flow.mjs` | 通过（单测 + host 端到端） | 13 项门禁测试通过；真实 host 下 writer→reviewer→review 记录→gate，正向应用、反向拒绝均通过 |
| 双模型 live 审阅流程 | [Live 审阅验收](validation-p3-live.md) / [意见核实](validation-p3-live-findings.md) | `../scripts/check-p3-live-review.mjs` | 通过（重跑闭环 + 意见核实） | dry-run/self-test 通过；剥离临时 catalog 模型级 endpoint 确保 100% 录制；DeepSeek v4.1 与 GLM-5.3 各完成一次审阅；26 条意见逐条核实（1 处接受修改），exit 0 |

## 上游与项目适配

上游 comment-sicko frontmatter 只有 name/description；poteto-agent 另有 is_background。package、tools、excludeTools、extensions、systemPromptMode、inherit*、async、acceptanceRole、license 是项目适配，不是上游提供的安全或模型配置。

comment-sicko 保持 `read, grep, find, ls` 四工具 allowlist，空 extensions 禁用后台 ambient 扩展；acceptanceRole 只是验收标识。真实 host 测试发现 pi-subagents 0.79.0 默认桥接会额外注入 contact_supervisor，因此新增公开字段 `excludeTools: contact_supervisor`，并通过生成器与实际 child 工具声明双重检查。

comment-sicko 的 async: true 是项目统一后台化选择，上游没有该字段。两个代理正文都采用“遇阻停止，在最终返回中报告，由原生完成通知交回父会话”的交接方法，不要求中途问答。writer 未显式增加 contact_supervisor，但宿主默认桥接可能自动提供它；这不等于项目承诺了中途协调流程。

writer 不声明 extensions 字段，以保留宿主默认。只读代理空 extensions 会触发 pi-subagents 提示，并可能阻断需要环境 provider 扩展的模型；本次模型来自 fixture models.json，不证明所有扩展 provider 可用于只读代理。

## 角色接线契约

`extensions/pstack/index.ts` 在公开 tool_call 事件中处理直接 `subagent({agent: 'pstack.comment-sicko' | 'pstack.poteto-agent', ...})`。配置每次从当前父会话 user/project pstack.json 读取，仅受信任项目允许覆盖。无需打开 poteto-mode；接线不产生委派授权。

- comment-sicko 对应 review，poteto-agent 对应 code。
- 角色未配置：不传 model，遵守 pi-subagents 用户设置与父模型默认。
- 显式 inherit：解析父会话当前模型精确 provider/id；不能解析时报错。
- thinking：按最终模型支持层级校验，编码为 provider/id:thinking，不能丢弃。
- 显式单次 model 优先于保存的角色偏好，同样要求精确匹配与 thinking 校验。
- 配置错误在 tool_call 返回 block，child 不启动，不选择备用模型。

这是一条直接工具调用接线。脚本 workflow、tasks/chain 并行与链式调用、slash /run、公共 delegation 事件、别名调用与保留会话 resume 尚未接入；不宣称它们自动消费 pstack.json。prose/verification 保留为 P2 偏好数据，目前没有对应包代理接线。操作者通过 pi-subagents 覆盖代理工具/提示的行为不属于包模板权限保证。

## 实际验证层次

`check:p3:agents` 是内部模块发现探针，仅测 package scope；该 scope 不合并 user/project agent，不能据此证明 both scope 或本机 ambient 配置全隔离。按包根路径断言恰好两个本包代理，额外第三方代理不计入本包集合。

`check:p3:gate` 是 resolvePiLaunchToolPlan 与 mock catalog 的纯函数检查，没有启动 child。已移除函数不读取的 activeTools 参数，输出明确标注验证层次。

`check:p3:host` 复用 P2 的 createAgentSession、DefaultResourceLoader、ModelRuntime 和本地 OpenAI-compatible SSE fixture。它实际 npm pack，将 tarball 解到临时消费项目 .pi/npm/node_modules/pi-pstack，通过临时 settings 注册包，加载真实 Pi 1.3.0 与 pi-subagents 0.79.0，父会话调用真实 subagent 工具创建前台 child 会话。前台 child 可由宿主进程内 SDK 执行，本测试不宣称启动后台 OS 子进程。

本次实际执行 `PI_PSTACK_PI_ROOT=<本机 Pi 1.3.0 包根> npm run check:p3:host`，退出码 0，断言通过：

- 调用参数不传 model，保存的 review 角色令 child 实际请求 fixture/review，reasoning_effort=high。
- 实际 child provider 请求只声明 find/grep/ls/read。fixture 强制发出 9 次 write/edit/bash 调用，全部返回工具不存在错误，普通暂存文件、gitignored 文件和未跟踪文件内容均保持 ORIGINAL。bash 探针仅为 exit 77；文件写入尝试使用 write/edit。
- inherit + low 实际请求父模型 fixture/parent，thinking 保留；角色未配置时使用父模型默认。
- 项目未信任时忽略项目角色，信任后项目 inherit/low 覆盖用户 review/high。
- 不可用 fixture/missing 在 launch 前拦截，未产生 child 请求。
- child provider 400 错误返回父会话，没有换模型重试。
- child 请求超时返回 timeout；父会话 abort 中止等待的 child 并返回取消/中断结果。

本测试使用本地确定性 provider，没有外部付费推理或生产数据；不能证明外部模型遵循技能、消费项目完整安装/升级/卸载、后台 ambient 扩展注入抵御、恶意 project agent override、child 进程崩溃、单 writer 互斥或 worktree 并发隔离。

## 检查入口与历史证据

通用 `npm run check` 保持核心技能不强依赖 pi-subagents；缺模块时模块探针明确输出 skipped，不能当成 P3 passed。严格 `npm run check:p3` 串联 P2 单测、模块发现、planner 与真实 host，缺宿主或依赖直接失败。模块内部导入只用于版本诊断，不是发布运行时代码依赖。

历史真实模型 run `b0493a78` 使用父会话显式指定 magpie/opendesign/deepseek-v4.1-flash，属于合成注释样例审查。它不证明角色配置生效，也没有对抗写入尝试。此前多轮同模型 review 只能称多轮独立审阅，不能称不同模型流程验收。本次实现已由指定模型 magpie/opendesign/deepseek-v4.1-flash 在 fresh context 中只读复审（run b2cf3e20-bfc2-46de-8b37-3387b5c0578d），结论 OK with notes。复审确认角色调用路径、thinking 后缀、真实前台 child 拒写与完成状态降级；指出 README 多模型验收描述过度，以及取消/阶段措辞、tasks/chain 未接入说明、writer 参数接线覆盖和 planner 断言精度问题。父代理据此做文档及断言的小范围修正；该 review 不代表完整 P3 或多模型流程通过。writer 本轮只补 applySubagentRole 单测，未增加完整 writer host 流程验收。

本次修复后实际运行（均退出码 0）：

- `npm run check`：25 项生成器测试与 13 项 writer gate 测试通过，82 项映射、17 份指纹、118 处链接，模块探针实际 passed 而非 skipped。
- `PI_PSTACK_PI_ROOT=<本机 Pi 1.3.0 包根> npm run check:p3`：4 项配置/模型单测、发现与 planner 探针、真实前台 child 验收、后台 detached runner 与 ambient 隔离验收、managed worktree 并发隔离验收全部通过（注入 writer gate 与 writer flow 后耗时约 60 秒）。
- `PI_PSTACK_PI_ROOT=<同上> node scripts/check-p3-background.mjs`：真实后台 detached runner、5 场景全通、12 次写尝试全拒、红例与超时取消通过。
- `PI_PSTACK_PI_ROOT=<同上> node scripts/check-p3-worktrees.mjs`：两个并发 writer 在 managed worktrees 互不影响、同 cwd 竞争验证、review-required 状态验证通过。
- `node scripts/check-p3-live-review.mjs --dry-run`：两轮不同模型规划与范围验证通过。
- `PI_PSTACK_PI_ROOT=<同上> node scripts/check-p3-live-review.mjs --self-test --out <tmp>`：确定性本地 stub 走通双轮审阅流程，会话日志完备，临时目录已清理。
- `PI_PSTACK_PI_ROOT=<同上> node scripts/check-p3-live-review.mjs --out scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model`：真实双模型（DeepSeek v4.1 Flash 与 GLM-5.3 FlashX）审阅实测通过，退出码 0，两轮 wireCapture 均为 recorded，请求 100% 走录制代理。
- 26 条结构化意见逐条核实（2026-10-19）：1 处 `runtime.mjs` 纯注释接受并删除，8 处 gate 注释保留，16 条合成对照只核实不修改；Round A 有 5 条对照引用行号偏移 +2。见 [核实记录](validation-p3-live-findings.md)。
- `npm run check:correct:history`：实际 npm tarball 109 个文件、109 处发布链接、32 个重建输入，历史遗漏与模板漏包坏例被拒绝。
- `PI_PSTACK_PI_ROOT=<同上> npm run check:p2:host`：18 个本地 provider 请求，5 个预期命令错误，模式生命周期回归通过。
- `git diff --check`：无空白错误。
- `node --test scripts/writer-gate.test.mjs`：13 项门禁测试通过（worktree 与 patch 两种模式；正常检查、apply、blocking、stale tree/patch、写工具、脏源、HEAD 移动、验收失败、空补丁、receipt）。
- `PI_PSTACK_PI_ROOT=<同上> npm run check:p3:writer-flow`：正向 writer→reviewer→gate 应用补丁，反向 blocking review 被 gate 拒绝；两轮退出码 0，源 HEAD 未移动，writer worktree 已清理，reviewer 声明工具恰为 `find/grep/ls/read`。见 [Writer 验收](validation-p3-writer.md)。
- 2026-10-19 核实后复跑：`npm run check` 通过；`PI_PSTACK_PI_ROOT=<同上> npm_config_cache=<临时目录> npm run check:p3` 退出码 0。默认 npm cache 在本机报 EPERM（`~/.npm/_cacache` 未发现 root 文件），改用临时 cache 可复现；记为环境问题，不是包失败。
- 2026-10-19 writer flow 接入后：`npm run check` 与 `npm run check:p3` 均退出码 0（check 含 13 项 writer gate 单测，check:p3 含正反向 writer flow）。

## 尚未完成

- 真实外部模型跑 writer 的行为质量（端到端目前使用 fixture 模型；只读审阅已有真实模型证据）。
- external CLI runner / 非原生 worktree（如 Worktrunk / Windows）支持。
- P4 剩余项：npm 发布授权；本地打包/安装/升级/卸载与 GitHub Actions 已通过，见 [P4 验收](validation-p4.md)。

上述未完成项继续在 migration-plan 中保持未勾选；不以当前测试结果虚构完整闭环。
