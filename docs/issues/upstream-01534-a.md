# 同步 pstack 0.15.34 通用修复并审计适用性

## 需求

吸收 reflect #800 缓存防覆盖与 swarm #807 编号/引用修复；核对 #801–805 在 Pi 自有脚本中的适用性，只修证据成立的问题。保留当前全包 SHA 和 statechart 局部 pin。

## 允许修改

- adapters/pi/overrides/skills/reflect/SKILL.md.template、skills/reflect/SKILL.md
- adapters/pi/overrides/skills/swarm/SKILL.md.template、skills/swarm/SKILL.md
- scripts/check-plan.mjs、scripts/check-plan.test.mjs
- scripts/watch-pr.mjs、scripts/watch-pr.test.mjs
- scripts/orch.mjs、scripts/orch.test.mjs
- scripts/worktree-audit.mjs、scripts/worktree-audit.test.mjs
- docs/validation-upstream-01534-a.md

## 验收

每项修复记录已吸收/已有等价行为/不适用及调用路径。验证 reflect 的持久化目标、Pi 同名技能发现和升级后保留：先读实际安装版本文档，不能假设项目技能自动覆盖包技能。已有 44 条相关测试的主控基线全部通过。新增有意义的截止时间边界验证，必要时只补测试。生成两份资源，相关检查、来源/生成/保真与 diff 检查通过。真实宿主探针如需新文件先报范围。

## 固定来源与边界

目标 cursor/plugins@519d36aa98955bf680db01bcde5fdfba686dc901。每任务独立 T3 Code worktree/分支，分支名包含 Issue 编号；开工先读取 Issue、确认不在 main，并执行 npm test 记录基线。不得修改未列出的路径，不得改全局配置、发布、推送、合并、rebase 或启动其他代理。需要扩大范围立即联系主控，由主控向用户报告。

共享的来源指纹/清单、生成器、package.json/lock、README、CHANGELOG、AGENTS.md、帮助/recipes 由主控处理。生成文件只由源生成，源和输出属于同一任务；生成前确认不会带入范围外变动。

文件读取/搜索/写入使用宿主专用文件工具；若使用 Pi 工具必须遵守 read/ffgrep/fffind/edit/write 和 codemode 批量读取门禁，不能用 shell 读写文件。bash 仅执行程序/Git，显式 cwd，未知输出只汇总退出码、失败摘要和输出路径。一个目录只有一个 writer。

## 交付

报告完成内容、实际命令与退出码、测试通过/失败/跳过数、真实行为验证、未验证与阻碍。修 bug 先证明回归修前失败，再修后通过；纯文字不加镜像测试。同一失败修两次仍未通过就停止。检查后一个任务一个 commit，message 带 Fixes #实际编号；不推送。主控汇总 git log main..分支 --oneline 与 git diff main...分支 --stat，提出合并顺序，待用户确认。
