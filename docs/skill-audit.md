# 上游逐项审计清单

固定提交 f713f14203cd6420cec13cd7c55c32d598dbab68（pstack 0.15.25），57 个技能、23 份流程、2 个代理，共 82 项。已完整读取本批 82 个入口文件。机器记录 [port-map.json](port-map.json) 包含每项原路径、处理决定、阶段、具体文件目标、理由及原文 Markdown 相对链接。

## 判据与证据边界

- ported：已适配，验证强度按理由记录。8 个原则和 tdd 通过资源检查并在流程中按需读取，没有各自独立的模型行为评测。
- substitute：必要子集已有替代或已决定路线，完整入口待相应阶段实现。
- deferred：本批不实现；已审阅入口依赖与归属，不代表兼容或运行验收。

对 how/why、arena、控制驱动、create-skill、Task、固定模型、会话路径、自动提交与外部写操作分别核对。没有把无关键词命中等同于没有依赖。高级流程所需的未移植入口通过主技能中必要步骤替代；原引用记录保留作后续阶段的审计线索。本阶段不承诺 deferred 技能的全部支持材料已适配或运行。

汇总：ported 61，substitute 21，deferred 0。

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
| 技能 setup-pstack | P2 | P2 已用 /setup-pstack 扩展命令替代：独立 JSON、实际模型目录与 thinking 校验，不沿用 .mdc；见 validation-p2.md |
| 技能 show-me-your-work | P5 | principle-prove-it-works 现保留本地证据记录；TSV 决策轨迹依赖会话 transcript |
| Benny 技能 reproduce-and-fix-issues | P5 | Cursor Benny/Slack/Linear 自动化不在 Pi 范围；本地替代为 Bug fix + 手动 issue 复现 |
| Benny 技能 setup-benny | P5 | Cursor Benny 安装与 Slack/Linear 配置不在 Pi 范围；本地替代为项目 AGENTS.md 与显式环境配置 |
| Benny 技能 triage-issue-reports | P5 | Cursor Benny 报告分流不在 Pi 范围；本地替代为 Investigation + 手动 issue 分类 |
| 技能 automate-me | P5 | 依赖 Cursor 会话 transcript/自动化；本地替代为显式 /loop + 本地证据目录 |
| 技能 benchmark-checklist | P5 | 平台工具与 PR 输出未统一；本地替代为 hillclimb/perf-issue 模板内联检查清单 |
| 技能 blast-radius | P5 | 依赖 how/why/arena/unslop 与大范围编排；本地替代为 investigation + 显式范围与依赖清单 |
| 技能 figure-it-out | P5 | 依赖编排与 PR 流程；本地替代为 multi-phase-plan/feature 的显式计划 |
| 技能 make-bot-ui | P5 | 依赖 Cursor 云端 Bot 与 api2.cursor.sh webhook；本地替代为 feature + 操作者浏览器驱动 |
| 技能 recall | P3 | 依赖会话历史与 MCP 记录；本地替代为 session-pickup 读取当前 Pi 会话 |
| 技能 teach | P5 | 依赖 how/why/unslop 与图像生成；本地替代为 investigation + 操作者图像工具 |
| 流程 authoring-a-skill | P5 | Cursor 内置作者流程不可导入；本地替代为 Pi skills 文档与手工 SKILL.md 流程 |
| 流程 eval | P5 | 依赖 Cursor transcript/云上下文；本地替代为直接测试 harness 与 benchmark-checklist 内联检查 |
| 流程 runtime-forensics | P5 | 依赖实时控制驱动与诊断采样；本地替代为操作者调试器 + 有界 subagent 归约 |
| 流程 trace-forensics | P5 | 依赖解析器与 sqlite；本地替代为本地脚本 + 大文件只读子代理 |
| 流程 visual-parity | P5 | 无通用视觉驱动与 baseline gate；本地替代为操作者截图/图像 diff harness + 有界 loop |

## 已适配代理（P3）

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 代理 comment-sicko | P3 | 已适配；通过适配层生成只读定义，严格限定工具白名单，见 validation-p3.md |
| 代理 poteto-agent | P3 | 已适配；通过适配层生成代码编写代理定义，适配包清单发现与单一 writer 约束，见 validation-p3.md |

