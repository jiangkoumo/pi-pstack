# 上游逐项审计清单

固定提交 f713f14203cd6420cec13cd7c55c32d598dbab68（pstack 0.15.25），57 个技能、23 份流程、2 个代理，共 82 项。已完整读取本批 82 个入口文件。机器记录 [port-map.json](port-map.json) 包含每项原路径、处理决定、阶段、具体文件目标、理由及原文 Markdown 相对链接。

## 判据与证据边界

- ported：已适配，验证强度按理由记录。8 个原则和 tdd 通过资源检查并在流程中按需读取，没有各自独立的模型行为评测。
- substitute：必要子集已有替代或已决定路线，完整入口待相应阶段实现。
- deferred：本批不实现；已审阅入口依赖与归属，不代表兼容或运行验收。

对 how/why、arena、控制驱动、create-skill、Task、固定模型、会话路径、自动提交与外部写操作分别核对。没有把无关键词命中等同于没有依赖。高级流程所需的未移植入口通过主技能中必要步骤替代；原引用记录保留作后续阶段的审计线索。本阶段不承诺 deferred 技能的全部支持材料已适配或运行。

汇总：ported 14，substitute 6，deferred 62（P3 10，P5 52）。

## 已适配（P1）

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 技能 correct | P1 | 已适配；见 validation-p1.md 的实际审阅历史案例与合成历史回归，主会话执行 |
| 技能 poteto-mode | P1 | 已适配；见 validation-p1.md 两次真实新会话调用及手工功能样例 |
| 技能 principle-boundary-discipline | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-encode-lessons-in-structure | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-fix-root-causes | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-laziness-protocol | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-model-the-domain | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-prove-it-works | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-sequence-verifiable-units | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 principle-test-behavior-not-implementation | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 技能 tdd | P1 | 已适配并经过加载/链接/来源检查；流程内按需读取，不代表该叶子独立行为评测 |
| 流程 bug-fix | P1 | 已适配；见 validation-p1.md 的对应流程样例（手工执行），调查与修复另有新会话观察 |
| 流程 feature | P1 | 已适配；见 validation-p1.md 的对应流程样例（手工执行），调查与修复另有新会话观察 |
| 流程 investigation | P1 | 已适配；见 validation-p1.md 的对应流程样例（手工执行），调查与修复另有新会话观察 |

## 已决定替代路线

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 技能 create-verification-skill | P5 | 采用自编 Pi 作者流程；本轮由 prove-it-works 的脚本化检查替代 |
| 技能 how | P3 | investigation 流程已内嵌 how 的输出结构；完整版依赖子代理 |
| 技能 maintain-verification-skill | P5 | 采用自编 Pi 作者流程；依赖并行源码读取 |
| 技能 poteto-help | P5 | poteto-mode 路由表取代本批入口；完整技能索引随其余技能落地 |
| 技能 setup-pstack | P2 | 改用独立 JSON 配置与 Pi 实际模型列表，不沿用 .mdc |
| 技能 show-me-your-work | P5 | principle-prove-it-works 现保留本地证据记录；TSV 决策轨迹依赖会话 transcript |

## P3 延期

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 技能 architect | P3 | 通过 how/why 建立上下文，再用 arena 比较设计草图；模型来自 .mdc，需 P2/P3 适配 |
| 技能 arena | P3 | Task 并行候选、跨模型盲评与 worktree 写入隔离；依赖角色模型配置，归入 P3 |
| 技能 interrogate | P3 | 依赖多代理或多模型运行；本批以流程内嵌步骤替代其必要部分 |
| 技能 no-comments | P3 | 依赖多代理或多模型运行；本批以流程内嵌步骤替代其必要部分 |
| 技能 recall | P3 | 依赖会话历史重建与 MCP 记录 |
| 技能 reflect | P3 | 依赖多代理或多模型运行；本批以流程内嵌步骤替代其必要部分 |
| 技能 swarm | P3 | 依赖多代理或多模型运行；本批以流程内嵌步骤替代其必要部分 |
| 技能 why | P3 | 依赖多代理或多模型运行；本批以流程内嵌步骤替代其必要部分 |
| 代理 comment-sicko | P3 | 代理定义需 pi-subagents 接线与只读工具白名单 |
| 代理 poteto-agent | P3 | 代理需 pi-subagents 接线；原文使用 is_background 与 ~/.cursor/plugins 发现主技能，不携带模型配置 |

