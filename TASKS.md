# pi-pstack 下一轮修复清单（基于 0.1.1 复测）

状态：需求已记录，分工方案待操作者确认；尚未创建 worktree 或开始实现。

判定标准：与上游 pstack v0.15.25 功能对等，不要求代码/文件 1:1。固定导入基线仍为 `f713f14203cd6420cec13cd7c55c32d598dbab68`，不跟随浮动 main。

## P0 功能覆盖（收益最大）

### 1. 恢复 poteto-mode 路由

- [ ] 修改 `skills/poteto-mode/SKILL.md` 对应源模板，补回上游 Non-negotiables 的路由触发：how、architect、swarm/arena、interrogate、unslop、technical-writing、no-comments、benchmark-checklist。
- [ ] Principles index 补全 24 条（报告称现在只有 8 条可达）。
- [ ] 补回 Autonomy 段：always-pause 清单、“going to bed / run until done”覆盖规则，以及回复写作规则。
- [ ] Cursor 专属部分改写为 Pi 对应物，不直接删去方法内容。
- [ ] 验收：SKILL.md 链接到全部 24 个 principle-* 和上述技能；用设计类请求运行 poteto-mode，模型主动读取 architect。

### 2. 将约 11 个“假 substitute”改为 ported

- [ ] how、poteto-help、figure-it-out、blast-radius、benchmark-checklist、teach、show-me-your-work、verification 类 2 个、runtime-forensics/trace-forensics、visual-parity。
- [ ] 以固定上游实际内容审阅依赖，替换工具和路径，保留方法；不要仅依据“纯 prompt”的描述认定无依赖。
- [ ] 同步 `docs/port-map.json` disposition；保留 substitute 的条目，其替代物必须在技能正文中被提及。
- [ ] 验收：Pi 能发现这些技能；benchmark-checklist 包含至少 5 次交替运行、限制因素、上限推算、报告格式；principle-explain-the-number 不再写“not bundled”。

注：按固定目录的名字计数，上述实际为 9 个独立技能（含 create-verification-skill、maintain-verification-skill）及 3 个 playbook，共 12 个条目；数量不是删减需求的依据。

## P1 多代理与角色

### 3. 并行子代理走角色映射

- [ ] 扩展 `runtime.mjs` 的 applySubagentRole，从单个 input.agent 覆盖每个并行/顺序子任务；要求单测覆盖 tasks 和 chain。
- [ ] prose、verification：接入具体使用场景，或者从 ROLES 和 /setup-pstack 移除；兼容性及最终决定须记录。
- [ ] 验收：interrogate/arena/swarm 并行启动的每个子代理都使用配置的 review/code 模型，有真实启动证据。
- [ ] 先核对本机 pi-subagents 0.79.2 的实际公共 API：目前是命名 parallel workflow 的 args.tasks 及脚本 runs.run/runs.all；旧 tasks/chain 字段兼容测试不能冒充现行脚本流程验收。发现规格冲突先报告，不能静默扩大协议范围。

### 4. 补回多代理方法内容

- [ ] arena、interrogate、swarm、reflect、why、architect：补回 reviewer/explorer prompt、评分 rubric、why 来源指南、reflect 审查角色；可放 references/ 按需读取。
- [ ] 验收：逐项对照固定上游概念清单，保留率明显提升（复测报告称 architect 为 2/28）；保存可核对的差异及实际内容，不用关键字计数替代语义审阅。

### 5. pi-subagents 依赖

- [ ] 扩展加载或 /poteto-mode status 检测 subagent 工具，缺失时明确提示。
- [ ] 评估 peer/optional 依赖声明，避免强制安装覆盖操作者的既有配置。

## P2 长程编排

### 6. orchestrate / multi-phase-plan / babysit 可执行流程

- [ ] 提供计划模板、PR 模板、check-plan 检查器。
- [ ] orch / watch-pr 使用 /loop + gh CLI 或脚本替代，在 playbook 写明真实用法与授权边界。
- [ ] 验收：multi-phase-plan 产出符合模板的计划并通过 checker；实际跑通过/拒绝案例。

## P3 小问题

### 7. 模式首次开启的持久化提示

- [ ] 首条消息前 /poteto-mode on 在无会话文件时强制落盘，或明确警告进程结束会丢失；不能仅返回 persistent:false。

### 8. abort 后 loop 状态

- [ ] 同一进程 abort 后 /loop status 应立即为 interrupted，不继续显示 running；真实宿主回归覆盖。

### 9. docs 死链

