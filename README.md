# pi-pstack

将 Lauren Tan（@poteto）的 pstack 工程技能与工作流移植到 Pi，交付为一次安装的 Pi package。

当前阶段：P1 单代理闭环已完成。11 个技能与调查／修复／实现三个流程已适配；82 个上游条目逐项归类为已适配／替代路线／延期；隔离样例、`correct` 验收（两轮审阅实际历史案例 + 合成历史回归）、新会话行为证据、Pi 加载与命令检查均已有实际结果。P2 模式扩展与角色配置已实现并验证，详见 [P2 契约与验收](docs/validation-p2.md)。包内子代理和安装验收尚未实现，npm 包未发布。详见 [本批范围](docs/port-status.md)、[逐项审计](docs/skill-audit.md) 与 [验证记录](docs/validation-p1.md)。

## 背景与目标

本项目源于 [@jiangkoumo_ 介绍 pstack 的帖子](https://x.com/jiangkoumo_/status/2110955861896253763)。pstack 将调查、设计、实现、审阅与验证流程整理成技能，以 poteto-mode 为主要入口；correct 则要求从反复发生的错误中找到可由架构、类型、自动检查和行为测试落实的约束。

目标是在 Pi 中保留这些工程方法，并适配 Pi 的技能加载、扩展事件、模型配置与子代理机制。交付单位是一个 Pi package，其中包含技能和少量 TypeScript 扩展代码。

## 文档入口

| 文档 | 内容 |
| --- | --- |
| [首批移植记录](docs/port-status.md) | 已实现范围、适配差异、使用与限制 |
| [上游逐项审计清单](docs/skill-audit.md) | 57 个技能、23 份流程、2 个代理的逐条归属 |
| [P1 验证记录](docs/validation-p1.md) | 实际运行结果与证据边界 |
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
- 初次建档参考 Pi `1.2.0`；本批使用实际安装的 Pi `1.3.0` 文档与技能加载器。pi-subagents `0.78.0` 的接入机制此前已检查；本包尚未导出代理，完整兼容版本范围未确立。

## 实现顺序

1. 核对上游完整依赖，建立可追溯的技能映射。
2. 移植单代理主流程、原则与 correct，验证真实行为。
3. 实现模式开关、跨轮状态和模型配置。
4. 对接 pi-subagents，验证代理注册、权限与工作区隔离。
5. 验证打包、安装、升级与卸载，再考虑长时间自主执行。

本地临时加载已可使用，不改全局配置：

```bash
pi -e /absolute/path/to/pi-pstack
```

然后输入 `/skill:poteto-mode <任务>` 或 `/skill:correct <范围>`。当前会话若尚未加载包，需要在加载包的新会话中使用。`/poteto-mode on/off/status` 管理活动分支模式；`/setup-pstack models` 列出模型，`status` 查看角色，`set user code <provider/id> [thinking]` 保存选择，`unset user code` 清除覆盖。受信任项目可将 user 换为 project。具体契约见 P2 文档。

运行 `npm run check` 检查资源、来源指纹和链接；Pi 加载检查详见本批记录。后续进入 [P3](docs/migration-plan.md#p3多代理与多模型) 前需先核实 P2 审阅结果与验收边界。`pi-pstack` 是工作名，npm 名称可用性尚未核实，包清单保持 private。
