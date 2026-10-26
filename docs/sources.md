# 来源与证据

建档日期：2026-10-16（UTC）。上游 main 会变化，以下源码结论优先引用固定提交。

## 原始需求来源

- [用户发布的 X 帖子](https://x.com/jiangkoumo_/status/2110955861896253763?s=20)：通过 ego-browser 读取正文，确认讨论对象是 pstack。
- 本项目创建前的会话：用户提出移植到 Pi、确认整体打包形态，并要求整理背景、来源和移植计划，单开项目。

X 正文不是上游代码的完整规格；该链接中的统计数据不影响本项目决策，也未作为长期证据归档。

## 上游固定基线

| 项目 | 结果 |
| --- | --- |
| 仓库 | https://github.com/cursor/plugins |
| 子目录 | pstack/ |
| 提交 | eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10 |
| 提交时间 | 2026-10-22T06:55:00Z |
| 插件版本 | 0.15.30 |
| 作者 | Lauren Tan（@poteto） |
| 许可 | MIT，Copyright (c) 2026 Lauren Tan |
| 目录统计 | 60 个 SKILL.md、23 个 poteto-mode playbook、2 个代理定义 |

[完整目录清单](upstream-inventory.json) 来源于 GitHub recursive tree API，该响应的 truncated 为 false。统计仅说明文件数量，不能证明所有文件已完成兼容性审计。

## statechart 局部同步（#40）

仅 `pstack/skills/statechart/**` 固定到 [076f4b2f57844ff9eb4ada914d4763884d40146e](https://github.com/cursor/plugins/tree/076f4b2f57844ff9eb4ada914d4763884d40146e/pstack/skills/statechart)。其余技能、流程和代理继续固定在 `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10`，不代表全包升级版本。`source-files.json`、`upstream-inventory.json` 和 `port-map.json` 的 `sourceOverrides` 共同记录局部 pin，文件 Git blob 指纹以 source-files 为准。

本次包含上游 `7698375f`（#776，含 TLC 1.8.0 测试修复与 config 选项）、`4ec7ffa1`（#779，重构）和 `076f4b2f`（#791，显式 cover、裁剪计数、Pele/resvg、删除 OutputFolder 模型）。旧版自动 cover 是上游当时的行为；本次通过同步修复，不在旧脚本上另打补丁。脚本与上游测试保持原样，Pi 运行入口通过适配层禁止自动安装 TLC/Java/mise，并在 PNG 不可用时保留 Mermaid 产物。

## 关键源码

| 来源 | 用途 |
| --- | --- |
| [上游 README](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/README.md) | 项目目标、入口和用户使用说明 |
| [plugin.json](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/plugin.json) | 固定版本和作者、许可元数据 |
| [poteto-mode](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/skills/poteto-mode/SKILL.md) | 原则、任务路由、Cursor Task 调用与外部技能引用 |
| [correct](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/skills/correct/SKILL.md) | 重复错误的识别、约束层级和证据要求 |
| [setup-pstack](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/skills/setup-pstack/SKILL.md) | Cursor 模型标识和 .mdc 配置路径 |
| [poteto-agent](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/agents/poteto-agent.md) | 委派前读取主技能、Cursor 插件目录查找约定 |
| [comment-sicko](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/agents/comment-sicko.md) | 已读取；报告型代理，Pi 适配需显式只读工具权限，验收留待 P3 |
| [LICENSE](https://github.com/cursor/plugins/blob/f713f14203cd6420cec13cd7c55c32d598dbab68/pstack/LICENSE) | MIT 原文及版权归属 |

初次建档核对了关键文件及目录清单。后续依赖核实读取并扫描了 158 份上游文本文件，记录在 dependency-audit.json；关键词扫描不等于逐文件语义审计。网页提取可能改变 Markdown 排版；它只用于阅读和建档，不作为未来导入源文件的字节级副本。正式导入须从固定 Git 提交取得原始内容并保留许可证。

更正初次建档结论：固定提交的 Git tree 同时包含 pstack/plugin.json 和 pstack/.cursor-plugin/plugin.json，不能将后者说成不存在。两者均记录在本次扫描清单中。此前读取浮动 main 时观察到的 0.15.21 不作为本项目基线。

57 个技能包括 pstack/skills/ 下 54 个和 pstack/automations/benny/ 下 3 个；Benny 属于额外的 Cursor 自动化集成范围。

## 官方跨宿主接入的参考证据

本次会话通过 ego-browser 读取 [kaito 的原帖](https://x.com/cu30rry_/status/2111227122308300976)，正文宣布官方 pstack 支持 Claude Code；[Jamie Scott Craik 的回复](https://x.com/jscraik/status/2111237299107217852) 称 Codex 也可使用并附图。Codex 仅确认到社区展示，未进行安装或行为验证。

随后用 GitHub API 将这次架构核对固定在 `ac4e25a0064cd600afdd605208bad72748cb019a`（提交时间 `2026-10-16T23:34:00Z`）。这是新增的参考证据，不替换本项目导入基线 `f713f14203cd6420cec13cd7c55c32d598dbab68`，也未全量审计两个提交间的差异。

| 固定提交下的来源 | 已核实内容 |
| --- | --- |
| [pstack README](https://github.com/cursor/plugins/blob/ac4e25a0064cd600afdd605208bad72748cb019a/pstack/README.md) | 官方 Claude Code marketplace 安装入口 |
| [marketplace 清单](https://github.com/cursor/plugins/blob/ac4e25a0064cd600afdd605208bad72748cb019a/.claude-plugin/marketplace.json) | pstack 来源指向 ./harness/pstack/claude-code |
| [生成目录说明](https://github.com/cursor/plugins/blob/ac4e25a0064cd600afdd605208bad72748cb019a/harness/pstack/README.md) | 由 pstack 原始技能、代理、适配文档、许可与清单生成目标目录 |
| [生成脚本](https://github.com/cursor/plugins/blob/ac4e25a0064cd600afdd605208bad72748cb019a/scripts/generate-pstack-harness-trees.mjs) | 复制资源、插入按会话读取适配表的提示、检查映射覆盖，并提供 --check 漂移检查 |
| [Claude Code 适配表](https://github.com/cursor/plugins/blob/ac4e25a0064cd600afdd605208bad72748cb019a/pstack/docs/harness/claude-code.md) | 工具、代理字段、模型、路径与 Cursor 专有能力的映射和限制 |

实际执行的只读检查：`gh api repos/cursor/plugins/commits/main`、`gh api 'repos/cursor/plugins/git/trees/ac4e25a0064cd600afdd605208bad72748cb019a?recursive=1'`，以及上述五份文件与 pstack/plugin.json 的 contents API 读取，均退出码 0。tree 响应 truncated=false；本次目录检查未发现 Codex 命名的接入文件。该结果不否定社区已能在 Codex 使用。

本项目借鉴其源码与生成资源分离的维护方式。官方适配表对非 Claude 模型回退到会话模型、setup-pstack 不落配置、只读 Explore 保留 Bash、Cursor 专有能力跳过等处理，不代表 Pi 的目标能力；Pi 的具体边界以 [接入决定](integration-decisions.md) 和各阶段验收为准。本次没有安装或实测官方 Claude Code/Codex 插件。

## Pi 能力依据

本机实际参考文档根目录：

`/Users/jiangkoumo/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works/pi-coding-agent/`

| 文档 | 已核实的能力 |
| --- | --- |
| docs/skills.md | SKILL.md、按需读取、/skill:name、disable-model-invocation、技能名称约束 |
| docs/packages.md | 在一个包中声明 skills/extensions；npm、Git 和本地来源安装 |
| docs/extensions.md | registerCommand、before_agent_start、appendEntry、session_start/shutdown 等集成点 |
| README.md | 扩展定位及子代理需要额外集成的产品背景 |

[Pi 官方仓库](https://github.com/earendil-works/pi) 中的在线文档会随主线变化，后续开发应先读实际安装版本的文档、类型声明和对应示例。Pi 1.2.0 尚未经过本项目运行时验收。

Pi 核心不自动加载任意 agents/ 目录；已核实 pi-subagents 0.78.0 通过 package.json 的 pi.subagents.agents 或顶层 pi-subagents.agents 读取代理目录。隔离模块检查验证了发现、覆盖、trust 与注册行为；本批 P3 进一步按实际安装的 0.79.0 复验了包发现与字段解析。具体决定及检查边界见 [接入决策](integration-decisions.md)。

本机 pi-subagents 证据路径（根目录为 /Users/jiangkoumo/.pi/agent/npm/node_modules/pi-subagents/）：package.json、docs/agents.md、docs/models.md、src/agents/agents.js、src/api/agents.d.ts、src/agents/runtime-agent-events.js、src/agents/runtime-agent-registry.js。清单机制在 0.78.0 已核实，当前安装版本升级为 0.79.0；扫描接口及字段按这些已安装文件核实。

外部技能来源位于同一固定提交的 cursor-team-kit/skills/deslop、control-cli、control-ui；均为公开 Markdown 方法，许可见 cursor-team-kit/LICENSE。已保留 Cursor 的 MIT 版权声明。Cursor 内置 create-skill 未作为可导入源码发现，采用独立编写 Pi 流程的方案。

## 已知待核实项

- 所有技能及 playbook 的逐项语义兼容性与传递依赖闭包；已完成全量文本依赖扫描，已确定 deslop/control-cli/control-ui/create-skill 替代路线。
- 真实 Pi 子代理启动、取消、权限与模型可用性；代理发现与注册接口已核实并通过隔离模块检查。
- 模式状态在分支、会话切换、恢复、reload 和 compaction 后的准确语义。
- 包名可用性、Pi 支持版本范围与完整安装/卸载行为。
- 长运行所需的停止条件、取消传播、恢复和重复执行保护。

## 可复现的上游核对

本次实际执行成功：

- `gh api repos/cursor/plugins/commits/main --jq '{sha: .sha, committed_at: .commit.committer.date, url: .html_url}'`，退出码 0。
- `gh api repos/cursor/plugins/git/trees/f713f14203cd6420cec13cd7c55c32d598dbab68?recursive=1`，退出码 0；结果在 codemode 内筛选并汇总。

重查目录应使用固定 SHA；重查 main 只用于发现更新。更新基线时记录新 SHA、版本、差异与重新验收的范围。