## 已适配流程（P5）

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 流程 pause-safely | P5 | 已适配为 Pi 本地暂停契约：显式暂停、按 run id 停止子代理、补丁与恢复笔记；未授权不提交或推送 |
| 流程 autonomous-run | P5 | 已适配为 Pi `/loop run` 有界自治流程：先定停止谓词，迭代结果写本地证据，未授权不提交或推送 |
| 流程 prototype | P5 | 已适配为 Pi 一次性原型流程：隔离 scratch 目录、真实表面验证、默认不提交或推送 |
| 流程 session-pickup | P5 | 已适配为 Pi 会话恢复流程：仅当前会话或操作者提供的会话文件，不扫描 Cursor transcript |
| 流程 worktree-cleanup | P5 | 已适配为 Pi 受管清理流程：先审计与确认，删除需逐项授权，不清理活动或脏 worktree |
| 流程 hillclimb | P5 | 已适配为 Pi 有界测量循环：绑定 /loop run 预算、冻结 harness 与本地决策证据，默认不提交或推送 |
| 流程 autopilot-full | P5 | 已适配为 Pi PR 队列协调流程：单人 owner、受管 worktree、独立核实与显式落地授权，默认不自动合并 |
| 流程 autopilot-stack | P5 | 已适配为 Pi 栈式 PR 交付流程：根代理独占拓扑、operator 落地、默认不自动合并 |
| 流程 babysit | P5 | 已适配为 Pi PR 监视流程：模式声明、单 frontier、有界 /loop 轮询、显式推送/合并授权 |
| 流程 multi-phase-plan | P5 | 已适配为 Pi 多阶段计划流程：计划为交付物、原型定悬案、执行需显式 go，默认不实现或提交 |
| 流程 opening-a-pr | P5 | 已适配为 Pi PR 创建流程：推送与 PR 需显式授权、禁止 force-push/自动合并 |
| 流程 orchestrate | P5 | 已适配为 Pi 大型项目协调流程：本地 store、受管 worktree、有界波次与显式落地授权 |
| 流程 perf-issue | P5 | 已适配为 Pi 单次性能修复流程：基线/后测、benchmark checklist、默认不提交或推送 |
| 流程 refactoring | P5 | 已适配为 Pi 行为保持重构流程：先钉 contract、等价验证、默认不提交或推送 |
| 流程 shipping | P5 | 已适配为 Pi 已验证 PR 落地流程：逐 PR 独立 verdict、patch-id 复核、显式落地授权 |

## 已适配纯文本技能（P5）

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 技能 bro | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 in-your-own-words | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 ketchup | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-attack-the-premise | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-build-the-lever | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-exhaust-the-design-space | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-experience-first | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-explain-the-number | P5 | 已适配；正文保留，仅将未移植的 benchmark-checklist 链接改为文字引用；见 validation-p1.md |
| 技能 principle-foundational-thinking | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-guard-the-context-window | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-make-operations-idempotent | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-migrate-callers-then-delete-legacy-apis | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-minimize-reader-load | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-never-block-on-the-human | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-outcome-oriented-execution | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-redesign-from-first-principles | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-separate-before-serializing-shared-state | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-subtract-before-you-add | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 principle-type-system-discipline | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 sharpen | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 technical-writing | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |
| 技能 typescript-best-practices | P5 | 已适配；正文保持上游，仅移除 Pi 不支持的 paths frontmatter 并标注未随包提供的 examples；见 validation-p1.md 资源检查 |
| 技能 unslop | P5 | 已适配；正文保持上游，仅补 MIT frontmatter；见 validation-p1.md 资源检查 |

## 已适配深度技能（P5）

| 条目 | 归属 | 依据 |
| --- | --- | --- |
| 技能 architect | P5 | 已适配为 Pi 设计草图流程：本地设计工件、可选 arena、真实约束检查，默认不提交或推送 |
| 技能 arena | P5 | 已适配为 Pi 候选对比流程：受管 worktree 隔离、只读评审、角色模型，默认不合并或推送 |
| 技能 interrogate | P5 | 已适配为 Pi 对抗审阅流程：只读评审白名单、角色模型、父代理核实发现，默认不提交 |
| 技能 no-comments | P5 | 已适配为 Pi 注释审阅流程：只读 Comment Sicko、人工核实发现，默认不提交 |
| 技能 reflect | P5 | 已适配为 Pi 会话反思流程：只读当前会话证据、结构化编码，默认不提交 |
| 技能 swarm | P5 | 已适配为 Pi 并行工作流：覆盖矩阵、受管 worktree、单 writer、原生完成通知，默认不合并 |
| 技能 why | P5 | 已适配为 Pi 决策溯源流程：本地 git/gh 与可用证据源、显式置信度，默认只读 |

## 后续约束

ported 的技能与流程由技能清单导出。P2 的 setup-pstack 已由扩展命令替代，证据见 validation-p2.md；其余 substitute 条目仍需对应阶段实现及验收，deferred 已归零。审计归属不等于全量复刻。