- [ ] 复核报告中的 41 条死链，含 docs 内 scripts/...、migration-plan.md 的 release.mjs 引用及 validation-p4.md 的 release.mjs 引用。
- [ ] 同时检查 Markdown 链接与行内代码路径，修复可复现项；未复现项记录证据，不能制造修前失败。

### 10. TypeScript 严格模式

- [ ] 重现并修复报告的 4 处类型错误：index.ts 的 paths 索引，以及 decideNextStep 参数 JSDoc 类型；以实际编译结果为准。

### 11. 测试依赖

- [ ] 测试依赖 jiti 和 Pi peer 包，发布包直接跑测试会报 MODULE_NOT_FOUND；补 devDependencies 或 README 写明安装测试依赖的流程。

## 统一验收与发布

- [ ] 各 agent 开工先跑 `npm install && npm run check`；每项修复有修前失败、修后通过证据，新功能有行为测试。
- [ ] 提交前 `npm install && npm run check`、`git diff --check`、`git status`；不提交 package-lock.json。
- [ ] 同一失败修了两次仍不过，停止并报告证据。
- [ ] 每分支报告改动与原因、通过/失败数、未完成或规格不符项、commit hash。
- [ ] 主控汇总 `git log main..<branch> --oneline` 和 `git diff main...<branch> --stat`，待操作者确认后逐个合并。
- [ ] 从第二分支开始，先 rebase 最新 main 并重新跑检查；全部合完更新本文件完成状态。
- [ ] 在同一 Pi 环境和既有脚本上回归，并新增路由与并行角色的真实运行验收，执行独立只读审阅。
- [ ] 完成后发布新版本并验证 registry/安装；建议 0.2.0（待分工确认），不在验收前发布。推送、tag 推送、worktree/分支清理仍须操作者明确确认。

## 待确认的实施分工

主控先串行完成必要的固定源码导入、references 生成支持和公共注册表初始化，使待实现的资源具备可生成、可测试的工作基线。公共文件由主控拥有：`extensions/pstack/index.ts`、`package.json`、`docs/port-map.json`、`docs/source-files.json`、`docs/upstream-inventory.json`、`scripts/generate-pi-resources.mjs`、`scripts/check-package.mjs`、`scripts/generation.test.mjs`、`README.md`、`docs/*.md`、`AGENTS.md`、`TASKS.md`、发布/CI/类型检查配置。源归档由主控按固定 SHA 导入。主控负责合并后将所有已核实的技能依赖、disposition、入口、命令与测试接入公共文件。

之后最多三个实现分支并行，均从准备完成的最新 main 创建：

1. `next/coverage`：第 1、2、4 项。仅修改下列源模板及各自生成输出：poteto-mode/SKILL.md；how、poteto-help、figure-it-out、blast-radius、benchmark-checklist、teach、show-me-your-work、create-verification-skill、maintain-verification-skill、principle-explain-the-number、arena、interrogate、swarm、reflect、why、architect 的 SKILL.md；runtime-forensics、trace-forensics、visual-parity 的 playbook；这些技能的专属 references。测试仅 `scripts/coverage.test.mjs`。准确新建 references 路径在主控准备阶段登记后冻结，交接列出逐文件白名单。不改注册表或生成器。
2. `next/runtime`：第 3、8 项及第 10 项中非入口的类型声明。仅修改 `extensions/pstack/runtime.mjs`、`extensions/pstack/loop.mjs`、`extensions/pstack/config.mjs` 的必要 JSDoc/相关运行时职责；测试与验收仅 `scripts/runtime-next.test.mjs`、`scripts/check-parallel-roles.mjs`、`scripts/check-abort-state.mjs`。入口事件和 /setup-pstack 接线由主控集成。若实际公共 API 无法支持所需行为，先报告，不修改依赖包或绕过原有调用协议。
3. `next/orchestration`：第 6 项。仅修改 orchestrate、multi-phase-plan、babysit 的源模板及对应生成 playbook；新增 `docs/templates/pstack-plan.md`、`docs/templates/pstack-pr.md`、`scripts/check-plan.mjs`、`scripts/check-plan.test.mjs`。不修改 poteto-mode 入口模板、其他技能 references、公共注册表或 package.json。

第 5、7、9、11 项及第 10 项的 index.ts 部分由主控在合并后串行完成。多代理内容在依赖角色映射时，先恢复上游方法正文；调用示例及真实角色验收在 runtime 合入后由主控串行接线，不在并行期间依赖另一个未合入分支。

建议合并顺序：`next/runtime` → `next/coverage` → `next/orchestration` → 主控入口、注册表、依赖、文档、严格类型及综合验收 → 新版本发布。若预备阶段发现无法建立不依赖其他分支的绿色基线，调整为串行批次并报告，不强行并行。
