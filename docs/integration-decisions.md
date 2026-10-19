# 接入决策与阻碍处理

核对日期：2026-10-16。结论适用于上游 pstack 0.15.25 固定提交，以及本机 pi-subagents 0.78.0。两项前置阻碍已经转化为有证据的实现路线；实际技能行为和真实子代理运行仍须按移植计划验收。

## 后续架构决定：固定源码与 Pi 适配层

用户在核对官方 Claude Code 接入后，已同意后续采用“固定上游源码＋Pi 适配层＋生成分发资源”。参考实现与证据边界见 [来源与证据](sources.md#官方跨宿主接入的参考证据)，实施顺序见 [P2.5](migration-plan.md#p25生成式适配迁移)。本节是后续决定；下文隔离检查记录仍保留原核对范围。

| 层次 | 后续职责 | 当前状态 |
| --- | --- | --- |
| 固定上游原文 | 从固定 SHA 归档原始技能、流程与代理，保留指纹和 MIT 作者声明 | 已有 P1 所需原文；基线保持不变 |
| Pi 适配层 | 集中工具、路径、技能调用、模型和授权映射；显式保存 P1 必要语义覆盖及外部依赖替代路线 | adapters/pi/ 已建立（harness.md + overrides/） |
| 生成资源 | 依据显式清单输出 skills/，P3 再输出 agents/；检查确定性、来源、链接及漂移 | 生成器已实现，skills/ 已由生成器维护并通过漂移检查 |
| Pi 运行时 | 保留模式开关、活动分支状态、项目 trust 和角色配置；P3 再接实际委派 | P2 已实现并验证，见 [契约](validation-p2.md) |

官方 Claude Code 方案中的非 Claude 模型回退、跳过 setup-pstack、将云环境映射为本地 worktree 和仅以提示约束只读，均不作为 Pi 的默认契约。Pi 继续保留精确模型校验、角色配置、明确的能力缺失处理和实际工具权限限制；本地 worktree 不能表示已经具备 Cursor 云代理能力。

优先复用通用正文，保留 P1 对 correct、三流程及原则的已验证修改，迁为显式规则、模板或覆盖。涉及能力缺失、授权和行为差异时逐项判断，不做全局字符串替换。未映射字段或依赖由生成检查拒绝，先修适配再生成。资源通过生成检查只代表结构正确，只有真实验收通过才能在 port-map.json 中声明支持。

## 结果

| 原阻碍 | 结论 | 采用方案 |
| --- | --- | --- |
| pi-subagents 代理发现与注册机制不明 | 已核实，并通过隔离模块检查 | 首选 package.json 的 pi.subagents.agents；代理用 pstack 命名空间 |
| Cursor 专属技能无已知替代方案 | 已核实公开内容、许可证及需要重写的边界 | 适配 deslop/control-cli/control-ui；独立编写 Pi 的 create-skill 流程 |

本次未安装 pi-pstack、未改用户全局配置、未发起子代理或模型请求。模块检查不能证明完整 Pi 会话中的子代理启动、取消、权限和技能遵循已经通过。

## 代理发现：采用包清单

pi-subagents 0.78.0 的 docs/agents.md 及 src/agents/agents.js 明确支持两种等价声明：顶层 pi-subagents.agents 或 pi.subagents.agents。本项目统一使用后者：

```json
{
  "pi": {
    "extensions": ["./extensions/pstack/index.ts"],
    "skills": ["./skills"],
    "subagents": {
      "agents": ["./agents"]
    }
  }
}
```

这是 P3 代理接线的目标配置。在 P3 实施中，package.json 已完整声明 skills、extensions 与 subagents.agents，并已通过生成器导出 agents/，完成了真实子代理接入验收。Pi 核心读取 extensions/skills；pi-subagents 额外读取 subagents.agents。仅把 pi-subagents 写成 npm dependency 不等于它的 Pi 扩展已加载，本项目不靠依赖目录中的另一份扩展实例隐式启动它。

初版把多代理定义为可选集成：已加载 pi-subagents 时启用；缺失时单代理技能仍可用，多模型步骤明确不可用。当前操作者已有该扩展。对其他用户提供依赖检测与配置说明；若未来追求新环境中的单命令全功能安装，需要在 P4 单独验证依赖资源打包/加载方案。

文件内使用 name: poteto-agent、package: pstack，得到 pstack.poteto-agent；另一代理为 pstack.comment-sicko。原始文件名不决定命名空间。优先级是 builtin < package < user < project，操作者可以用设置覆盖包内定义。

项目包受到项目 trust 过滤。用户通过 pi install 注册的本地路径、npm/Git 包可以被发现；一次性的 pi -e 路径是否进入 pi-subagents 的扫描范围未在本次验证，不能作为默认安装路线。

## 运行时注册：保留为备选

公开导出 pi-subagents/agents 提供 registerAgent 与 registerAgentViaEvents；事件名为 pi-subagents:runtime-agent-register:v1，版本为 1。跨扩展应优先通过事件向已加载的 pi-subagents owner 注册，以免把代理登记到错误的 ExtensionAPI 实例。

事件调用同步返回可 dispose 的 registration；没有 owner 时抛出明确错误。初始化后要避免重复注册，退出/reload 时释放。不要同时用文件发现和运行时注册定义同一代理；运行时合并会拒绝配置代理/别名冲突。

本次检查覆盖缺少 owner 的错误、注册、重复名称拒绝和 dispose 幂等性。未在真实 Pi 扩展宿主中检查事件时序、reload、shutdown 或后台子进程传播。首版采用文件发现，无需依赖这些运行时行为。

运行时定义与文件 frontmatter 字段并非完全同名，例如 defaultAsync 对应文件 async；advertise 不支持运行时注册。不要把 Markdown frontmatter 原样当注册对象传入。

## 代理上下文、工具与模型

| 项目 | 决策 |
| --- | --- |
| 基础提示 | systemPromptMode: append，保留 Pi 基础工具契约 |
| 项目规则 | inheritProjectContext: true；交接仍需显式写入关键硬规则 |
| 全局规则 | inheritGlobalContext 默认 false；本机全局文件硬门禁必须进入交接，不假设自动继承 |
| 技能 | inheritSkills: false；显式提供主技能绝对路径，并按实际选取 skills/skillPath |
| 后台 | async: true；等待使用原生完成通知，避免轮询等待 |
| 角色 | writer 与 read-only 明确分开；acceptanceRole 仅用于验收推断，不是工具权限 |
| 只读工具 | 使用实际只读 allowlist；不授予 edit/write/bash 来假装只读；codemode 和 MCP 的间接能力也需核实 |
| 扩展工具 | allowlist 不负责加载 provider；需要扩展工具时显式核实 provider 与子会话加载方式 |
| 模型 | 不保留 Cursor 固定 slug。P3 直接调用：角色未配置时不传 model，保留 pi-subagents 用户默认；显式 inherit 解析为父模型精确 ID；thinking 校验后编码为 provider/id:thinking；显式单次 model 优先且精确校验。脚本工作流、slash 与 delegation 事件尚未接入 |
| 并发写入 | 一个 cwd/worktree 只允许一个 writer；managed worktree 要求源仓库干净且有可用基线 |

Pi-subagents 的 thinking 支持 off/minimal/low/medium/high/xhigh/max，模型实际支持的级别还需检测。不得通过替换 Cursor slug 中的字符串来生成 Pi 模型名，不得在模型出错后静默切换供应商。

技能中要求自动 fan-out 的步骤需要适配当前操作者的委派授权规则。进入模式不意味着获得所有代理、推送或合并权限。缺少多模型依赖时，不将一次单模型检查报告成多模型独立审阅。

## Cursor 外部技能的具体替代

| 上游依赖 | 核实结果 | Pi 实现路线 | 验收 |
| --- | --- | --- | --- |
| deslop | cursor-team-kit 的公开 SKILL.md；不含私有 API | 适配成 pstack-deslop，比较当前任务基线与 diff，保留局部风格、行为和最小改动约束；不硬编码 main | 清理任务引入的问题，相关行为检查通过，不改用户既有改动 |
| control-cli | 公开的本地 harness 方法，使用仓库脚本、tmux 或 PTY | 适配 pstack-control-cli；优先已有测试驱动，临时进程有超时、输出上限和按 PID 清理 | 在可控 CLI 中驱动输入、观察输出、退出并确认进程结束 |
| control-ui | 公开的 browser/CDP 方法；包含 Playwright 示例 | 适配 pstack-control-ui 的能力路由；本机浏览器走 ego-browser，多步线性任务按 ego-decision-layer 规则；不复制启动另一浏览器的示例 | 通过真实页面状态验证，保存必要证据，并按技能关闭 TaskSpace |
| create-skill | Cursor 内置，pstack 与 kit 均无可导入的实现文件 | 自编 pstack-create-skill；依照 Pi docs/skills.md 和 Agent Skills 规范，写 name/description、相对引用、发现及 /reload 检查；已有技能优先直接编辑实体 | 生成技能可以发现与显式调用；触发性变更才进行合适的任务评估 |

以上是已核实的替代路线，目标技能尚未实现。ego-browser 是本机浏览器路由的可用条件，不是所有分发环境的强制依赖；其他环境若没有符合操作者规则的驱动，必须报告缺少能力。Electron/原生应用不自动等价于普通网页，不能宣称已由 ego-browser 全部覆盖。

cursor-team-kit 的这三份技能采用 MIT，Copyright (c) 2026 Cursor。许可已归档至 [LICENSES/cursor-team-kit.txt](../LICENSES/cursor-team-kit.txt)。独立编写 create-skill 不宣称复制或还原 Cursor 私有内置实现。

来源：[deslop](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/cursor-team-kit/skills/deslop/SKILL.md)、[control-cli](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/cursor-team-kit/skills/control-cli/SKILL.md)、[control-ui](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/cursor-team-kit/skills/control-ui/SKILL.md)、[kit LICENSE](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/cursor-team-kit/LICENSE)。

## 扫描中发现的额外范围

[依赖扫描记录](dependency-audit.json) 覆盖固定提交下的 158 份文本源码，包括 57 个技能、23 份 playbook、2 个代理和其余 76 份说明/脚本等文件。它记录关键词命中及上游行号；这些是依赖线索，不是逐文件语义兼容认证。关键技能、代理、工具脚本和外部技能另外人工核对。

| 发现 | 范围与处理 |
| --- | --- |
| 57 个技能中 54 个在 skills/，3 个在 automations/benny/ | 不把 Benny 当作普通技能包原样装入初版；两套 Cursor automations、Slack 和 Linear 等集成留在后期显式适配 |
| 两份插件清单共存 | 固定提交同时包含 pstack/plugin.json 与 pstack/.cursor-plugin/plugin.json；以 Git tree 和原始文件为准 |
| Bun 脚本 | bootstrap.ts 使用 Bun.spawnSync、import.meta.dir 和 frozen lock 安装；P1 不执行上游 bootstrap，首期走 Pi/项目已有验证程序，后期决定移植到 Node 或声明 Bun 依赖 |
| worktree-audit.sh | 硬编码 ~/.cursor/projects/.../agent-transcripts；须移除 Cursor 扫描逻辑或改用范围明确的 Pi 会话证据；清理流程留待后期 |
| recall/reflect/eval 等会话路径 | 需要按 Pi 当前会话/活动分支解析，不遍历无关工作区；尚无完整会话适配实现 |
| 云环境与 webhook | environment: cloud、Cursor cloud agent URL 和 api2.cursor.sh/automations 不映射为本地隔离的同义词；Benny、make-bot-ui 和云端流程明确延后 |
| /loop | 不能只替换成无限 continue；保留 P5 的停止谓词、预算、取消与恢复验收 |

这些后期适配点不阻碍 P1 的核心技能开始实现，但会阻止项目宣称全功能兼容。

## 本次可复现检查

检查脚本：[scripts/check-subagent-integration.mjs](../scripts/check-subagent-integration.mjs)。隔离 fixture 在 scripts/fixtures/subagents/，只包含虚构代理和无凭证设置。

在项目根执行（替换实际 pi-subagents 安装路径）：

```bash
PI_CODING_AGENT_DIR="$PWD/scripts/fixtures/subagents/user" node scripts/check-subagent-integration.mjs /Users/jiangkoumo/.pi/agent/npm/node_modules/pi-subagents "$PWD/scripts/fixtures/subagents"
```

本次结果：退出码 0，status 为 passed，以下 8 项检查通过：包清单发现、frontmatter 解析、项目覆盖、项目 trust、事件注册、重名拒绝、幂等 dispose、缺少 owner 报错。没有模型调用、没有子代理启动、没有真实扩展宿主启动。

脚本为了核实当前安装模块的真实行为，使用了 pi-subagents 内部 discovery/listener 导入；这些路径是诊断探针，不是未来发布扩展应依赖的稳定公共 API。正式集成采用包清单或公开事件契约。

## 已解除与仍待验收

已解除：代理如何随包分发、代理名称/上下文/工具的字段契约、三项公开技能的替代来源与许可、create-skill 的独立实现方向。

后续状态：P1 单代理子集、P2 模式与角色配置，以及 P2.5 生成式适配迁移与真实场景验收均已完成，分别见 [P1 验收](validation-p1.md)、[P2 验收](validation-p2.md)、[P2.5 验收](validation-p2-5.md) 与 [真实场景检查](validation-p2-5-live.md)。本文件早期核对记录中的“尚未实现”描述的是当时建档时的检查边界，不替代当前验收记录。

更新记录（2026-10-19）：P3 多代理角色接线、物理只读隔离、双模型审阅、Writer Gate 与 P4 本地打包/隔离安装/升级/卸载主路径均已通过实证验收，见对应验收记录。当前仍待推进项为 P5 规划范围及未授权的 npm 发布。
