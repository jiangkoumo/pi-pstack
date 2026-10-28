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

## 子 agent 与并行开发

通用规则见全局 `~/.pi/agent/AGENTS.md`「子 agent 与并行开发」。本项目补充：

- 生成文件和它的源文件（如 `adapters/pi/overrides/*.md.template`）算同一个文件，不能拆给两个任务；注册表也算共享文件，留给主控。
- 子 agent 开工前先跑一次 `npm test` 记下基线。修 bug 先补一个修复前失败、修复后通过的测试；加功能为新行为补测试；文档任务按「检查与交付」核对链接和状态描述。
- 子 agent 报告里写明测试通过数和失败数，以及做了哪些真实行为验证、哪些没做。
- 主控汇总时再附上每个分支的 `git diff main...<分支> --stat`。
