# ketchup-video Pi 适配与验收（Task C / #46）

## 已完成与来源

本分支仅新增 `adapters/pi/overrides/skills/ketchup-video/SKILL.md.template` 和本记录。模板包含 `name: ketchup-video`、非空 description、`disable-model-invocation: true`、`license: MIT`，保留上游作者及 MIT 来源，规定仓库外 scratch 渲染、成片抽帧、阅读时长、路径交付和失败回退。

任务指定上游为 Lauren Tan 的 `pstack/skills/ketchup-video/SKILL.md`，commit `519d36aa98955bf680db01bcde5fdfba686dc901`。本次通过 Pi `read` 只读读取操作者提供的 `/Users/jiangkoumo/Documents/pi-pstack/upstream/pstack/skills/ketchup-video/SKILL.md`，其 Git blob 为 `69aa72aba763ae1836f8440d88e03e2928eb3719`（`git hash-object`，退出码 0）。该本地仓库没有可解析的指定提交对象，因此未独立核实该文件与远端 SHA 的对应；SHA 归属依据任务输入。没有连接 GitHub。

依赖沿用已存在的 [ketchup 模板](../adapters/pi/overrides/skills/ketchup/SKILL.md.template) 的决策项规则，许可见 [pstack MIT](../LICENSES/pstack.txt)。本次不修改共享注册表、固定上游归档或生成的 `skills/`；这些是主控集成范围。专项加载和媒体验证通过，不代表分发接线或完整技能遵循已验收。

## Scratch 与解析规范加载

本次唯一 scratch：`/tmp/pi-pstack-ketchup-c-OwERio`，位于仓库和所有 worktree 外。使用 `write` 创建验收脚本，以文件管理命令 `cp` 将新模板原样复制为 `skills/ketchup-video/SKILL.md`，并复制现有 ketchup、bro 和 MIT 文件形成相对目录结构。未写 Pi 全局配置、未全局安装。

验证依据为实际安装的 Pi 1.4.0 `docs/skills.md`、`dist/core/skills.d.ts` 和 `dist/core/skills.js`。探针 `load-skill.mjs` 直接调用该安装的 `loadSkills`、`parseFrontmatter`、`formatSkillsForPrompt`，隔离设置 `includeDefaults: false`、scratch agentDir 与 skillPaths。这些内部模块路径仅用于当前版本验收，不成为发布依赖。

在 scratch 执行 `node load-skill.mjs`：退出码 0，8 项断言通过、0 失败。加载的技能为 `bro`、`ketchup`、`ketchup-video`，diagnostics 为 `[]`；新技能 explicit-only 为 true，license 为 MIT，名称与目录相符，名称及 description 符合长度与字符规范；自动提示格式化结果长度为 0。这是实际 Pi Agent Skills 加载器验证，没有执行模型请求或验证交互命令菜单。

## 视频参数与生成

在 scratch 执行 `python3 render.py`，退出码 0。使用本机 Python/Pillow 12.3.0 生成每一帧，FFmpeg 8.1 编码，未录屏、未启动应用。视频为合成的渲染流程示意，不冒充实际产品截图或其他会话中的工作成果。三页复用同一张箭头连接的流程图，逐页添加与节点相连的标注，无列表或状态表。

核心编码参数：`ffmpeg -y -v error -framerate 30 -i frames/%03d.png -c:v libx264 -pix_fmt yuv420p -an -movflags +faststart catch-up.mp4`。

随后运行 FFprobe，检查成片的 stream 与 format；脚本 6 项断言通过、0 失败。

| 参数 | 成片实测 |
| --- | --- |
| 文件 | `/tmp/pi-pstack-ketchup-c-OwERio/catch-up.mp4` |
| 时长 | 7.500000 秒 |
| 画幅 | 1280 × 720，landscape |
| 编码 / 像素格式 | H.264 / yuv420p |
| 帧率 / 总帧数 | 30 fps / 225 |
| 音轨 | 0；仅一个 video stream |
| 转场 | 两段各 9 帧、0.3 秒的 blend |
| MP4 SHA-256 | `b691e88f55e8ed5c563a75a5f9cd2255ca4a8a1d713e6f3723fa0463bced2be8` |

## 成片抽帧与阅读时长

在 scratch 执行 `python3 check-frames.py`，退出码 0，8 项断言通过、0 失败。脚本先从最终 MP4 解码全部 225 帧，再检查每页稳定帧与代表帧在文字变化区域的像素差，以及转场中间帧与相邻稳定页的区别。不是只依据渲染输入或总时长推断稳定阅读时间。

帧号从 0 起；时间区间为左闭右开。未变化、沿用的标签不重复计入新增词。此样例没有截图文字。

| 页 | 新增文字 | 新增词数 | 最低阅读时间 | 成片稳定帧 | 稳定时间区间 | 实测稳定时长 | 抽帧时间 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Operator request / Slide frames / Silent video | 6 | 2 秒 | 0–68 | 0–2.3 秒 | 2.3 秒 | 第 34 帧，1.133 秒 |
| 2 | Readable holds verified | 3 | 1 秒 | 78–146 | 2.6–4.9 秒 | 2.3 秒 | 第 112 帧，3.733 秒 |
| 3 | Open local file | 3 | 1 秒 | 156–224 | 5.2–7.5 秒 | 2.3 秒 | 第 190 帧，6.333 秒 |

