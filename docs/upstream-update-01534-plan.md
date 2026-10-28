# 跟进 pstack 0.15.34 的实施计划

日期：2026-10-27。状态：已获实施授权，通用工具基线 44/44 通过；操作者改为要求 T3 Code 并行开发，任务 Issue 已建立，待确认任务清单后启动。

## 目标与固定来源

将当前已经支持的 pstack 能力对齐到上游 0.15.34，并审计新增的 ketchup-video。保持固定源码、Pi 适配层、生成资源三层结构，每批交付可复现的行为证据。

- 当前包：pi-pstack 0.3.14；当前本地 HEAD 为 `c2b50db`。
- 全包基线：`eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10`（上游 0.15.30）。
- statechart 局部基线：`076f4b2f57844ff9eb4ada914d4763884d40146e`，见 [已有同步验收](validation-statechart-sync.md)。
- 本次升级目标：[cursor/plugins@519d36aa98955bf680db01bcde5fdfba686dc901](https://github.com/cursor/plugins/commit/519d36aa98955bf680db01bcde5fdfba686dc901)，包含 0.15.34 版本提交以及随后的 statechart 测试修复。实施期间继续使用此 SHA；发现更新另记后续批次。
- [固定范围比较](https://github.com/cursor/plugins/compare/eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10...519d36aa98955bf680db01bcde5fdfba686dc901)。比较接口报告的 61 个提交属于整个 cursor/plugins 仓库，不能当作 pstack 独有提交数。

两端完整 recursive tree 均返回 truncated=false。按 `pstack/` 下 blob 的路径和 SHA 比较，438 个路径发生变化：statechart 内 418 个，目录外 20 个。此数字使用全包旧基线比较；实施 statechart 时还必须与其局部基线 `076f4b2f` 重算差异。文件数包含大量测试语料，不等于新增功能数。

## 已确认的兼容性判断

1. 项目 Node 下限已为 22.19.0，新版编译器的 Node 22.18+ 路径原则上满足；仍须实际验证最低版本和 Node 24。上游启动器另支持 Node 23.6+、Bun、Deno，本项目不因此自动扩大支持矩阵。
2. 新版入口是 `statechart SPEC.tla --config FILE --view FILE --out DIR`。旧的 from-spec/from-chart、图到 TLA+ 骨架、代码与规格比较、--cover/--fixed/--against、summary.json 与 --png 契约需要逐项列出替代或移除说明，不能靠替换文件保留旧能力宣称。
3. 新版核心产物为 report.md、chart.mmd 和 TLC 日志；超过 500 个状态时只画反例路径，无违反规则时可以不生成图。报告还会明确列出未检查的规则；只有退出码不足以证明每条规则均已验证。
4. 上游运行器在 run.ts 内部解析 TLC，缺少工具时会自动 mise install；当前 Pi 的 module hook 只拦旧版 tlc-tools.mjs，升级后不能继续依赖该拦截。新版会派生 worker，适配也必须在真实 worker 中生效。
5. 新渲染说明要求 Pele 1.9.0 输出 SVG，已经与旧的 Pele 1.8.0/resvg PNG 自动渲染流程分离。PNG 作为额外导出需求单独处理，不能继续承诺上游存在 --png。
6. 上游运行器默认 mise pin 是 TLC 1.7.4 + Java 25；本项目曾在 macOS 禁网 verifier 沙箱中发现 TLC 1.7.4 的 RMI 问题。继续使用操作者配置的 jar/Java，先以已验证的 TLC 1.8.0 + Java 21 做回归，再按实际结果记录版本范围。
7. 上游新增 fast-check 4.5.3 测试依赖；是否导入完整差分/模糊测试语料及怎样安装开发依赖，需要在 statechart 批次明确。测试依赖不能成为用户首次运行时的隐式安装。

## 批次 A：通用修复与适用性审计

此批先保留当前全包 SHA 和 statechart 局部 pin；将上游修复按来源 commit 吸收到 Pi 自有实现或模板，记录为适配层修复，不把来源清单提前改成全包已升级。最终基线在批次 B 原子切换。

| 上游变化 | 当前 Pi 情况 | 实施与验收 |
| --- | --- | --- |
| reflect 缓存防覆盖，#800 | 模板尚无明确的插件缓存复制规则；适配尾部已有外发授权门 | 在模板中说明安装缓存/生成资源的持久化目标；批准前展示完整目标，批准后编辑可维护副本或已知源码。项目维护遵守源码模板边界，用户局部定制使用 Pi 可发现的技能路径，并验证同名覆盖行为。不自动开 PR、推送或写 backlog。用临时安装路径验证升级后编辑仍保留。 |
| swarm 序号与结果表，#807 | 模板仍为 1、2、4、5，并引用 step 4 和悬空的 the table | 同步模板的编号与对应交叉引用，从源重新生成；检查链接和任务说明即可，无需为文字加镜像测试。 |
| check-plan 多反引号，#803 | Pi scripts/check-plan.mjs 检查结构化 pstack-plan，不运行上游 prose 标点检查 | 审核两者调用链和现有 fence 测试；若没有相同解析缺陷，记录不适用。不将 prose 正则塞入 JSON 计划门。 |
| watch-pr 截止时间，#802 | Pi main 已使用 min(interval, remaining) | 验证 interval 大于 timeout 时按剩余预算睡眠；已有有效测试则复用。只有发现实际缺陷才改实现。 |
| watch-pr Fork 同名 head，#801 | Pi watch-pr 是单 PR 快照/轮询，未发现上游 orderStack 实现 | 核实调用路径；没有相同的 stack discovery 时记录不适用。若其他 Pi 路径存在相同发现逻辑，再在所属路径补修前失败回归。 |
| orch 活跃 PR 优先，#804 | Pi orch 以 plan.md 和本地 units store 调度，与上游 PR 分支发现不同 | 核实实际 PR 解析；没有历史 PR 选择过程时记录不适用，不引入新发现功能。 |
| worktree-audit GNU stat/date，#805 | Pi 已改写为 Node/Git 审计，不读 Cursor transcript 时间 | 记录实现差异并复跑现有审计检查；不重新导入 Cursor transcript 遍历。 |

改动范围：相关 adapters/pi/overrides 模板、对应 scripts/*.mjs 和必要回归测试、生成资源、该批验收文档。保持来源注释能区分原基线与后续吸收的修复 commit。

退出条件：每条上游修复都有“已吸收 / 已有等价行为 / 不适用”的调用路径证据；实际代码修复有修前失败、修后通过的测试；相关检查、生成检查、保真门和 diff 检查通过。

## 批次 B：statechart 编译器迁移及全包基线切换

这是主要实现批次，顺序执行，并在交付前安排一次 T3 Code fresh-context 只读审阅。

### B1：来源与迁移契约

- 对目标 SHA、当前全包基线及 statechart 局部 pin 做目录级比较，列清新增、删除和保留路径。只删除清单列出的旧快照和生成文件，保留无关改动。
- 完整导入需要的 statechart 运行源码、render 参考文档及上游测试语料，记录每个源文件 Git blob 指纹与许可。
- 更新 docs/source-files.json、docs/upstream-inventory.json、docs/port-map.json 到同一个目标 SHA；消除已被全包新基线覆盖的 statechart sourceOverrides。同步其余变化的归档原文，更新新增 ketchup-video 的 inventory 条目，先标 deferred，不能因归档就宣称支持。
- 保持导入范围明确：cursor/plugins 的其他插件及官方 Claude Code 生成树不进入 Pi 运行包。
- 逐项写出旧入口、旧参数、映射模块、报告格式和图像输出的迁移表。保留 Pi 入口路径 `node <package>/adapters/pi/statechart/entry.mjs`；支持新版参数。对已移除的旧参数给出可执行的迁移提示，不静默忽略。

### B2：Pi 执行与生成边界

- 用最小适配重接新版 run.ts 的 TLC 解析：只用显式配置或已经安装的工具，拒绝冲突和非法路径；缺少时直接给出原因，不安装 mise/TLC/Java。
- 保持上游运行源码可对照；优先使用小型、匹配失败即停止的运行适配。验证 Node TS 加载、module hook 与新 worker 进程的交互，不能仅证明父进程入口加载成功。
- 保留与 verification_exec 一致的 jar 配置语义；沿用现有两个入口各自的职责，验证受限 verification_exec 的沙箱和参数门未退化。
- 显式纳入新增 TypeScript、render 参考文档和测试资源；调整生成器对 verbatim 与依赖路径的限制，使每项新增类型有清晰边界。更新旧路径的 sourceOverride 假设和相关生成测试。
- 修改 adapters/pi/statechart/skill-replacements.json、skill-tail.md 与入口说明，清除自动安装承诺和旧命令；生成 skills/，不直接编辑生成 Markdown。
- 同步 create-formal-verification-skill 的 #794 指令：通过技能名引用 statechart 读取 TLA+ 结果，不向新生成的验证技能复制容易过期的脚本参数。说明 statechart 可视化与受限 TLC 验证各自的运行方式。
- SVG 使用固定版本 Pele 1.9.0；在隔离缓存中验证生成与失败回退，保留 Mermaid 和模型结论。现有 PNG 检查改为新 SVG 验收；若继续提供 PNG，作为 Pi 明示的额外导出单独验收。

### B3：行为回归与平台矩阵

| 场景 | 必须取得的证据 |
| --- | --- |
| 最小正确模型 | 真实 TLC 完成、退出 0、报告与图一致；逐项核实 holds / not checked，不能把未检查当通过。 |
| 不变量失败 | 退出 1，最短反例路径与真实 TLC 结果一致；在真实代码或 fixture 行为中重放关键步骤。 |
| PROPERTY/INSTANCE 名称 | 使用上游 CounterInstance 语料，确认 C!Up 等完整动作名及循环；同时覆盖图预算内外。 |
| 状态预算 | 超过 500 状态的失败模型仅绘反例；大模型通过时无 chart.mmd 也应正常报告，不误报缺文件。 |
| 旧 CoverGap | 将旧 map 迁移为 view，核实状态/迁移含义；旧 --cover 用例改为新版显式隐藏步骤、可达性及披露行为，不保留已经取消的参数断言。 |
| 未检查规则 | 触及后续重跑边界或工具错误时明确列出未检查规则，不用首个成功结论覆盖。 |
| 依赖与权限 | 缺 jar、冲突路径、非法输入、输出目录非空、无渲染器均给出实际失败/降级结果；不能触发自动安装。 |
| 进程清理 | SIGINT/SIGTERM/SIGKILL 与 worker 失败，确认退出码、临时目录及进程组清理；真实 macOS 用例包括 #981 的回收等待。 |
| 渲染 | 真实 SVG 生成且内容与标记相符；Pele 不可用时展示 Mermaid 和原因。PNG 仅在明确支持后验证。 |
| Pi 集成 | 新会话调用生成技能，并生成一个 TLA+ 验证技能；实际执行文档命令、读取结果。复验 verification_exec 的真实 jar 正反例与拒绝路径。 |

检查更新涉及 scripts/statechart-adapter.test.mjs、scripts/statechart-sync.test.mjs、scripts/check-statechart-png.mjs、scripts/run-checks.mjs、相关 fixtures 和 .github/workflows/statechart-compat.yml。旧测试替换须说明行为变化，并保留对等的正确性覆盖。

普通 npm test 不隐式下载工具；无 TLC 的跳过必须显式计数。真实验收单独要求 TLC 和渲染依赖已配置，缺依赖算该项未完成。上游 fast-check 测试依赖如纳入，更新 package.json 与 package-lock.json，保持源码包支持 npm ci。

平台矩阵：Ubuntu/macOS × Node 22/24，另单测最低 Node 22.19.0 的入口。Bun/Deno 与 Windows 不在本轮支持声明中。先执行本机可用场景，再以实际 CI job 结果补齐平台证据。

退出条件：生成、来源指纹、保真门、真实 TLC/图像与取消回归均通过；独立审阅成立的问题已解决；README、sources、formal-verification、开发/兼容性文档和验收记录准确描述新能力。最后才能声明全包来源基线已切到目标 SHA；未完成的新增技能仍单独列出。

## 批次 C：ketchup-video 与帮助入口

- 先读取并保留上游技能，复用 Pi ketchup 的当前会话窗口及证据来源；窗口从调用 ketchup-video 前最后一条用户消息开始，不能复用更早 ketchup 的窗口。
- 实测当前 Pi 的视频附件/显示方式以及可用的本地渲染链，再决定具体实现；不把当前 T3 Code 的显示能力当作 Pi 已支持的证据。
- 视频在仓库外的 scratch 输出，最多 10 张幻灯片；使用真实截图、diff 或数据，不编造界面、状态或数字。保持决策项的命名一致。
- 验收真实 mp4：检查每页抽帧、文字可读时间、总时长和视频可播放性；通过实际 Pi 会话交付可访问的文件。视频失败时给出原因与待决策项，不能把 fallback 当视频完成。
- 不增加默认浏览器、全局工具或自动外发动作。依赖缺失时只报告所需能力。
- 验收通过后更新 port-map、help、recipes 与 README，并去掉 deferred 状态；若宿主无法显示或渲染链不可用，明确记录具体阻碍，保持已升级核心能力的交付独立。

退出条件：至少一条真实多轮会话完成 ketchup-video 端到端验证；输出窗口、事实来源、视频内容和等待用户的事项对应。仅有 Markdown 或占位视频不算支持。

## 执行顺序与协作

操作者已要求并行开发，主代理担任主控，使用 T3 Code 独立 worktree 与分支，一个目录一个 writer，同时最多三个开发任务。任务清单确认后，A 可先启动；主控准备好 B/C 的固定原文和生成依赖，再并行启动 B/C。存在依赖时等待对应准备完成，不让子代理自行修改共享文件。共享清单、生成器、包配置、README/CHANGELOG 由主控统一维护。

| 任务 | Issue | 分支名 | 主要范围 |
| --- | --- | --- | --- |
| A 通用修复与适用性审计 | [#45](https://github.com/jiangkoumo/pi-pstack/issues/45) | fix/45-upstream-common | reflect/swarm 模板与对应输出、四项 Pi 工具及测试、独立验收文档 |
| B statechart 编译器迁移 | [#47](https://github.com/jiangkoumo/pi-pstack/issues/47) | feat/47-statechart-compiler | statechart 适配目录、回归与 fixtures、兼容性 workflow、独立验收文档 |
| C ketchup-video | [#46](https://github.com/jiangkoumo/pi-pstack/issues/46) | feat/46-ketchup-video | 新技能模板与对应输出、独立验收文档 |

完整需求、允许路径、验收和待验证点已写入各 Issue；本地正文见 docs/issues/ 下的 upstream-01534-a.md、upstream-01534-b.md、upstream-01534-c.md。三个任务不能交叉修改文件；范围扩大由主控向操作者报告。

操作者已指定当前会话在 T3 Code：所有后续子代理使用 T3 Code delegate_task，先查实际可用 provider/model，遵守模型偏好。独立审阅为只读，brief 写清目标、允许路径、禁止修改、固定 SHA、验收证据、遇阻联系主代理；无需启动 Pi subagent 或 Herdr。当前编排选择不改变分发包的 Pi/ pi-subagents 产品集成。

操作者的并行开发请求适用全局并行工作流，已按其要求创建上述 GitHub Issue；启动子代理前仍须确认具体任务清单。各分支完成后由主控提供 log、diff stat 与建议合并顺序，操作者确认后逐个合并。全局安装、发布、推送、合并、rebase、删除 worktree/分支仍按项目授权规则执行。

## 验证门与后续维护

以下是实施时的待执行检查，本计划阶段没有运行，也不宣称通过：

1. 每批先跑最相关的现有检查，记录基线；修 bug 补可证明修前失败的回归，随后跑影响范围。
2. 改模板后执行 npm run generate，再执行 npm run check:generate；重复生成没有额外 diff。
3. 执行 npm run check:fidelity，维持现有整体至少 94%、逐文件至少 70% 的门槛；源内容和支持范围变化导致统计变化时解释原因，不降低门槛或用无关文本充数。
4. 提交前在干净 checkout 执行 npm ci --include=dev && npm test；依赖有变更先更新锁文件。执行 git diff --check，并核对实际打包资源。
5. 批次 B/C 各自完成上述真实任务验收，记录命令、退出码、工具版本、跳过项与证据路径。普通测试通过不能替代真实 TLC、渲染或宿主行为。
6. 同一失败两次修复后仍未解决时，按项目规则停止该项并报告证据；独立审阅默认最多三轮。

本次升级完成后，保留固定 SHA 的只读差异检查方法：同时比较整个 pstack 子树和 Pi 自有适配的调用路径；后续发现新版本先输出新增、行为变化、适配差异、验证范围，再单独更新基线，不自动追 main。

## 执行进度（2026-10-28）

操作者已确认并行开发，主控使用 T3 Code 原生子代理。共享文件由主控维护，一个目录一个 writer。

| 任务 | 分支 | 状态 |
| --- | --- | --- |
| A 通用修复与适用性审计 | `t3/sync-pstack-fixes-audit` | 已完成，未合并 |
| B statechart 迁移 | 子代理独立 worktree | 进行中 |
| C ketchup-video | 已有探针记录 | 阻塞于技能登记与真实多轮验收 |

A 已完成并复验：`npm test` 38/38 检查通过，相关测试 31 pass / 0 fail，生成检查 146 项无漂移，保真度 4467/4752 = 94.0025%。主控补充了 Pi 1.4.0 真实 `loadSkills` 探针，证实同名技能保留先发现者、并产生 collision 诊断，因此模板要求重载后核对实际解析路径、冲突时先报告并取得批准。分支含两个提交，共 7 个文件。

目标 statechart 源码已完整取得并通过固定指纹校验：407 个文件（含 31 个运行与文档文件、376 个测试语料）逐个 `git hash-object` 与目标 tree 的 blob 一致，0 处不符。快照暂存在仓库外 `/tmp/pi-pstack-01534-source/`，尚未写入 `upstream/`，因为批量清单重写需与生成器、port-map 一起原子提交；在此之前不声明仓库已升级到目标基线。

C 的探针已生成 7.5 秒、1280×720、H.264、无音轨的两页 MP4，抽帧核对每页文字量与稳定阅读时间达标；Pi 1.4.0 内建消息与渲染器未发现通用视频嵌入契约，只验证到 Markdown 路径引用。生成器会拒绝未登记模板，因此该技能尚不能进入分发资源。

## 计划阶段证据与未完成项

实际已做：读取当前清单、生成器、statechart 入口与测试、相关 Pi 工具实现和既有验收；GitHub API 获取两端完整 tree、目标 statechart skill/run.ts/CLI/启动器/render 文档/测试 package 清单、ketchup-video 原文，以及相关修复的 patch。成功 API 命令退出码 0；部分请求遇到间歇网络失败，重试取得所需内容。

未完成：全量原文下载、升级实现、自动化与真实行为验收、独立审阅、CI 矩阵、发布。本轮只交付实施计划。

具体风险待验证：worker 中的 TLC 拦截与 Node TS 加载、TLC 版本和沙箱兼容、Pele SVG 输出与 Pi 视频交付能力。实施前先完成相应小探针，再确定局部写法；没有证据时保持未验证状态。
