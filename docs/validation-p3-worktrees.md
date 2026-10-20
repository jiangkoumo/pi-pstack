# P3 并发 writer/worktree 隔离与 writer review gate 验收

状态：P3 整体仍未完成。本文只记录一条新验收 lane 的实际结果：两个并发 writer 在 managed worktree 中的写入隔离，以及 writer 结果的 review-required 实装契约。角色接线、禁止 reviewer 写入、取消/超时等其余 P3 条目仍以 [P3 验收](validation-p3.md) 为准。

## 实际环境

| 项目 | 值 |
| --- | --- |
| Pi | 1.3.0，`/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent` |
| pi-subagents | 0.79.0，`/Users/jiangkoumo/.pi/agent/npm/node_modules/pi-subagents` |
| 模型 | 本地确定性 OpenAI-compatible fixture provider：`fixture/parent`、`fixture/writer`；未使用外部或付费推理 |
| 代理 | `pstack.poteto-agent`（writer）；本文没有把 `pstack.comment-sicko` 当作通用 reviewer |
| worktree provider | `native`（Git worktree），`worktreeBaseDir` 指向临时目录 |

上游 poteto-agent 只有 name/description/is_background；`tools`、`acceptanceRole: writer`、`async`、`systemPromptMode`、`inherit*`、`license` 都是本项目适配字段，不是上游安全或模型配置。

## 检查入口

```bash
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  node scripts/check-p3-worktrees.mjs
```

多次实际执行均退出码 0，单次耗时约 6–22 秒。以下为一次完整通过运行的输出（临时路径已省略）；每次运行的写入内容、worktree 路径与 run id 不同，断言不变。

检查脚本：[scripts/check-p3-worktrees.mjs](../scripts/check-p3-worktrees.mjs)。fixture 仓库、agent 目录、模型与 worktree 根都在运行时生成并清理，因此不需要 `../scripts/fixtures/p3-worktrees/` 下的静态文件；该目录本次未新增。

## 方法

1. 临时目录内建一个干净 Git fixture（`git init` + 一次 baseline commit，仅限该 fixture；本项目 worktree 未提交、未推送），并从本包 `npm pack` 的 tarball 安装到临时消费目录。
2. 用 P2/P3 host 检查相同的公开入口 `createAgentSession` / `DefaultResourceLoader` / `SettingsManager` / `ModelRuntime` 加载真实 Pi 1.3.0，通过 `additionalExtensionPaths` 加载已安装的 pi-subagents 0.79.0 扩展和 tarball 中的 pstack 扩展。
3. 父会话在同一轮发出两个 `subagent` 调用，启动两个 `pstack.poteto-agent`，`async: true`：
   - 场景 1：两个 child 都是 `worktree: true`；
   - 场景 2：两个 child 都是 `worktree: false`，故意共用 fixture 源 cwd，用来观察宿主是否拒绝。
4. fixture provider 按脚本驱动每个 child：`bash pwd` → `read` 同名文件（此时不存在）→ `write` 同名文件（各 lane 内容不同）→ 服务端 barrier → `read` 同名文件 + `git status --porcelain` → 最终输出并附 `acceptance-report`。
   - barrier 只在两个 lane 都到达后同时放行，因此两个写入一定先于两个回读；这是真实并发窗口，不是顺序执行。
   - 父会话的完成通知按宿主原生异步路径返回（`Background task completed: ...`），脚本等待通知与两次 run 落盘后继续。
5. 断言用的都是可核对外部事实：provider 收到的请求体（cwd、model、thinking、工具结果）、barrier 时刻的 `git worktree list --porcelain`、fixture 的 `git status`/`HEAD`/文件内容、以及两次 run 的 `status.json` acceptance ledger。

异步 child 由 pi-subagents 的 detached runner 以独立进程运行，不是宿主进程内的前台 child。脚本内部设置 `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`，因为该 runner 通过 argv/环境解析宿主包（pi-subagents 文档中对 wrapper 安装给出的公开覆盖点）；这是 harness 细节，不是本项目发布契约。

