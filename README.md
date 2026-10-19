# pi-pstack

npm 包名：`@jiangkoumo/pi-pstack`（仍为 private，尚未发布）。

将 Lauren Tan（@poteto）的 pstack 工程技能与工作流移植到 Pi，交付为一次安装的 Pi package。

当前阶段：P1 单代理闭环已完成。11 个技能与调查／修复／实现三个流程已适配；82 个上游条目逐项归类为已适配／替代路线／延期；隔离样例、`correct` 验收（两轮审阅实际历史案例 + 合成历史回归）、新会话行为证据、Pi 加载与命令检查均已有实际结果。P2 模式扩展与角色配置已实现并验证，详见 [P2 契约与验收](docs/validation-p2.md)。P2.5 生成式适配迁移与真实场景检查已完成并经两轮模型独立审阅，详见 [P2.5 验收](docs/validation-p2-5.md) 与 [真实场景检查](docs/validation-p2-5-live.md)。P3 代理生成、角色接线、前台/后台真实 child 拒写、worktree 隔离与双模型 live 审阅已完成，26 条审阅意见已逐条核实；写代码委派的交接契约、机械 review gate 与端到端 host 流程（fixture 模型）均已验证，P3 验收已通过，详见 [P3 验收](docs/validation-p3.md) 与 [Writer 验收](docs/validation-p3-writer.md)。P4 本地打包、隔离安装、升级与卸载已验证；CI 尚未真实运行，npm 包未发布。详见 [本批范围](docs/port-status.md)、[逐项审计](docs/skill-audit.md) 与 [验证记录](docs/validation-p1.md)。

## 背景与目标

本项目源于 [@jiangkoumo_ 介绍 pstack 的帖子](https://x.com/jiangkoumo_/status/2110955861896253763)。pstack 将调查、设计、实现、审阅与验证流程整理成技能，以 poteto-mode 为主要入口；correct 则要求从反复发生的错误中找到可由架构、类型、自动检查和行为测试落实的约束。

目标是在 Pi 中保留这些工程方法，并适配 Pi 的技能加载、扩展事件、模型配置与子代理机制。交付单位是一个 Pi package，其中包含技能和少量 TypeScript 扩展代码。

后续开发采用“固定上游源码＋Pi 适配层＋生成分发资源”，参考官方 Claude Code 的生成式接入方式。P2.5 生成器与适配层已落地并接入检查，P2 模式与角色配置继续保留，详见 [P2.5 验收](docs/validation-p2-5.md) 与 [参考证据](docs/sources.md#官方跨宿主接入的参考证据)。

## 文档入口

| 文档 | 内容 |
| --- | --- |
| [首批移植记录](docs/port-status.md) | 已实现范围、适配差异、使用与限制 |
| [上游逐项审计清单](docs/skill-audit.md) | 57 个技能、23 份流程、2 个代理的逐条归属 |
| [P1 验证记录](docs/validation-p1.md) | 实际运行结果与证据边界 |
| [P2.5 验收记录](docs/validation-p2-5.md) | 生成式适配迁移、权威清单与一致性验证 |
| [P3 验收记录](docs/validation-p3.md) | 代理导出、前后台只读 host 验收、工作树隔离；多模型流程推进中 |
| [P3 审阅意见核实](docs/validation-p3-live-findings.md) | 26 条 live findings 的逐条判定、引用核对与处理 |
| [P3 Writer 验收](docs/validation-p3-writer.md) | writer 交接契约、review gate 边界与门禁测试 |
| [P4 验收记录](docs/validation-p4.md) | 打包内容、隔离安装/升级/卸载、支持版本与未完成项 |
| [真实场景检查](docs/validation-p2-5-live.md) | 三轮真实新会话定性观察与 GLM 审阅记录 |
| [逐项移植映射](docs/port-map.json) | 82 个上游条目的适配或延期状态 |
| [背景与范围](docs/background.md) | 项目缘起、上游价值、已确定的边界 |
| [来源与证据](docs/sources.md) | 原帖、上游固定提交、许可证、Pi 文档与证据限制 |
| [移植计划](docs/migration-plan.md) | 兼容性矩阵、包结构、分阶段任务及验收标准 |
| [接入决策与阻碍处理](docs/integration-decisions.md) | 代理分发机制、Cursor 技能替代、隔离检查与剩余验收 |
| [依赖扫描记录](docs/dependency-audit.json) | 158 份上游文本文件的依赖线索与原始行号 |
| [上游目录清单](docs/upstream-inventory.json) | 固定提交下的技能、流程与代理路径 |
| [第三方声明](THIRD_PARTY_NOTICES.md) | pstack 作者、许可和后续引用要求 |
| [项目协作规则](AGENTS.md) | 后续开发的约束和交付要求 |

## 已核实的基线

- 上游仓库：[cursor/plugins 的 pstack 目录](https://github.com/cursor/plugins/tree/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack)。
- 固定提交：`f713f14203cd6420cec13cd7c55c32d598dbab68`。
- 插件版本：`0.15.25`；57 个 SKILL.md（54 个主技能、3 个 Benny 自动化技能）、23 份 poteto-mode playbook、2 个代理定义。
- 上游许可：MIT，Copyright (c) 2026 Lauren Tan。
- 初次建档参考 Pi `1.2.0`；本批使用实际安装的 Pi `1.3.0` 文档与技能加载器。pi-subagents 实际接入版本为 `0.79.0`；本包已通过 `pi.subagents.agents` 导出 `pstack.comment-sicko` 与 `pstack.poteto-agent`。

## 实现顺序

1. P1/P2 已完成：上游逐项审计、单代理流程、模式状态与角色配置均保留现有验收记录。
2. P2.5 已完成：建立 Pi 适配层和生成器，生成当前 11 个技能及三个流程，通过确定性、失败路径、链接、指纹以及三轮真实新会话行为验收。
3. P3 已完成（边界见验收文档）：已生成并声明两个包代理；角色接线、前后台真实 child 拒写、后台 ambient 扩展隔离、managed worktree 并发隔离以及双模型（DeepSeek 与 GLM）真实审阅流程与 wire 级录制隔离均已实测通过。写代码委派的交接契约、review gate 与端到端 host 流程已完成（fixture 模型），详见 [P3 验收](docs/validation-p3.md) 与 [Writer 验收](docs/validation-p3-writer.md)。
4. P4 进行中：本地打包、隔离安装/升级/卸载已通过；CI 未运行、npm 名称未核，见 [P4 验收](docs/validation-p4.md)。
5. P5：逐批扩大技能覆盖，单独验收长期执行；固定上游更新须记录差异并复验。

本地临时加载已可使用，不改全局配置：

```bash
pi -e /absolute/path/to/pi-pstack
```

然后输入 `/skill:poteto-mode <任务>` 或 `/skill:correct <范围>`。当前会话若尚未加载包，需要在加载包的新会话中使用。`/poteto-mode on/off/status` 管理活动分支模式；`/setup-pstack models` 列出模型，`status` 查看角色，`set user code <provider/id> [thinking]` 保存选择，`unset user code` 清除覆盖。受信任项目可将 user 换为 project。具体契约见 P2 文档。

运行 `npm run check` 检查资源、来源指纹和链接；Pi 加载检查详见本批记录。P3 已通过；继续补齐 P4 的 CI 真实运行、npm 名称确认与发布授权。npm 包名已定为 `@jiangkoumo/pi-pstack`；registry 上的 `pi-pstack@0.1.0` 未被使用。包清单保持 private，发布需要单独授权。
