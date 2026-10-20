# pi-pstack 下一轮修复清单（基于 0.1.1 复测）

状态：全部三个并行分支已按顺序合入 main（next/runtime → next/coverage → next/orchestration）；主控入口接线、公共注册表与严格门禁已全部完成，全套 13 门禁实测通过。待操作者确认发版（0.2.0）与清理 worktree。

判定标准：与上游 pstack v0.15.25 功能对等，不要求代码/文件 1:1。固定导入基线仍为 `f713f14203cd6420cec13cd7c55c32d598dbab68`，不跟随浮动 main。

## P0 功能覆盖（收益最大）

### 1. 恢复 poteto-mode 路由

- [x] 修改 `skills/poteto-mode/SKILL.md` 对应源模板，补回上游 Non-negotiables 的路由触发：how、architect、swarm/arena、interrogate、unslop、technical-writing、no-comments、benchmark-checklist。
- [x] Principles index 补全 24 条（报告称现在只有 8 条可达）。
- [x] 补回 Autonomy 段：always-pause 清单、“going to bed / run until done”覆盖规则，以及回复写作规则。
- [x] Cursor 专属部分改写为 Pi 对应物，不直接删去方法内容。
- [x] 验收：SKILL.md 链接到全部 24 个 principle-* 和上述技能；用设计类请求运行 poteto-mode，模型主动读取 architect。

### 2. 将约 11 个“假 substitute”改为 ported

- [x] how、poteto-help、figure-it-out、blast-radius、benchmark-checklist、teach、show-me-your-work、verification 类 2 个、runtime-forensics/trace-forensics、visual-parity。
- [x] 以固定上游实际内容审阅依赖，替换工具和路径，保留方法；不要仅依据“纯 prompt”的描述认定无依赖。
- [x] 同步 `docs/port-map.json` disposition；保留 substitute 的条目，其替代物必须在技能正文中被提及。
- [x] 验收：Pi 能发现这些技能；benchmark-checklist 包含至少 5 次交替运行、限制因素、上限推算、报告格式；principle-explain-the-number 不再写“not bundled”。

注：按固定目录的名字计数，上述实际为 9 个独立技能（含 create-verification-skill、maintain-verification-skill）及 3 个 playbook，共 12 个条目；数量不是删减需求的依据。

## P1 多代理与角色

### 3. 并行子代理走角色映射

操作者已定案：按 agent 定义绑定角色模型，使用 pi-subagents 0.79.2 公开运行时注册事件，替代改写每个 launch 的方案。操作者已实测 named parallel、脚本顺序 runs.run、顶层 model 覆盖及用户 override 优先级；项目仍须补自身实现验收。