## 实际结果

多次实际执行的输出形态一致，以下为一次完整通过运行的输出（临时路径已省略）：

```json
{"status":"passed","validationLayer":"real installed Pi host + pi-subagents extension + real child sessions + local fixture provider","fixture":{"baselineHead":"d13e879b3b29f10d0410ac8c06209216a18bc585","sourceRepo":"/var/folders/.../consumer","worktreeBaseDir":"/var/folders/.../worktrees"},"concurrency":{"worktree":{"lanes":2,"completionNotices":2,"cwdsDistinct":true,"managedWorktrees":2,"sourceCleanAtBarrier":true,"sourceUnchangedAfter":true,"eachLaneReadOwnMarker":["LANE_A","LANE_B"],"afterRunWorktreeCount":1},"sharedCwd":{"lanes":2,"hostBlockedSecondWriter":false,"bothObservedSameContent":"P3_WT_SHARED_A","sourceFileAfter":"shared.txt","conclusion":"The host does not enforce one writer per cwd; isolation is a parent scheduling rule."}},"role":{"agent":"pstack.poteto-agent","savedRole":"code","childModel":"writer","thinking":"low"},"acceptanceContract":{"source":"async run status.json","status":"review-required","evidenceStatus":"checked","reviewResult":{"status":"review-required","findings":["Independent review has not been supplied."]},"runConsideredComplete":true,"note":"Review is recorded as pending; the run is not failed and no reviewer child is started automatically.","records":[{"runId":"260e1382-aa0a-45e1-ac71-6b595dd9f445","runState":"complete","status":"review-required","evidenceStatus":"checked","reviewStatus":"review-required","reviewSeverities":["non-blocking"],"reviewFindings":["Independent review has not been supplied."]},{"runId":"582ec75b-109e-4d8e-b290-f4b8587f4d5f","runState":"complete","status":"review-required","evidenceStatus":"checked","reviewStatus":"review-required","reviewSeverities":["non-blocking"],"reviewFindings":["Independent review has not been supplied."]}]}}
```

### managed worktree 隔离（场景 1）

- barrier 时刻 `git worktree list` 有 3 项：源 fixture 加两个 managed worktree，均在 `worktreeBaseDir` 下；源 fixture 的 `git status --porcelain` 为空。
- 两个 child 的 `pwd` 是两个不同的 managed worktree 绝对路径，都不等于源 fixture；每个 child 回读同名 `lane.txt` 只看到自己的 marker（`P3_WT_LANE_A` / `P3_WT_LANE_B`），`git status --porcelain` 都只有 `?? lane.txt`。
- 两次 run 结束后源 fixture 仍干净、`HEAD` 未移动、源目录没有 `lane.txt`；run 结束时 `git worktree list` 回到 1 项，说明宿主在正常完成后回收了临时 worktree（本检查未执行 `worktree.cleanup` apply，也不依赖 diff 快照）。
- 该场景证明：两个并发 writer 在 managed worktree 中互不可见，且不修改源工作树；不证明分支合并、PR 或跨机器路径。

### 同 cwd 并发（场景 2）

- 宿主没有拒绝第二个 writer：两个 child 都启动、都完成了 provider 请求，`pwd` 都是同一个 fixture 源 cwd；barrier 时刻 worktree 列表仍只有 1 项。
- 两个 child 回读到同一个内容（最近一次为 `P3_WT_SHARED_A`；更早的一次为 `P3_WT_SHARED_B`），至少一个 lane 读到的是另一个 lane 的 marker；源 fixture 随后出现未跟踪的 `shared.txt`，`HEAD` 仍未移动。
- 结论：pi-subagents 0.79.0 没有“一个 cwd 只允许一个 writer”的自动强制。该约束目前只能由父调度规则和交接文本落实。本次没有为此新增锁系统，也没有把该结论写成宿主能力。

### code 角色确实影响 child

