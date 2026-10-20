# pi-pstack 协作规则

## 项目定位

本项目将 pstack 移植为 Pi package。先读 README.md、docs/sources.md 与 docs/migration-plan.md。当前已完成 P0 至 P4 主路径闭环与验收（P4 发布未授权、P5 延期）；不能将规划命令写成已实现功能。接入方案见 docs/integration-decisions.md。

## 来源与范围

- 上游基线以 docs/sources.md 和 docs/upstream-inventory.json 中的固定 SHA 为准；不静默跟随 main。
- 导入上游内容时保留作者和 MIT 声明，并记录哪些部分发生了适配。
- 可审阅、可验证的最小改动优先；首期聚焦单代理工程闭环。
- 本次建档不是安装、发布、推送或执行自动合并的授权。

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

- 文档修改检查相对链接、来源、状态描述与 diff；无需为纯文字新增实现镜像测试。
- 实现修改运行最相关的检查，并用真实任务验收宣称支持的工作流。
- 不修改用户现有 Pi 全局配置来证明安装；优先使用隔离配置环境。
- 交付记录已完成、实际验证结果、未完成及具体阻碍。

## 项目约定
- 检查命令：npm install && npm run check，提交前必须通过，还要跑 git diff --check。
- adapters/pi/overrides/*.md.template 是源文件，生成的 Markdown 不要手改。
- 不要提交安装时生成的 package-lock.json。commit 前用 git status 确认没有夹带无关的文件。
- 同一个失败修了两次还没过，就停下来报告证据，不要继续试。

## 并行开发（仅在我明确要求并行时使用）
任务来源可以是 BUGS.md、TASKS.md 或者一份功能说明，必须先 commit 到 main。
如果你在一个从 main 拉出来的 worktree 里，并且被分配了任务，你就是子 agent，只看「子 agent」和「所有人」这两部分。

主控：
- 按改动的文件和模块拆任务，两个 worktree 不能改同一个文件（包括生成的文件和它的源文件）。有依赖关系的任务不要并行，最多开 3 个。
- 注册表、入口 index、CHANGELOG 这类共享文件不分给子 agent，由主控在合并后统一修改。
- 开工前先把分工方案给我看：每个分支的任务、允许修改的文件和建议的合并顺序。我确认后再开。
- 只用 herdr worktree create / remove，从 main 的最新提交拉分支。派任务时把允许修改的文件列表写进任务说明里。
- 有任何 agent 变成 blocked 就先告诉我，不要替我回答。
- 全部完成后汇总各子 agent 的报告，并附上每个分支的 git log main..<分支> --oneline 和 git diff main...<分支> --stat。
- 我确认后按顺序逐个合并：第二个分支开始，每个先 rebase 到最新的 main 并重新跑检查，通过了再合并。全部合完后更新任务文件里的完成状态。

子 agent：
- 先跑基线检查。只改分配给自己的文件，不要改 AGENTS.md 和任务文件。
- 修 bug：补一个修前失败、修后通过的测试。加功能：给新行为加测试。
- 任务说明和实际情况冲突时，以实测为准，停下来报告，不要自己扩大范围。需要改不属于自己的文件时，也停下来报告。
- 检查通过后按任务分开 commit。
- 最后按以下格式报告：完成了哪些（每项的改动和原因），测试结果（通过数和失败数），没完成的或者和任务说明不一致的地方，commit hash。

所有人：合并、rebase、推送、删 worktree、删分支，都必须等我确认。