- [x] 仅经 `pi-subagents:runtime-agent-register:v1` 同步事件注册，不导入 pi-subagents 内部实现、不改内部 launch、不写用户 settings。
- [x] 去掉 package.json 的 pi.subagents.agents 导出；session_start 从 agents/*.md 读取 definition，保留 systemPrompt、tools、隔离和继承字段。
- [x] 绑定 code → pstack.poteto-agent、review → pstack.comment-sicko、verification → 新增 pstack.verifier、prose → 新增 pstack.prose-writer。保留四角色配置兼容性。
- [x] 未配置角色省略 model/thinking；inherit 保留 model:"inherit"；thinking 独立写 definition.thinking，不编码为模型后缀。
- [x] session_start、set/unset、cwd/会话切换先 dispose 旧注册再注册，shutdown 清理；不保留失效会话上下文。
- [x] 调用涉及任意 pstack child 且带顶层 model 时 block，并提示去掉 model；不改写参数结构。直接调用 applySubagentRole 的旧改写在正式入口切换时一并移除。
- [x] request.result 为空时 status 显示 pi-subagents 未安装或不支持 v1；ok:false 时报告 error，不静默回退。
- [x] README 写明最低 0.79.2；status 提示用户级 subagents.agentOverrides.<name> 的模型和 thinking 优先于 pstack.json，项目 overrides 仍受项目 trust 约束。
- [x] 单测 mock pi.events 覆盖注册内容、缺失/失败、重新注册与清理、顶层 model 拦截；真实集成覆盖 named parallel、脚本顺序、顶层 model 拦截、用户级 override，核对子进程实际 provider/thinking。

runtime 分支追加模块 `extensions/pstack/role-agents.mjs` 和 `scripts/role-agents.test.mjs`，负责公开事件控制器、定义解析、顶层 model 检测和专用集成脚本。主控保留 index.ts、package.json、agents 的模板与生成文件、公共检查、README 和正式入口验收接线；不同工作目录不写同一文件。旧导出与旧测试仅在主控正式切换入口时移除，避免未合并模块破坏当前 main。

### 4. 补回多代理方法内容

- [x] arena、interrogate、swarm、reflect、why、architect：补回 reviewer/explorer prompt、评分 rubric、why 来源指南、reflect 审查角色；可放 references/ 按需读取。
- [x] 验收：逐项对照固定上游概念清单，保留率明显提升（复测报告称 architect 为 2/28）；保存可核对的差异及实际内容，不用关键字计数替代语义审阅。

### 5. pi-subagents 依赖

- [x] 扩展加载或 /poteto-mode status 检测 subagent 工具，缺失时明确提示。
- [x] 评估 peer/optional 依赖声明，避免强制安装覆盖操作者的既有配置。

## P2 长程编排

### 6. orchestrate / multi-phase-plan / babysit 可执行流程

- [x] 提供计划模板、PR 模板、check-plan 检查器。
- [x] orch / watch-pr 使用 /loop + gh CLI 或脚本替代，在 playbook 写明真实用法与授权边界。
- [x] 验收：multi-phase-plan 产出符合模板的计划并通过 checker；实际跑通过/拒绝案例。

## P3 小问题

### 7. 模式首次开启的持久化提示

- [x] 首条消息前 /poteto-mode on 在无会话文件时强制落盘，或明确警告进程结束会丢失；不能仅返回 persistent:false。

### 8. abort 后 loop 状态

- [x] 同一进程 abort 后 /loop status 应立即为 interrupted，不继续显示 running；真实宿主回归覆盖。

### 9. docs 死链

- [x] 复核报告中的 41 条死链，含 docs 内 scripts/...、migration-plan.md 的 release.mjs 引用及 validation-p4.md 的 release.mjs 引用。
- [x] 同时检查 Markdown 链接与行内代码路径，修复可复现项；未复现项记录证据，不能制造修前失败。

### 10. TypeScript 严格模式

- [x] 重现并修复报告的 4 处类型错误：index.ts 的 paths 索引，以及 decideNextStep 参数 JSDoc 类型；以实际编译结果为准。

### 11. 测试依赖

- [x] 测试依赖 jiti 和 Pi peer 包，发布包直接跑测试会报 MODULE_NOT_FOUND；补 devDependencies 或 README 写明安装测试依赖的流程。

## 统一验收与发布

- [x] 各 agent 开工先跑 `npm install && npm run check`；每项修复有修前失败、修后通过证据，新功能有行为测试。
- [x] 提交前 `npm install && npm run check`、`git diff --check`、`git status`；不提交 package-lock.json。
- [x] 同一失败修了两次仍不过，停止并报告证据。
- [x] 每分支报告改动与原因、通过/失败数、未完成或规格不符项、commit hash。
- [x] 主控汇总 `git log main..<branch> --oneline` 和 `git diff main...<branch> --stat`，待操作者确认后逐个合并。
- [x] 从第二分支开始，先 rebase 最新 main 并重新跑检查；全部合完更新本文件完成状态。
- [x] 在同一 Pi 环境和既有脚本上回归，并新增路由与并行角色的真实运行验收，执行独立只读审阅。
- [ ] 完成后发布新版本并验证 registry/安装；建议 0.2.0（待分工确认），不在验收前发布。推送、tag 推送、worktree/分支清理仍须操作者明确确认。

## 待确认的实施分工

主控先串行完成必要的固定源码导入、references 生成支持和公共注册表初始化，使待实现的资源具备可生成、可测试的工作基线。公共文件由主控拥有：`extensions/pstack/index.ts`、`package.json`、`docs/port-map.json`、`docs/source-files.json`、`docs/upstream-inventory.json`、`scripts/generate-pi-resources.mjs`、`scripts/check-package.mjs`、`scripts/generation.test.mjs`、`README.md`、`docs/*.md`、`AGENTS.md`、`TASKS.md`、发布/CI/类型检查配置。源归档由主控按固定 SHA 导入。主控负责合并后将所有已核实的技能依赖、disposition、入口、命令与测试接入公共文件。

之后最多三个实现分支并行，均从准备完成的最新 main 创建：

1. `next/coverage`：第 1、2、4 项。仅修改下列源模板及各自生成输出：poteto-mode/SKILL.md；how、poteto-help、figure-it-out、blast-radius、benchmark-checklist、teach、show-me-your-work、create-verification-skill、maintain-verification-skill、principle-explain-the-number、arena、interrogate、swarm、reflect、why、architect 的 SKILL.md；runtime-forensics、trace-forensics、visual-parity 的 playbook；这些技能的专属 references。测试仅 `scripts/coverage.test.mjs`。准确新建 references 路径在主控准备阶段登记后冻结，交接列出逐文件白名单。不改注册表或生成器。
2. `next/runtime`：第 3、8 项及第 10 项中非入口的类型声明。仅修改 `extensions/pstack/runtime.mjs`、`extensions/pstack/loop.mjs`、`extensions/pstack/config.mjs` 的必要 JSDoc/相关运行时职责；测试与验收仅 `scripts/runtime-next.test.mjs`、`scripts/check-parallel-roles.mjs`、`scripts/check-abort-state.mjs`。入口事件和 /setup-pstack 接线由主控集成。若实际公共 API 无法支持所需行为，先报告，不修改依赖包或绕过原有调用协议。
3. `next/orchestration`：第 6 项。仅修改 orchestrate、multi-phase-plan、babysit 的源模板及对应生成 playbook；新增 `docs/templates/pstack-plan.md`、`docs/templates/pstack-pr.md`、`scripts/check-plan.mjs`、`scripts/check-plan.test.mjs`。不修改 poteto-mode 入口模板、其他技能 references、公共注册表或 package.json。

第 5、7、9、11 项及第 10 项的 index.ts 部分由主控在合并后串行完成。多代理内容在依赖角色映射时，先恢复上游方法正文；调用示例及真实角色验收在 runtime 合入后由主控串行接线，不在并行期间依赖另一个未合入分支。

建议合并顺序：`next/runtime` → `next/coverage` → `next/orchestration` → 主控入口、注册表、依赖、文档、严格类型及综合验收 → 新版本发布。若预备阶段发现无法建立不依赖其他分支的绿色基线，调整为串行批次并报告，不强行并行。
