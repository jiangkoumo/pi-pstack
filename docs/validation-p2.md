# P2 模式与模型配置

## 已实现接口

加载包后使用：

```text
/poteto-mode on
/poteto-mode off
/poteto-mode status
/setup-pstack models
/setup-pstack status
/setup-pstack set user code <provider/id> [thinking]
/setup-pstack set project review inherit [thinking]
/setup-pstack unset project review
```

roles 为 code、review、prose、verification。选择必须为精确 provider/id 或 inherit；默认所有角色 inherit。模式只提供单代理方法；角色配置是后续委派适配的偏好数据，不会改变当前模型，不会自动启动代理。P3 尚未实现。

## 模式契约

- 默认关闭。/skill:poteto-mode 仍为当前请求显式调用，与持久模式开关分开。
- 开关写入 customType=pstack.mode.v1 的非模型上下文条目；只取当前活动分支最后一条 pstack.mode.v1 条目；若末条版本或形状非法则报错，不跳过它去寻找更早状态。更早的非法条目不影响后续有效状态。重复 on/off 不添加重复状态。
- on 为后续用户请求增加一个 pstack_mode 系统提示区块，只包含技能路径、授权边界和角色数据。正文仍按需 read，不每轮注入整套技能。
- off 将区块替换为简短关闭说明，撤销旧自动提醒；不会删除历史内容，不能保证模型忘记早先读过的技能。用户显式调用技能仍生效。
- 分支回到启用点之前会关闭，回到启用状态分支会恢复；fork 继承所选路径。新会话默认关闭。
- reload、恢复与 compaction 从完整活动分支读取状态，不从已被压缩的模型消息猜测。没有自动续跑事件。
- set/on 遇到配置或状态坏值会报错；两个 status 命令对坏配置显示 configError 字段；运行中发现错误则在系统区块明确呈现并要求停止任务。该提示是行为约束，不是工具权限拦截。off 可以覆盖较早的不兼容状态。
- TUI 用状态栏与可见命令消息；JSON/RPC 用结构化事件；print 命令结果写 stderr，避免混入模型 stdout。非 print 的命令结果通过 pi.sendMessage 存成 custom_message，包含状态、路径、模型目录或角色数据，会进入后续模型上下文且不会随 off 撤回；它们是历史数据，不是当前模式状态的来源。
- 新会话在首次聊天之前 Pi 可能尚未落盘；此时状态只在内存，status 的 persistent=false。第一次消息落盘后才保证跨进程恢复。

## 配置契约

用户级：Pi agent 目录中的 pstack.json。项目级：当前 cwd/<CONFIG_DIR_NAME>/pstack.json（标准 Pi 为 .pi，使用宿主公开常量），仅 ctx.isProjectTrusted() 时读取和写入。受信任项目按角色整体覆盖用户值；没有递归合并 thinking。移除项目角色后恢复用户值。

```json
{"version":1,"roles":{"code":{"model":"inherit","thinking":"high"}}}
```

未知键、版本、角色、模型格式、thinking、不可用模型或不支持级别会指明字段，不做模糊匹配或静默降级。可用指 Pi 当前已配置认证的模型目录快照，不保证远端服务此刻可响应；不读取或输出密钥。

写入采用同目录临时文件 + rename；锁用独占创建，冲突报错，不覆盖其他 writer。相同内容不写文件。不自动清理残留锁，确认无 writer 后由操作者处理。配置优先级只影响角色偏好，不改用户 Pi settings/models/auth。

## 实际验证

Pi 版本 1.3.0。PI_PSTACK_PI_ROOT 指向本机安装的 @earendil-works/pi-coding-agent 根目录。

- npm run check:p2：3 项 Node 行为测试，退出码 0，覆盖分支输入、schema、精确模型与 thinking、信任过滤、角色覆盖、幂等写入与锁冲突。
- PI_PSTACK_PI_ROOT=<installed> npm run check:p2:host：真实 Pi SDK 载入包扩展，向本地 OpenAI-compatible SSE fixture 发请求；退出码 0。覆盖连续两轮、off、活动树切换、reload、真实 session.compact、恢复、fork、新会话、运行时 switchSession/newSession/fork、错误模型、非推理模型 thinking、推理模型 high 成功及 xhigh/max 拒绝、项目 trust、项目覆盖与移除、两个 status 的坏 JSON 诊断、模型不变。当前 18 个 provider 请求，均为本地 fixture。替身证明提示传输与生命周期，不能证明真实模型遵循。
- PI_PSTACK_PI_ROOT=<installed> npm run check:p2:cli：真实 CLI 的 JSON/print/RPC 命令可见性，退出码 0。JSON/RPC 显式断言没有 agent_start；print 只检查输出可见性，不报告实测模型请求数。命令不触发 provider 的证据来自前述宿主请求计数。
- 真实模型 magpie/group/never-stuck，在隔离 agent 与 workspace 中，启用后两轮只读定价调查，关闭后第三轮仅返回 P2_OFF_ACK；进程退出码 0，3 次 agent_settled，无错误，实际 read 主技能与 investigation.md。原始记录本机 /tmp/pi-pstack-p2-live-20261016/，密钥配置副本已删除。未做统计遵循率、也没有把关闭后的简短回复当作忘记旧技能的证明。

## 回归检查

本次最终执行 npm run check（24 个文档、72 处链接、82 条映射）、check:p2（3/3）、check:p2:host（18 个本地请求）、check:p2:cli（三种模式）、check:pi:commands（11 技能、0 上游命令）、check:correct:history（两个真实坏例拒绝）及 git diff --check，均退出码 0。打包清单由历史回归脚本核对，包含 86 文件。

独立 fresh-context reviewer（opencode-go/deepseek-v4.1-flash）已返回 OK with notes，无 P0/P1。审阅者没有 shell 权限，未独立运行命令；所有退出码来自主会话实际执行。六项 P2 意见处置如下：

| 意见 | 处置与证据 |
| --- | --- |
| 项目路径硬编码 .pi | 扩展传入 Pi 的 CONFIG_DIR_NAME；配置测试使用 .custom-pi 核对路径 |
| 命令结果进入模型上下文 | 保留可见自定义消息设计，在模式契约中明确其历史数据副作用 |
| 推理模型 thinking 函数未实测 | 宿主添加 reasoning=true 模型，high 成功、xhigh 与 max 拒绝 |
| 两个 status 对坏配置行为不一致 | 统一 configError 诊断，宿主检查两个命令均输出定位且不失败 |
| CLI 硬编码 modelRequests=0 | 删除该字段，RPC 补无 agent_start 断言；print 只声称可见性 |
| 状态条目措辞和覆盖清单过强或缺项 | 明确末条非法即报错，同步运行时会话替换覆盖项 |

修复后 check:p2 3/3、check:p2:host 18 个本地请求及 5 个期望命令错误、check:p2:cli 三种模式均退出码 0。TUI 视觉限制保留。

## 验收限制

TUI 状态栏代码尚无人工终端视觉验收。恢复与新会话最初通过重新构建宿主检查，随后补齐真实 AgentSessionRuntime.switchSession/newSession/fork 验证，均通过。完整安装、卸载与升级属 P4。包继续 private，支持范围目前仅参考 Pi 1.3.0。