转场帧 69–77、147–155 不计入稳定阅读时长。稳定页文字区域相对于代表帧的最大平均通道差分别为 0、0.0050、0.0014（8-bit 像素）；转场第 74、152 帧相对于两边稳定页的平均通道差分别为 6.1228/4.1547、4.1178/2.7643，证实有视觉变化。

使用 Pi `read` 查看从成片代表帧生成的 `/tmp/pi-pstack-ketchup-c-OwERio/contact.png`：三页标签均可辨认，没有裁切、重叠，流程连接和颜色保持一致。三页满足“每三个新增词至少一秒”，不把编码成功等同于可读性通过。

复现方式：在保留的 scratch 执行 `node load-skill.mjs`、`python3 render.py`、`python3 check-frames.py`。脚本和输入均在 scratch，媒体及数百帧图片不进入仓库。scratch 为临时目录，系统清理后需重新准备验收输入，仓库不将其作为永久测试依赖。

## Pi 宿主边界与失败回退

宿主探针事实由本任务已确认：Pi 1.4.0 终端与消息组件支持展示本地 MP4 文件的 Markdown 路径引用，让操作者打开播放；没有通用行内视频播放组件。本次不将路径引用描述为内嵌播放，也没有另开宿主播放 UI 或声称重新完成视觉宿主验收。

模板要求回复顺序为 ketchup 的开场句、现存 MP4 绝对路径的 Markdown 引用、自己仍能做的工作一行，以及全部等待操作者的决策项。视频中的选项与文字使用相同名称。引用保留为本地文件，不能提前删除，也不能自动上传或打开外部程序。

渲染、探测、抽帧检查或路径交付失败时：用一行说明视频无法准备或交付及原因，然后只给文本决策项（选项、建议、证据和成本/风险）；没有决策则明确说没有待决策项。不能用长篇状态汇报替代失败交付，不能将未核验的部分文件称为已完成。缺少工具也采用这一回退，不擅自安装。失败分支本次通过模板逐条只读核对，未以故障注入或新模型会话测试其遵循情况。

## 会话窗口契约

起点严格为调用 `/skill:ketchup-video` **之前最后一条由操作者本人写的用户消息**。调用本身、技能展开、工具输出、系统通知和子代理报告均不算该消息；之前的 ketchup 调用不改变这个起点。只使用当前 chat 的活动分支；压缩后缺失边界时明确报告，不虚构或越界读取其他会话。窗口之前提出、至今仍等操作者处理的决策仍按 ketchup 的规则列入决策项。

例如：操作者消息 U0 → 工作 A → 操作者消息 U1 → 工作 B → 子代理报告 R → 本次技能调用，则视频总结窗口从 U1 起；不从 U0 或 R 起。此处是模板的明确契约和人工检查例，不宣称完成新模型会话的端到端遵循测试。

## 实际检查、未完成与阻碍

执行目录为本 worktree，除上述明确标为 scratch 的命令。

- 初始 `npm test`：退出码 1；runner 已通过 2 项，失败 1 项，计划共 38 项、只执行 3 项。`run-checks.test.mjs` 为 6 个测试通过、0 失败；`p2-runtime.test.mjs` 因缺少 `jiti` 加载失败。随后 `npm ci` 退出码 0，补齐 123 个包，未改变 package.json 或锁文件。
- 补齐依赖后的首次长测试调用在工具 60 秒限时内未返回，不能作为完成证据。进程只读检查确认未留下本任务的 npm test / run-checks 进程。
- 模板存在后实际重跑 `npm test`：退出码 1；runner 通过 0 项、失败 1 项、执行 1/38 项。首项 `check-package` 报模板内三处 `/skill:ketchup-video` 为 `Unknown skill reference`，后续测试未执行。背景运行日志保留于 scratch 的 `npm-test.log`，前台复测得到相同退出码与错误。
- scratch loader：8 项通过、0 失败；媒体 probe：6 项通过、0 失败；成片帧检查：8 项通过、0 失败；三页代表帧已目视核对。
- `git diff --check`：退出码 0。两份新增文件尚未跟踪，另分别执行 `git diff --no-index --check /dev/null adapters/pi/overrides/skills/ketchup-video/SKILL.md.template` 和 `git diff --no-index --check /dev/null docs/validation-upstream-01534-c.md`：各退出码 1、输出为空；这里 1 表示与空文件有差异，无空白错误诊断。最终内容通过 Pi `read` 复读；文档相对链接和技能生成目录中的依赖/许可路径已核对。

未完成：分发注册、生成资源、完整 npm test、真实新会话的技能调用遵循验证，以及含 `Fixes #46` 的提交。

具体阻碍：`check-package.mjs` 的引用检查要求 `ketchup-video` 已在共享注册表/生成的 skills 树中登记；本任务只允许写模板与本记录，不能擅自改共享文件或去掉真实调用名称以躲避检查。项目规定提交前 npm test 必须通过，所以尚未提交。需要主控集成共享登记和固定来源后重跑，再提交（建议信息：`feat: adapt ketchup-video for Pi (Fixes #46)`）。本次会话调用 supervisor 通道返回无 supervisor，无法在此环境直接向主控请求范围决定，故通过交付明确报告阻碍。
