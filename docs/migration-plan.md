# 移植计划

状态：P0 与前置依赖核实完成；P1 单代理闭环已完成，含逐项审计，见 [首批移植记录](port-status.md)、[逐项审计](skill-audit.md) 与 [验证记录](validation-p1.md)。P2 模式与角色配置扩展已实现，见 [P2 验收](validation-p2.md)。P2.5 生成式适配迁移与真实场景验收已完成，见 [P2.5 验收](validation-p2-5.md) 与 [真实场景检查](validation-p2-5-live.md)。P3 多代理、多模型与 writer review gate 已完成，见 [P3 验收](validation-p3.md) 与 [Writer 验收](validation-p3-writer.md)。详见 [接入决策与阻碍处理](integration-decisions.md)。目标是一个整体分发的 Pi package，提供可独立使用的技能，并用精简扩展实现需要运行时支持的能力。

项目采用“固定上游源码＋Pi 适配层＋生成分发资源”。依据是官方 Claude Code 接入已采用适配表与生成目录，见 [来源与证据](sources.md#官方跨宿主接入的参考证据)。P2.5 已完成迁移并保留 P1/P2 的配置契约与历史证据，导入基线仍为 `f713f14203cd6420cec13cd7c55c32d598dbab68`。P3 已实现代理生成、角色接线、前后台真实 child 拒写、worktree 隔离、双模型只读审阅，以及带 handoff、独立 review 和机械 gate 的写代码委派流程。

## 能力映射与适配点

| 上游能力 | Pi 目标 | 适配与验收重点 |
| --- | --- | --- |
| 工程原则、correct、tdd | 由固定原文与 Pi 适配规则生成 SKILL.md | 保留许可证与指纹；规范 frontmatter；保留已验证的语义适配；按需读取 |
| poteto-mode 路由与 playbook | 生成入口、流程及按需适配说明 | 统一工具、路径和授权映射；保留当前三流程范围；真实任务证明步骤有执行 |
| Cursor 自定义 mode/reminder | 扩展命令及事件 | 显式开关；后续轮次、恢复与关闭行为一致；不重复注入 |
| Task / poteto-agent | pi-subagents 适配 | 明确代理注册、交接、权限、工作目录和结果引用 |
| 多模型 panel | 角色配置 | 使用已验证的 provider/id 和支持的 thinking；保持用户模型偏好 |
| .cursor/rules/pstack-models.mdc | 独立配置文件 | 用户级与项目级优先级、校验、幂等更新和错误提示 |
| deslop/create-skill/control-* | 已确定适配路线 | 三份公开技能保留 MIT 后适配；独立编写 Pi 作者流程；本机浏览器按 ego-browser 路由 |
| /loop 与长期执行 | 后期有界续跑 | 最大轮次、停止谓词、取消、恢复和重入保护 |
| Cursor 聊天/云代理上下文 | Pi 会话或外部记录适配 | 不假设可访问 Cursor 历史或专有 API |

## 预期包结构

以下为包结构。当前已有 package.json、skills/、agents/、upstream/、adapters/pi/、scripts/generate-pi-resources.mjs、extensions/pstack/ 及建档文件；skills/ 与 agents/ 均由生成器维护：

```text
pi-pstack/
├── package.json
├── upstream/                 # 固定提交的原文，只读归档
├── adapters/
│   └── pi/                   # Pi 映射、模板及必要的语义覆盖
├── scripts/
│   └── generate-pi-resources.mjs  # 含只读 --check
├── extensions/
│   └── pstack/
│       └── index.ts          # 保留 P2 运行时职责
├── skills/                   # P2.5 切换后由生成器维护
│   ├── poteto-mode/
│   │   ├── SKILL.md
│   │   └── playbooks/
│   ├── correct/
│   └── principle-*/
├── agents/                   # P3 经权限适配后生成，受版本控制
│   ├── poteto-agent.md
│   └── comment-sicko.md
├── docs/
├── LICENSES/
└── THIRD_PARTY_NOTICES.md
```

当前 package.json 声明 extensions、skills 以及 pi.subagents.agents: ["./agents"]，代理 frontmatter 设置 package: pstack。该发现机制已通过 pi-subagents 0.79.0 模块检查，P3 步骤 1 已实现导出。核心技能保持独立可用；多模型与角色对接在后续步骤验收。

Pi 提供的宿主包按官方文档声明为 peerDependencies，不打进运行时 dependencies。其他依赖只在实际引用时添加。

## 源码、适配层与生成边界

- upstream/ 只保存固定 SHA 的原文与许可证；docs/source-files.json 记录文件指纹。官方 Claude Code 生成目录仅作架构参考，Pi 从 pstack 原始源码生成。更新基线须单独记录新 SHA、差异和局部复验范围。
- adapters/pi/ 集中保存工具、技能调用、路径、模型、授权、能力缺失的映射，以及必要的模板或语义覆盖。通用工程正文尽量复用；P1 对 correct、三流程及原则的有效修改迁入显式覆盖，避免重新引入上游自动委派、提交、推送或外发行为。
- 简单工具或路径映射由生成器处理；需要运行时决策的差异通过生成资源按需引用 Pi 适配说明。扩展只处理模式、状态和角色配置等运行时职责，不每轮注入整套适配说明或技能。
- docs/port-map.json 保持逐项支持状态的权威记录。P2.5 扩展其 schema，记录源路径、目标、适配规则或覆盖、依赖、支持状态与验收证据，并同步现有检查。生成范围使用显式清单，默认排除 deferred 和仅有替代路线的条目；生成成功不能改变支持状态。
- P2.5 切换完成后，skills/ 及后续 agents/ 标记为生成资源并纳入版本控制；维护修改落在原文基线、适配规则或覆盖中，通过生成器更新输出。生成器只管理清单内的输出，遇到未归属文件、未知宿主字段或未映射依赖时报错，由开发者明确处理后再生成，避免静默丢字段或扩大支持范围。
- 保留相对链接、MIT 作者声明及适配记录；不随意将缺失本地资源改指浮动 main。发布包包含运行所需的适配说明与依赖资源，P4 核对实际打包结果。

## 命令与状态设计

下表入口已实现，P2 的模式和角色配置契约见验收文档。setup-pstack 只保存角色偏好，不自动改变当前模型或启用委派：

| 入口 | 预期行为 |
| --- | --- |
| /skill:poteto-mode <任务> | 本轮显式应用主技能 |
| /poteto-mode on | 开启当前会话后续轮次的模式 |
| /poteto-mode off | 关闭后续轮次自动应用 |
| /poteto-mode status | 显示模式和能力状态 |
| /setup-pstack | 检测实际可用模型并配置角色 |
| /skill:correct <范围> | 在任务授权范围内识别重复错误并落实约束 |

P2 已通过 before_agent_start 更新单个系统区块，通过 appendEntry 记录非模型模式状态，并按活动分支恢复；生成式迁移保留该行为，不将完整技能每轮重复塞进上下文。

配置继续使用 P2 的独立 pstack.json、项目 trust、角色覆盖与精确 provider/id 校验契约，详见 [P2 验收](validation-p2.md)。Pi 适配层将上游 setup-pstack 引用接到现有命令，P3 再将角色偏好接到实际委派；不得静默切换模型或将本机模型写成分发默认值。

## P0：建档

- [x] 创建独立项目目录和本地 Git 仓库。
- [x] 记录用户原帖、背景与整体打包决定。
- [x] 固定上游提交、版本、目录清单与 MIT 来源。
- [x] 写出兼容性矩阵、范围、风险和验收标准。

完成证据为本项目文档、目录清单及实际执行的检查。本阶段不安装、发布或修改 Pi 全局配置。

## P1：上游审计与技能最小闭环

- [x] 从固定提交通过 GitHub contents API 获取并扫描 158 份文本源码；核实 pstack 与 cursor-team-kit 的 MIT 许可。
- [x] 核实 deslop/control-cli/control-ui/create-skill 的替代路线，记录代理接入方案与延期范围。
- [x] 首批所需原始材料已导入，15 个源文件以 Git blob ID 校验；已适配子集的相对引用可解析。
- [x] 逐项归类 57 个技能（含 3 个 Benny 自动化技能）、23 份流程、2 个代理共 82 项，形成已适配 14、替代路线 6、延期 62 的清单，见 [逐项审计](skill-audit.md) 与 [port-map.json](port-map.json)。归类依据是固定提交原文与 Cursor 私有机理依赖，不是逐项实现。
- [x] 移植 poteto-mode、correct、tdd、八个原则与调查／修复／实现流程，未移植的高级强依赖以内嵌必要步骤替代并记明。
- [x] 首批技能 name 与 frontmatter 已规范，Pi 1.3.0 加载器无诊断。
- [x] 首批 Task、AskQuestion、todo、文件操作和验证步骤已适配；单代理默认，不自动扩大授权。
- [x] 接通仅含 skills 的最小 package.json，保留来源、许可、原文及改动记录。
- [x] `correct` 已在含两次同类错误提交的合成临时仓库，以及本项目两轮审阅发现的真实发布链接回归中验收，新增检查在修复前退出码 1、修复后 0，历史坏例重放被拒绝；新会话调用与遵循证据为两次真实运行（只读调查、缺陷修复），见 [验证记录](validation-p1.md)。

验收：技能发现无无效名称或重名诊断；每条已承诺流程的相对引用可解析；在可控样例项目中分别完成只读调查、一个可复现缺陷和一个小行为变更。correct 样例包含至少两次同类历史错误，并证明新增约束能够拦住真实坏例。无法访问的历史来源必须说明，不编造证据。

## P2：模式和模型配置

- [x] 实现 on/off/status 与活动分支状态持久化。
- [x] 实现 setup-pstack 的实际目录检测、角色配置及严格 schema 校验。
- [x] 核实恢复、分支、reload、真实 compaction、运行时会话切换和 JSON/print/RPC 行为；TUI 视觉验收另记限制。
- [x] 单个系统区块更新，无无条件续跑；off 替换自动提醒，但不宣称模型遗忘历史技能。

验收：连续两轮能够应用模式；关闭后新增轮次不再自动应用；恢复与分支行为符合已写明的契约；配置幂等，未知模型和非法值能定位问题；不静默切换供应商或覆盖用户配置。

## P2.5：生成式适配迁移

- [x] 核对当前安装版本的 Pi 文档、类型与示例，编写 adapters/pi/ 的工具、技能调用、路径、模型、授权和能力缺失映射；明确映射可静态生成还是需按任务读取。
- [x] 扩展 port-map.json 与相关检查，明确生成清单、依赖闭包、语义覆盖和证据字段；保留 82 项审计的历史归属，不把延期项目批量标为已适配。
- [x] 从现有固定原文生成当前 11 个技能及三个流程，将 P1 必要差异迁入可审阅的规则、模板或覆盖；保留 P2 入口、配置和运行时实现。
- [x] 新增 scripts/generate-pi-resources.mjs 及只读 --check；验证确定性、重复运行无差异、输出归属、来源指纹、frontmatter、许可证、相对链接与未映射依赖。漂移检查与失败路径测试已接入 npm run check；CI 尚未配置，移到 P4 跟踪。
- [x] 补齐生成资源的只读调查、缺陷修复、小行为变更真实新会话验收；三轮复测通过主代理业务与流程核查，GLM 独立复查结论为 OK，见 validation-p2-5-live.md。
- [x] 更新维护说明与适配差异，确认以后从固定基线和适配层生成资源；下一步进入 P3。

验收要求：相同固定输入生成相同资源，--check 只读且能拒绝漂移；现有 11 个技能与三个流程的关键行为须有生成后的新会话证据，P2 契约保持一致。当前实现与验收见 [P2.5 验收](validation-p2-5.md) 与 [真实场景检查](validation-p2-5-live.md)。

## P3：多代理与多模型

- [x] 核实 pi-subagents（当前实测 0.79.0，历史模块探针基线 0.78.0）的包清单发现、命名空间、覆盖、工具/上下文字段及公开注册接口；隔离模块检查通过。
- [x] P2.5 通过后，将 poteto-agent 和 comment-sicko 纳入适配层和生成清单，通过 pi.subagents.agents 发现；核心技能保持可独立使用。
- [x] 先迁移一个多模型只读审阅流程，再迁移写代码的委派流程；接通 P2 角色配置，模型不可用时明确失败，不静默回退到会话模型。（只读多模型审阅已完成双模型实测闭环，26 条意见逐条核实；写代码委派已实现父代理 handoff + 机械 gate，并用真实 host/fixture 模型跑通 writer→reviewer→gate 的正反向流程。reviewer 不是自动启动，gate 为父代理侧约束，见 validation-p3-writer.md）
- [x] 用实际只读 allowlist 约束 reviewer，核实间接工具能力；尝试写入普通、忽略及未跟踪文件均应被拒绝，不能仅以提示词和 git status 证明只读。（前台+后台 detached runner 均已验证，见 validation-p3-background.md）
- [x] 保持一个 cwd/worktree 只有一个 writer，并隔离并发写入。（managed worktree 隔离及未隔离同 cwd 对比实测已完成，见 validation-p3-worktrees.md）
- [x] 交接明确目标、允许路径、禁止事项、已批准决定、验收证据和联系主代理的方法（当前采用遇阻最终返回 + 原生完成通知；字段与顺序已写入 poteto-mode 技能，门禁见 validation-p3-writer.md）。
- [x] 验证取消、超时、模型不可用及子代理失败的返回路径。（前台中断/超时/400 + 后台 stop/timeout/SIGKILL 均已验证）

验收：使用实际可用模型完成一次不同模型的审阅；主代理核实意见并给出证据；写入范围可核查；禁止 reviewer 修改；缺少依赖时功能范围明确且核心技能可用；写代码委派须经独立 review 与机械 gate 才应用补丁，且不自动 commit/push。运行子代理仍需遵守操作者当前授权。当前验收记录详见 [P3 验收](validation-p3.md)、[后台隔离验收](validation-p3-background.md)、[工作树验收](validation-p3-worktrees.md)、[Live 审阅验收](validation-p3-live.md) 与 [Writer 验收](validation-p3-writer.md)。

## P4：打包与安装验收

- [ ] 配置 CI 调用与本地相同的 npm run check，另行记录真实运行结果；已添加 .github/workflows/check.yml，但无远端、未真实运行，见 validation-p4.md。
- [x] 核对许可证、生成资源、运行所需适配说明、依赖与发布包实际包含的文件；打包前确认生成漂移检查通过。
- [x] 在隔离的 Pi agent 配置目录中验证本地安装和卸载，检查资源发现。
- [x] 验证升级不覆盖用户配置，移除包不会残留自动加载行为。
- [x] 记录 Pi 支持版本、必要依赖、能力限制和使用实例（见 validation-p4.md）。
- [ ] 确认 npm 名称或选择作用域；需要发布时按用户授权执行。包仍为 private，名称未核。

验收：本地打包和隔离安装/卸载完成；技能、模式及可选依赖行为与文档一致；已有用户配置不受影响。安装成功不等于行为验证通过，P1–P3 的行为证据需要保留。当前记录见 [P4 验收](validation-p4.md)。

## P5：长时间执行与全量覆盖

- [ ] 评估其余技能、PR 流程、上下文恢复与跨会话能力。
- [ ] 为 Bun bootstrap/工具脚本选择 Node 适配或显式 Bun 依赖；改造 Cursor transcript 路径。
- [ ] 单独评估 Benny 自动化、make-bot-ui 和 Cursor 云环境；初版不宣称支持。
- [ ] 实现有界续跑及停止、取消、崩溃恢复与幂等保护。
- [ ] 将自动合并、推送和清理操作的授权边界写进对应流程。
- [ ] 在 P2.5 的固定来源和生成检查基础上扩大覆盖：逐批审计依赖、补适配、做真实任务验收后再更新支持状态；记录每次上游更新的固定 SHA、原文与规则差异及受影响的复验。

验收：长任务在停止条件、预算耗尽、用户取消和恢复场景均能正确结束或继续；不会因续跑重复执行外部写入。只有通过验收的能力才进入支持清单。

## 验证策略与完成标准

文档阶段检查来源可追溯、内部链接、清单统计与 Git 状态。实现阶段使用有意义的行为检查：模式状态和错误路径可用自动化检查，技能遵循需要真实任务记录。构建、类型检查或文件存在都不能代替用户可见行为证据。

每阶段交付说明已完成、验证命令与实际结果、未完成和具体阻碍。复杂实现追加 fresh-context 只读审阅，遵守用户对委派的授权。初版完成指 P1、P2、P2.5、P4 的单代理路径通过；多代理支持需 P3 单独通过。整个上游的完整兼容需额外完成 P5 和逐项能力清单。
