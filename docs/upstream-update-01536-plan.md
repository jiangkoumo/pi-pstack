# pstack 0.15.36 同步状态（U36）

六个任务已按顺序合入 `u36-merge`，固定来源统一为 `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`（pstack 0.15.36），`sourceOverrides` 已清空。集成验收结果由操作者任务目录中的 `U36-MERGE-RESULTS.md` 记录；未发布。

- [原实施计划与逐文件处置记录](validation-upstream-01536-plan.md)：保留全部 29 个上游差异路径、额外 10 个快照更新路径及原任务划分。
- [历史删除映射](validation-upstream-01536-removed.json)：7 个上游删除项及对应 Pi 产物；不再作为生成器的过渡输入。
- [来源与固定版本](sources.md)、[sha256 清单](upstream-manifest.json)、[当前适配映射](port-map.json)。

同步内容包括 agentic Orchestrate、基于 arena 的对抗审阅、Autopilot-stack 的不合并交付、测量前决策说明、带字幕视频要求，以及 Pi 的 git_read 修复与 1.5.0 schema 兼容测试。保留单目录单 writer、模型配置和外部操作授权门禁。
