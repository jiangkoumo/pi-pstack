# 历史检查快照

`historical-check.mjs` 是第二轮审阅完成时实际存在的 check-package.mjs 原文，包含源文档已发布便放过目标缺失的错误分支。仅供回归重放，不是命令入口。

同类错误有两次实际审阅记录：第一次包清单漏掉 README 所链接的 docs 和 AGENTS.md；补齐后，第二次发现 docs/integration-decisions.md 所链接的 scripts/check-subagent-integration.mjs 仍未打包。两次都是已发布文档引用未发布文件。项目未有 Git 提交，证据来自本项目两轮独立审阅，不将快照说成 Git 历史。
