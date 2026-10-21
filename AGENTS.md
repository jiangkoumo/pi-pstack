# pi-pstack 协作规则

## 项目定位

本项目将 pstack 移植为 Pi package。先读 README.md、docs/sources.md 与 docs/migration-plan.md。当前进度以 docs/migration-plan.md 为准；不能把规划中的命令写成已实现的功能。接入方案见 docs/integration-decisions.md。

## 来源与范围

- 上游基线以 docs/sources.md 和 docs/upstream-inventory.json 中的固定 SHA 为准；不静默跟随 main。
- 导入上游内容时保留作者和 MIT 声明，并记录哪些部分发生了适配。
- 可审阅、可验证的最小改动优先；首期聚焦单代理工程闭环。

## 实现约束

- 按实际安装版本阅读 Pi 文档、类型与示例后再写扩展。
- 技能按需读取；扩展处理命令和状态，避免无条件每轮注入整套技能。
- agents/ 定义在 session_start 通过 pi-subagents 0.79.2 的公开事件 pi-subagents:runtime-agent-register:v1 注册；使用 pstack 命名空间，不复制到全局目录，不再通过 pi.subagents.agents 重复导出。角色模型与 thinking 绑定在 agent 定义，用户 agentOverrides 按宿主优先级覆盖。缺少兼容扩展时明确提示，保持单代理技能可用。
- 诊断脚本中的内部模块路径仅用于当前版本探针；发布代码依赖公开包清单或公开事件契约。
- 保持一个工作目录/工作树只有一个 writer；reviewer 只读。派生任务应明确权限、路径和验收证据。
- 模型必须来自实际可用列表；遵守用户已有偏好，不硬编码上游 Cursor 模型为不可覆盖默认值。
- 本地操作者的 ego-browser 和模型配置属于环境适配，不假设其他用户已安装。
- 不让修改、构建或仅加载成功冒充真实行为验证。

## 检查与交付

- 检查命令：干净 checkout 执行 npm ci && npm test；依赖变更时先 npm install 更新锁文件。提交前必须通过，并跑 git diff --check。
- 源文件与生成文件：adapters/pi/overrides/*.md.template 是源文件，不要直接改生成出来的 Markdown。
- 提交 package-lock.json 以支持干净 clone 的 npm ci；依赖变更同时更新 package.json 与锁文件。commit 之前用 git status 确认没有带上无关文件。
- 同一个失败修了两次还没过，就停下来，带着证据报告，不要再继续试。
- 不可逆操作必须先等我确认：全局安装或装进我的 Pi 配置、发布、合并、rebase、推送、删除 worktree 或分支、删除未提交的改动。在仓库内跑 npm install，以及任务范围内的删文件，不需要确认。
- 文档修改检查相对链接、来源、状态描述与 diff；无需为纯文字新增实现镜像测试。
- 实现修改运行最相关的检查，并用真实任务验收宣称支持的工作流。
- 不修改用户现有 Pi 全局配置来证明安装；优先使用隔离配置环境。
- 交付记录已完成、实际验证结果、未完成及具体阻碍。

## 子 agent 启动规则

- 小任务可以用 subagent 插件：只读的工作（查代码、review、调研）随时可以用。要改文件的，同一时间最多一个，而且不开新分支。
- 我要求并行开发或者用 Herdr pane 时：每个分支先用 herdr worktree create 建 worktree，再在这个 worktree 里新开一个可见的 pane，用 herdr agent start 启动子 agent，用 herdr agent prompt 派任务，不要用 subagent 插件。派完后把每个 pane 对应的 issue 编号、分支和 worktree 路径列给我。

## 并行开发（只在我明确要求并行时使用）

### 角色
- 你在主仓库里接到这个任务：你是主控。
- 你在 Herdr worktree 里被分配了任务：你是子 agent。除了「主控」，其余规则都要遵守。

### 任务来源：GitHub Issues
- 不管我给的是什么（一段话、测试报告、链接），主控都先用 gh issue create 为每个任务建一个 issue，写清：问题或需求、来源证据、验收方式、所在分支、允许修改的文件。
- 来源里推测的结论，在正文里标成「待验证」。
- 建完把 issue 清单（编号、标题、分支、允许修改的文件）给我看，我确认后才开 worktree。
- 分支名带上 issue 编号，比如 fix/12-loop。一个分支对应一个 issue。
- 子 agent 开工前先用 gh issue view <编号> 读取任务，以 issue 内容为准。读不到就停下来报告，不要凭记忆开工。
- 子 agent 的 commit message 带上 Fixes #编号，推送到 main 后 issue 会自动关闭。

### 主控
- 按改动的文件和模块来拆任务，两个 worktree 不能改同一个文件，包括生成的文件和它的源文件。有依赖关系的任务不要并行，最多同时开 3 个。
- 共享文件（注册表、入口 index、CHANGELOG、AGENTS.md）不分给子 agent，由主控在合并后统一修改。
- 只用 herdr worktree create 和 herdr worktree remove，从 main 的最新提交拉分支。派任务时写明 issue 编号和分支名。
- 有子 agent 变成 blocked 时，先告诉我，不要替我回答。
- 全部做完后，汇总每个子 agent 的报告，并附上每个分支的 git log main..<分支> --oneline 和 git diff main...<分支> --stat，再给出建议的合并顺序。
- 我确认后按顺序逐个合并。从第二个分支开始，先 rebase 到最新的 main，重新跑检查，通过了再合并。
- 全部合并完后，把各子 agent 的报告和 commit 作为评论发到对应 issue。清理 worktree、分支和推送都要等我确认。

### 子 agent
- 先跑一次检查，记下基线。只改分配给你的文件。
- 修代码 bug：先补一个修复前失败、修复后通过的测试。加功能：为新行为补测试。文档任务：按「检查与交付」检查链接和状态描述，不需要补测试。
- 实际情况和 Issue 描述冲突，或者需要改不属于你的文件时，停下来报告证据，不要自己扩大范围。
- 检查通过后，一个任务一个 commit，commit message 带上 Fixes #编号，不要合并，不要 rebase，不要推送。
- 最后按这个格式报告：
  1. 完成了什么：每个任务的改动和原因
  2. 验证：测试通过数和失败数；做了哪些真实行为验证，哪些没做。
  3. 没完成的，或者和 Issue 不一致的地方
  4. commit hash