- 用户级 `pstack.json`（与 `setup-pstack set user code …` 写出的同一 schema）保存 `code: { model: "fixture/writer", thinking: "low" }`；场景 1 与场景 2 的所有 child 请求都是 `model: "writer"`、`reasoning_effort: "low"`，即保存的 code 角色经 `applySubagentRole` 传到真实 child。本次没有执行 `/setup-pstack` 命令本身。
- 该接线只覆盖直接 `subagent({ agent, task, ... })` 调用：`extensions/pstack/index.ts` 对 `input.workflow` 提前返回，workflow 脚本/`parallel` 资源的 child 不会消费 pstack 角色。本次因此使用同轮两个直接 async 调用，而不是 workflow 并行，以保持“角色影响 child”与“并发隔离”在同一组证据里。该限制与 [P3 验收](validation-p3.md#角色接线契约) 一致，不是本次新引入。

### writer 结果的 review-required 实装契约

`PI_SUBAGENTS_TEMP_ROOT/async-subagent-runs/<runId>/status.json` 里的 acceptance ledger（路径由脚本设置的 `PI_SUBAGENTS_TEMP_ROOT` 决定，临时目录结束时删除）。两次 writer run 的记录相同：

- `acceptance.evidenceStatus = "checked"`，`acceptance.status = "review-required"`；
- `acceptance.reviewResult = { status: "review-required", findings: [{ severity: "non-blocking", issue: "Independent review has not been supplied." }] }`；占位 finding 由 pi-subagents 的 acceptance ledger 生成（`<pi-subagents>/src/runs/shared/acceptance.js`，仅作实装依据，发布代码不引用）；
- run 自身 `state = "complete"`，父会话收到 “Background task completed”。

原因来自 0.79.0 的 acceptance 推断：`acceptanceRole: "writer"` 且 async/dynamic 时推断 `checked` 证据并加 `review: { required: true }`；没有独立 review 结果时，ledger 以自动占位 finding 记为 `review-required`，不会把 run 标成 failed，也不会自动启动 reviewer。

因此这里的 “review gate” 是一个**可观察的待审状态**，不是“未审阅就拒绝完成”的强制门禁。按已安装的 pi-subagents 0.79.0：`acceptance` 的公开 schema 没有 review 结果输入位（`src/extension/schemas.js`），`reviewResult` 只由内部 ledger 构造（`src/shared/types.d.ts`、`src/runs/shared/acceptance.js`）。父代理只能另外编排 reviewer 并在自身流程里记录结论；0.79.0 没有把外部 review 结论回写成 run `reviewed` 状态的公开入口。本文不宣称 `review-required` 等于已审阅，也不把一次 `reviewed` 状态写成已实现流程。

`comment-sicko` 不在本条链路中充当 reviewer：它是只读的、固定的“删注释/标记 MUST KILL”报告型代理，不是通用 review 服务。把它泛化成任何写代码任务的 review gate 会超出其定义与已验收范围。

## 未验证与边界

- 只用本地 fixture provider；没有外部模型遵循技能、真实付费推理或多模型审阅证据。
- 只覆盖 macOS 上的 native Git worktree；未覆盖 Worktrunk、Windows、网络文件系统或 worktree setup hook。
- 未覆盖 child 崩溃、后台取消/超时恢复、retained resume、worktree 清理计划/apply 与分支合并（这些仍属 [P3 未完成项](validation-p3.md#尚未完成)）。
- 检查脚本是诊断/验收 harness，不是发布运行时；它只 import Pi 的公开 SDK，不 import pi-subagents 内部模块（内部路径仅在本项目其他探针中用于版本诊断，发布代码不引用）。
- 本轮没有修改 `package.json`、既有 host 脚本或公共文档；P3 完成状态、`port-map.json` 与 migration-plan 勾选保持不变。

## 新增文件

- `../scripts/check-p3-worktrees.mjs`
- `docs/validation-p3-worktrees.md`

复现证据以重新运行上面的命令为准；临时 fixture、agent 目录与 worktree 在结束时删除，不保留归档。