## P5 延期

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| Benny 技能 reproduce-and-fix-issues | P5 | Benny／Slack／Linear 自动化集成，初版不宣称支持 |
| Benny 技能 setup-benny | P5 | Benny／Slack／Linear 自动化集成，初版不宣称支持 |
| Benny 技能 triage-issue-reports | P5 | Benny／Slack／Linear 自动化集成，初版不宣称支持 |
| 技能 automate-me | P5 | 依赖 Cursor 会话 transcript 或云代理上下文，须先做 Pi 会话适配 |
| 技能 benchmark-checklist | P5 | 测量方法可复用；nproc/pidstat/strace 属平台工具，PR 输出依赖 Opening a PR，需能力路由 |
| 技能 blast-radius | P5 | 依赖 how/why、unslop 与大范围任务的 arena；不能当成无依赖文本直接导入 |
| 技能 bro | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 figure-it-out | P5 | 为大型跨切面工作设计专用 playbook，依赖编排与 PR 流程 |
| 技能 in-your-own-words | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 ketchup | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 make-bot-ui | P5 | 依赖 Cursor 云端 Bot 与 api2.cursor.sh webhook，初版不宣称支持 |
| 技能 principle-attack-the-premise | P5 | 引用 build-the-lever、fix-root-causes、laziness、redesign；需一起迁移引用闭包 |
| 技能 principle-build-the-lever | P5 | 引用 laziness/encode-lessons/prove-it-works；自动提交及脚本编辑方式需服从操作者规则 |
| 技能 principle-exhaust-the-design-space | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-experience-first | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-explain-the-number | P5 | 性能测量依赖 benchmark-checklist，另引用 prove-it-works；需验证计量与回放 |
| 技能 principle-foundational-thinking | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-guard-the-context-window | P5 | 描述默认把大输出交给子代理；Pi 中需按委派授权改写并支持 codemode 汇总 |
| 技能 principle-make-operations-idempotent | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-migrate-callers-then-delete-legacy-apis | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-minimize-reader-load | P5 | 引用 guard-the-context-window；方法可移植，引用与委派授权需改写 |
| 技能 principle-never-block-on-the-human | P5 | 与 Pi 授权规则冲突，自动继续语义必须按用户规则改写后才可移植 |
| 技能 principle-outcome-oriented-execution | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-redesign-from-first-principles | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-separate-before-serializing-shared-state | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-subtract-before-you-add | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 principle-type-system-discipline | P5 | 引用 typescript-best-practices、boundary-discipline、encode-lessons；需核对引用闭包 |
| 技能 sharpen | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 teach | P5 | 依赖 how、why、unslop，并要求生成图像；需保留只读授权及可用图像工具路由 |
| 技能 technical-writing | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 typescript-best-practices | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 技能 unslop | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 流程 authoring-a-skill | P5 | 采用自编 Pi 作者流程（接入决策已定路线），随该流程实现批次落地 |
| 流程 autonomous-run | P5 | 依赖长时间自主续跑、停止谓词与 /loop 语义 |
| 流程 autopilot-full | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 autopilot-stack | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 babysit | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 eval | P5 | 依赖 Cursor 会话 transcript 或云代理上下文，须先做 Pi 会话适配 |
| 流程 hillclimb | P5 | 依赖长时间自主续跑、停止谓词与 /loop 语义 |
| 流程 multi-phase-plan | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 opening-a-pr | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 orchestrate | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 pause-safely | P5 | 自动取消子代理并创建 wip 提交；Pi 中需保留当前授权，恢复笔记适配会话路径 |
| 流程 perf-issue | P5 | 依赖 how、architect、benchmark-checklist、控制驱动、固定模型委派与 PR；未要求 /loop |
| 流程 prototype | P5 | 自包含方法文本，不含 Cursor 私有机理，可在后续批次直接适配 |
| 流程 refactoring | P5 | 依赖 how、architect、多个原则、固定模型委派及自动 rebase/PR；结构等价验证方法可复用 |
| 流程 runtime-forensics | P5 | 依赖实时控制驱动、诊断采样与子代理归约；诊断任务中的运行时注入需明确范围 |
| 流程 session-pickup | P5 | 依赖 Cursor 会话 transcript 或云代理上下文，须先做 Pi 会话适配 |
| 流程 shipping | P5 | 包含 PR、合并、推送等外部写操作，需先按授权边界改写 |
| 流程 trace-forensics | P5 | 解析器与 sqlite 为方法依赖；大文件默认交子代理，须改写委派授权与文件读取路由 |
| 流程 visual-parity | P5 | 依赖长时间自主续跑、停止谓词与 /loop 语义 |
| 流程 worktree-cleanup | P5 | 依赖模拟器或沙箱清理，须先移除 Cursor 扫描路径 |

## 后续约束

只有 ported 的文件由本包资源清单导出。substitute 与 deferred 仍需对应阶段的实现及行为验收。审计归属不等于全量复刻。
