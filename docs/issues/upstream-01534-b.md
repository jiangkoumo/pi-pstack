# 迁移 statechart TypeScript 编译器与 Pi 执行边界

## 需求

把 Pi statechart 入口接到目标版本编译器，禁止自动安装 TLC/Java/mise；拦截必须在派生 worker 生效。迁移新版参数、view、report/TLC 日志和 SVG 渲染，明确旧参数移除提示，验证取消及输出清理。

## 允许修改

- adapters/pi/statechart/**
- scripts/statechart-adapter.test.mjs、scripts/statechart-sync.test.mjs
- scripts/check-statechart-png.mjs、scripts/check-statechart-svg.mjs
- scripts/fixtures/statechart-sync/**、scripts/fixtures/statechart-no-renderer/**
- .github/workflows/statechart-compat.yml
- docs/validation-upstream-01534-b.md

## 依赖与待验证

启动前由主控准备固定上游 statechart 原文、清单/生成器、fast-check 测试依赖及新生成脚本，使子 worktree 有一致可测基线。子代理不改 upstream/**、skills/** 或共享清单。若开发发现需要增加适配模块或主控修改生成规则，报告具体内容后等待依赖更新。

Node TS 加载和 worker hook、TLC 版本/沙箱兼容、新报告未检查规则语义均待验证。Node 现有最低版本 22.19，不新增 Bun/Deno 支持。

## 验收

真实 TLC 正确/错误模型、CounterInstance 完整动作名与 PROPERTY 循环、500 状态预算内外、未检查规则、缺依赖和冲突配置、非空输出目录、SIGINT/SIGTERM/SIGKILL 进程组清理；实际 SVG 与缺渲染器降级。保留 verification_exec 既有权限，不扩大执行范围。记录本机结果；CI 矩阵由主控取得实际结果，不能把 workflow 文件当通过证据。交付前 fresh-context 只读审阅由主控安排。

## 固定来源与边界

目标 cursor/plugins@519d36aa98955bf680db01bcde5fdfba686dc901。每任务独立 T3 Code worktree/分支，分支名包含 Issue 编号；开工先读取 Issue、确认不在 main，并执行 npm test 记录基线。不得修改未列出的路径，不得改全局配置、发布、推送、合并、rebase 或启动其他代理。需要扩大范围立即联系主控，由主控向用户报告。

共享的来源指纹/清单、生成器、package.json/lock、README、CHANGELOG、AGENTS.md、帮助/recipes 由主控处理。生成文件只由源生成，源和输出属于同一任务；生成前确认不会带入范围外变动。

文件读取/搜索/写入使用宿主专用文件工具；若使用 Pi 工具必须遵守 read/ffgrep/fffind/edit/write 和 codemode 批量读取门禁，不能用 shell 读写文件。bash 仅执行程序/Git，显式 cwd，未知输出只汇总退出码、失败摘要和输出路径。一个目录只有一个 writer。

## 交付

报告完成内容、实际命令与退出码、测试通过/失败/跳过数、真实行为验证、未验证与阻碍。修 bug 先证明回归修前失败，再修后通过；纯文字不加镜像测试。同一失败修两次仍未通过就停止。检查后一个任务一个 commit，message 带 Fixes #实际编号；不推送。主控汇总 git log main..分支 --oneline 与 git diff main...分支 --stat，提出合并顺序，待用户确认。
