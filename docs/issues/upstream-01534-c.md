# 审计并适配 ketchup-video 的 Pi 视频交付

## 需求

移植上游 ketchup-video；复用现有 Pi ketchup 的会话窗口和证据来源，窗口从调用前最后一条用户消息开始。在仓库外产出真实、可播放的静音 mp4，最多 10 页；渲染失败明确报告并给待决策项。

## 允许修改

- adapters/pi/overrides/skills/ketchup-video/SKILL.md.template
- skills/ketchup-video/**（主控登记后由生成器生成）
- docs/validation-upstream-01534-c.md

## 依赖与待验证

主控先准备并登记固定原文与生成入口；其他清单和 help/recipes 不由子代理修改。先验证实际 Pi 视频附件或文件交付能力、现有可用渲染程序，再确定实现。当前 T3 Code 能显示视频不等于 Pi 可以。若需要新增脚本或依赖，带证据向主控提出范围变更；不得自动安装全局工具。

## 验收

至少一条真实多轮 Pi 会话交付 mp4；逐页抽帧核对事实、状态、每三个新增词至少一秒、动作选项命名与窗口。仅脚本加载或文字 fallback 不算支持。宿主/渲染受阻时说明具体证据并保留 deferred，不编造通过。视频文件放 scratch，不把输出二进制提交仓库。

## 固定来源与边界

目标 cursor/plugins@519d36aa98955bf680db01bcde5fdfba686dc901。每任务独立 T3 Code worktree/分支，分支名包含 Issue 编号；开工先读取 Issue、确认不在 main，并执行 npm test 记录基线。不得修改未列出的路径，不得改全局配置、发布、推送、合并、rebase 或启动其他代理。需要扩大范围立即联系主控，由主控向用户报告。

共享的来源指纹/清单、生成器、package.json/lock、README、CHANGELOG、AGENTS.md、帮助/recipes 由主控处理。生成文件只由源生成，源和输出属于同一任务；生成前确认不会带入范围外变动。

文件读取/搜索/写入使用宿主专用文件工具；若使用 Pi 工具必须遵守 read/ffgrep/fffind/edit/write 和 codemode 批量读取门禁，不能用 shell 读写文件。bash 仅执行程序/Git，显式 cwd，未知输出只汇总退出码、失败摘要和输出路径。一个目录只有一个 writer。

## 交付

报告完成内容、实际命令与退出码、测试通过/失败/跳过数、真实行为验证、未验证与阻碍。修 bug 先证明回归修前失败，再修后通过；纯文字不加镜像测试。同一失败修两次仍未通过就停止。检查后一个任务一个 commit，message 带 Fixes #实际编号；不推送。主控汇总 git log main..分支 --oneline 与 git diff main...分支 --stat，提出合并顺序，待用户确认。
