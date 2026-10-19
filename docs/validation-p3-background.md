# P3 后台子代理隔离与生命周期验收

核对日期：2026-10-18（UTC）。本机环境：macOS 27.2 / arm64、Node `v22.22.2`、Pi `1.3.0`、pi-subagents `0.79.0`。本文件只覆盖“后台（`async: true`）真实 child 的只读隔离与生命周期”这一条 lane，P3 整体仍未完成；主验收记录见 [P3 验收](validation-p3.md)，未完成项仍保留在 [移植计划](migration-plan.md#p3多代理与多模型)。

## 验证层次

`scripts/check-p3-background.mjs` 复用 [前台 host 检查](../scripts/check-p3-host.mjs) 的思路，但把调用路径换成真实后台：

| 层次 | 本次实际使用 |
| --- | --- |
| 被测包 | `npm pack` 产物解压到消费项目 `.pi/npm/node_modules/pi-pstack`，不是工作树直接加载 |
| 宿主 | 实际安装的 Pi `1.3.0` SDK（`PI_PSTACK_PI_ROOT` 指向的包根） |
| pi-subagents | 实际安装的 `0.79.0`，由临时 settings 的包清单加载 |
| 子代理 | `subagent({ async: true })` 启动 pi-subagents 的 detached runner；runner 是独立操作系统进程，与 harness 进程 pid 不同 |
| provider | 本机确定性 OpenAI-compatible SSE fixture，无外部推理、无凭证 |
| 断言依据 | 真实 provider 请求、run 目录 `status.json` / `events.jsonl`、交付的 completion 负载、ambient marker 文件、workspace 文件内容 |

隔离方式：整个 fixture（agent 目录、provider 配置、run 产物、父会话文件、workspace）都在一次性临时目录里；只改本进程环境变量 `PI_CODING_AGENT_DIR`、`PI_SUBAGENTS_TEMP_ROOT`、`PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`、`P3_BACKGROUND_MARKER`，不写全局 Pi 配置。运行结束删除 fixture 目录，并在退出钩子里再删一次（pi-subagents 的会话销毁会在 `session.dispose()` 之后短暂回写索引）；按 pid 复查后台 runner 全部退出。

## 文件

| 路径 | 作用 |
| --- | --- |
| `scripts/check-p3-background.mjs` | 后台 harness：打包消费、真实后台 child、只读/ambient/生命周期断言、红例 |
| `scripts/fixtures/p3-background/ambient-extension/package.json` | ambient fixture 扩展的包清单（`pi.extensions: ["./index.ts"]`） |
| `scripts/fixtures/p3-background/ambient-extension/index.ts` | 注入的 ambient 写扩展：每次加载向 `P3_BACKGROUND_MARKER` 追加一行，并注册可写工具 `ambient_write` |

## 复现命令

```bash
# 主验收（5 个后台场景，全部为断言通过才 exit 0）
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  node scripts/check-p3-background.mjs

# 负对照：把只读契约跑在写代理上，harness 必须检不出来即失败
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  PI_PSTACK_BACKGROUND_RED_CASE=writer node scripts/check-p3-background.mjs

# 保留 fixture 目录（含 run 产物）以便人工检查
PI_PSTACK_KEEP_BACKGROUND_FIXTURE=1 ...
```

脚本自带 300 秒总超时；超时会按已记录的 runner pid 清理并 exit 2。

## 本次实际结果

最终固化后实际执行（命令见上）：

- `node scripts/check-p3-background.mjs` 退出码 0，输出 `status: "passed"`，5 个场景全部通过；stderr 为空。
- `PI_PSTACK_BACKGROUND_RED_CASE=writer node scripts/check-p3-background.mjs` 退出码 0，输出 `status: "red-case-detected"`（红例语义：预期必须被拒绝，检不出来才失败）。
- 追加连续 3 次主验收运行，退出码均为 0（5 个 runner pid 每次不同且互不相同）。
- 运行后复查：`pstack-p3-background-*` 临时目录 0 个，`subagent-runner-bootstrap` 进程 0 个。

| 场景 | 实际结果 |
| --- | --- |
| 只读隔离 | child 进程与 harness 不同 pid（`runnerPid 70743`），该进程事后已退出；run `status.state: complete`、`launchResolvedExtensions.disableAmbientExtensions: true`；provider 收到 2 次 child 请求；child 声明的工具恰为 `find grep ls read`；child 模型 `review`、`reasoning_effort: high`；交付 completion 的 results[0].model 为 `fixture/review:high` |
| 拒写 | fixture 对 `ordinary.txt`（已暂存）、`ignored.txt`（gitignored）、`untracked.txt`（未跟踪）各发 `write` / `edit` / `bash` / `ambient_write` 共 12 次调用，12 次全部返回工具不存在类错误（含 `Tool ambient_write not found`）；三个文件内容均为 `ORIGINAL` |
| ambient 注入 | 只读 run：marker 只有父会话进程 1 条记录，runner pid 无加载记录；作为机制对照，写代理 run（`pstack.poteto-agent`）`disableAmbientExtensions: false`，marker 增加 1 条且 pid 等于该 run 的 runner pid，`asyncRunner: "1"` |
| 写探针有效（对照） | 同一 harness 用写代理后台 child 实际写入 `control.txt`（内容 `WRITTEN-BY-BACKGROUND-WRITER`），三个保护文件仍为 `ORIGINAL`。说明“文件未变”不是因为调用链没生效 |
| 取消 | 先 `subagent({action:"status"})` 报告 run 处于 running，再 `subagent({action:"stop"})` 返回 `Stop requested for async run …`；终态 `state: stopped`、`success: false`、`error: "Subagent stopped."`；bg_wait 等待 257ms 返回；runner 已退出；三个文件未变 |
| 超时 | `options.timeoutMs: 2000` 的后台 run，bg_wait 3.0s 后拿到终态：`state: failed`、`success: false`、`error: "Subagent timed out after 2000ms."`；runner 已退出 |
| runner 崩溃 | harness 用 SIGKILL 杀死 run 的 runner（`runnerPid 71064`）；父会话 bg_wait 1.0s 后返回 `Outcome: 1 failed`，终态错误为 `Async runner process 71064 exited with code none (signal SIGKILL) before writing a result. Marked run failed by stale-run reconciliation.`；runner 已不存在，三个文件未变 |
| 红例（负对照） | 把同一只读契约跑在 `pstack.poteto-agent` 上：harness 报 `RED_CASE_FILE_WRITE_DETECTED`，列出三个文件都被写成 `CORRUPTED-BY-BACKGROUND-READONLY-CHILD`。证明“文件未变/工具声明”断言确实能抓住泄漏 |

写入拒绝的完整证据是 child provider 实际收到的 12 条 tool 结果；只读 child 的 provider 请求中也不含 `edit` / `write` / `bash` / `ambient_write` 声明，因此那些调用不是被提示词请求“不要做”，而是工具层不存在。

## 上游定义与项目适配的边界

- 上游 `comment-sicko` frontmatter 只有 `name` / `description`。`tools: read, grep, find, ls`、`excludeTools: contact_supervisor`、空 `extensions`、`async: true`、`acceptanceRole` 都是项目适配，不是上游提供的安全配置。
- `async: true` 是项目统一后台化选择，上游没有该字段；本次验证的是该选择在已装 pi-subagents 上的真实行为。
- 只读不是靠提示词：pi-subagents 的 tool plan 依据空 `extensions` 得出 `disableAmbientExtensions: true`，子会话不再加载 ambient 扩展；`excludeTools` 再挡掉宿主默认桥接的 `contact_supervisor`，所以只读 child 实际只有 4 个工具。写代理未声明 `extensions`，保留宿主默认，本次观测到其工具声明为 7 个包工具外加宿主桥接的 `contact_supervisor`。
- 区分“禁用 ambient 工具”与“provider 扩展依赖”：空 `extensions` 会连同提供模型 provider 的扩展一起禁用。本次只读 child 的模型来自 fixture `models.json`（Pi 的模型配置，不是扩展），因此只读 child 仍能解析 `fixture/review`。pi-subagents 在崩溃 run 的 runner stderr 中打印了同义提示：`extensions: [] override … disables ALL ambient extensions … including any model-provider extension needed to resolve a provider-qualified model`。这说明依赖扩展提供 provider 的模型不能直接用于只读 child；本次没有验证任何扩展 provider 场景。

## 未完成与限制

- 无真实模型参与：provider 是确定性的，不证明模型遵循技能、注释审查质量、或不同模型独立审阅。多模型流程仍按 [P3 验收](validation-p3.md) 保持未完成。
- 后台完成通知未作为验收断言：终态通过 `bg_wait` 与 run 产物收集。某次运行 stderr 曾出现一条 pi-subagents 的 `Failed to process subagent result file … extension ctx is stale` 警告（属于该 harness 的 SDK/RPC 宿主环境，不是包代码），当时已收集的终态与断言均未受影响；后续运行 stderr 为空。原生唤醒路径本身没有单独断言。
- 只读隔离只覆盖内置工具与本 fixture 的 ambient 工具：未覆盖 MCP 工具、`codemode` 间接写、扩展自定义写工具的其他暴露方式。
- 并发未验证：所有 run 顺序执行；一个 cwd/worktree 只有一个 writer、worktree 隔离、并发写冲突均未在本 lane 验收。
- 项目作用域未验证：父会话固定 `defaultProjectTrust: never`，没有测试恶意 project agent 覆盖、项目 agent/设置覆盖权限。
- 崩溃只覆盖一种形态：SIGKILL runner（stale-run reconciliation 标记失败）。runner 启动失败、runner 内部 SDK 初始化失败、child 会话内部错误、以及失败后的 resume/revive 都没有在本 harness 中断言。
- 环境单一：只在本机 macOS 27.2 / arm64、Node 22.22.2 上跑过；未在 Linux/CI 或其它 Pi 版本记录结果。
- 脚本化接入：最初建档时未接入 package.json；现已作为 `check:p3:background` 脚本接入，并进入 `npm run check:p3` 的必须检查项。
- 事件/状态字段依赖当前 pi-subagents 0.79.x 的内部产物（`status.json`、`events.jsonl`、`completion-replay`、`output-archives`）。这些是诊断用途，不是发布运行时代码应依赖的稳定契约。
