# A2/A6 验收：verifier 降级与发布完成自检

对应 Issue：[#19](https://github.com/jiangkoumo/pi-pstack/issues/19)。分支 `fix/19-verifier-completion`。来源中的 0.3.1/0.3.2 复测结论仅作线索；本文只记录本分支实际运行的行为。

## 结论

分支阶段记录：共享接线已在后续 main 整合完成，当前测试与审阅修复见 [Stage A 验收](validation-stage-a.md)。下文的“仍需接线”描述原分支交付时的边界。

- A2 已实现**可验证的降级执行**：没有可用 OS 沙箱时，命令在临时 Git worktree（宿主不允许写主仓库 `.git/worktrees` 时改用临时 shared clone）中真实执行，返回真实 exit code；结果、能力查询和文档都明确标注这不是沙箱。
- A6 已实现发布完成自检：CLI 真实执行只读 `git rev-parse`/`git rev-list` 和 `gh pr view`，比对 PR head 与本地 HEAD，并读取真实 PR body；只有分支已 push、PR 已创建、`gh pr view` 成功读取，且 `## Verification` 记录了 verifier 结论或责任人，才返回 complete；未授权 push/PR 返回 blocked 126，自检不能授予权限。
- 真实 p-queue E2E **未执行**：本机没有 p-queue checkout，且外部 push/PR 需要主控协调授权。该验收项未完成，见文末阻碍。
- 共享文件 `extensions/pstack/index.ts`、`README.md`、`adapters/pi/overrides/agents/verifier.md.template` 仍需主控接线；本分支未改这些路径。

## 基线与复现环境

本机为 DSH `workspace-write` 工作区，嵌套 `sandbox-exec` 被宿主拒绝：

```bash
node extensions/pstack/verification-exec.mjs --capability
# exit 0
# isolation: degraded-worktree
# unavailableReason: sandbox-exec could not apply a profile: sandbox-exec: sandbox_apply: Operation not permitted
```

工作树初始没有 `node_modules`，直接 `npm test` 因 `ERR_MODULE_NOT_FOUND: jiti` 退出 1；执行 `npm ci --include=dev` 后基线 `npm test` 退出 0。该次失败是依赖未安装，不是代码回归。

## A2：无 OS 沙箱时的降级执行

### 行为

1. `parseVerificationCommand` 继续做命令意图过滤；只接受 `npm test`、`npm run <test|lint|build|typecheck|check|verify|format|coverage...>`、`node --test`、`node --check`、仓库内 Node 脚本和只读 `git status/diff/show/log/rev-parse`。
2. 有可用 OS 沙箱时走原 seatbelt/bwrap 路径，返回 `isolation: os-sandbox`。
3. 没有可用 OS 沙箱时：
   - 先尝试 `git worktree add --detach <scratch>/worktree HEAD`；宿主禁止写主仓库 Git 目录时，退回 `git clone --shared --no-checkout` 到私有 scratch；
   - 把当前 `git diff HEAD --binary`（已跟踪的已暂存和未暂存改动）应用到临时工作区；逐文件复制未跟踪文件，复制失败直接让准备失败，不产生不完整快照；
   - 若源 checkout 有 `node_modules`，在临时工作区创建可读写穿透的软链；
   - 使用清理过的环境：只保留 `PATH`、`SHELL`、`TERM`、`TZ`、locale、`NODE_ENV` 等白名单变量；`HOME`、npm cache、npm 用户配置、git 全局配置都指向私有 scratch；token/secret/proxy/`NODE_OPTIONS` 等不会传入；
   - 输出按字节截断，超时/中止按进程组 `SIGKILL`，并保留 2s 强制收尾；
   - 结果带 `isolation: degraded-worktree`、`degraded: true`、`warning`、`responsibleParty` 和逐条 `limitations`；`renderVerificationResult` 打印 `WARNING`、`RESPONSIBLE` 和 `LIMITATION`。
4. 非 Git 工作目录无法准备临时工作区时，返回 `status: unavailable` 并说明原因，不会静默在源目录执行。
5. 清理只删除本次运行的 worktree 路径（`git worktree remove --force`）；从不运行 `git worktree prune`，避免影响其他 writer 的 worktree 元数据。clone 形式随私有 scratch 一起删除。

### 能力查询接口

`extensions/pstack/verification-exec.mjs` 新增：

| 导出 | 用途 |
| --- | --- |
| `getVerificationCapability(options?)` | 异步探测并返回 `{ isolation, degraded, sandbox, warning, responsibleParty, limitations, limits }`。 |
| `capabilityFromSandbox(sandbox)` | 用已探测到的 sandbox 记录构造同一结构，供宿主状态命令同步使用。 |
| `DEGRADED_WARNING` / `DEGRADED_RESPONSIBLE_PARTY` / `DEGRADED_LIMITATIONS` | 供宿主和文档复用的显式告警文本。 |
| CLI `--capability` | `node extensions/pstack/verification-exec.mjs --capability` 输出 JSON，便于 setup status 接线。 |

### 明确的限制（不是沙箱）

降级结果和能力查询都列出以下限制，不把它们称为隔离：

- 网络未阻断；验证代码可以建立网络连接。
- 写入未阻断；临时工作区之外仍可写当前用户可写的任意路径。
- `node_modules` 是源 checkout 的可读写穿透软链；通过它写入会影响源 checkout。
- 只清理凭据类环境变量；当前用户可读的凭据文件仍可被读取。
- 不限制同用户信号、子进程、CPU、内存、磁盘；只有超时和输出上限。
- 宿主不允许创建 worktree 元数据时使用临时 shared clone，结果里的 `workspace` 会写明 `temporary-git-checkout`。

责任人：授权在该主机上运行 verifier 的操作者；结果中通过 `responsibleParty` 明确记录。

### 验证

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm ci --include=dev` | 0 | 安装 devDependencies；未修改 `package.json`/锁文件。 |
| `node --test scripts/verification-exec.test.mjs` | 0 | 19 tests，19 pass，0 fail，0 skipped。 |
| `node --test scripts/verifier-child.test.mjs` | 0 | 1 test，1 pass；真实 Pi child 通过 `verification_exec` 执行 fixture `npm test`，写与 push 被拒。 |
| `node extensions/pstack/verification-exec.mjs --text "git status --porcelain"` | 0 | 无 OS 沙箱时降级执行，`STATUS: passed`、`EXIT CODE: 0`，输出 `WARNING`/`RESPONSIBLE`/`LIMITATION`。 |

真实行为覆盖：

- fixture `npm test` 成功返回 exit 0，失败脚本返回真实 exit 7；失败不会被当成启动失败。
- 降级工作区包含当前已跟踪改动和未跟踪文件；fixture 内写出的 `artifact.txt` 不落回源 checkout。
- 非 Git 目录明确返回 `unavailable`。
- 超时杀死整个进程组，后代不再写 heartbeat；多字节输出按字节截断。
- 生产 `pstack.verifier` child 在无 OS 沙箱环境下仍执行 fixture `npm test`，真实得到 exit 0，并拒绝写文件和 `git push`。

### 已修复的递归回归

本分支实现降级后，旧测试曾用 `runVerification('npm test', { cwd: <package-root>, sandbox: { available: false } })` 验证“拒绝”，降级逻辑因此真的在仓库根执行完整 `npm test`，再次进入同一测试文件，形成递归。

修复：所有 `runVerification` 测试调用改为最小独立 Git fixture；新增 `assertIsolatedFixture`，在启动任何命令前拒绝包仓库路径、临时根之外路径和非 `pstack-verify-fixture-` 目录。该护栏本身有独立测试。递归进程树由主控按根 PID 清理。

## A6：feature / opening-a-pr 完成前自检

### 机器接口

`extensions/pstack/publication-gate.mjs` 新增 async `verifyPublicationCompletion(options)`、`completionExitCode(result)` 和 `runCompletionCli`。CLI：

```bash
node extensions/pstack/publication-gate.mjs completion --authorized [--pr <number>] [--receipt-path <path>]
```

它**不读取手写布尔证据文件**，只执行固定参数的只读命令：

| 检查 | 真实命令 |
| --- | --- |
| 本地 HEAD | `git rev-parse HEAD` |
| 上游分支 | `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` |
| 是否已 push | `git rev-list --count <upstream>..HEAD`，必须为 0 |
| PR 是否存在 | `gh pr view [<number>] --json number,url,state,headRefOid,headRefName,baseRefName,body` |
| PR head 是否对应当前 HEAD | 比较 `headRefOid` 与本地 HEAD |
| PR body 与 Verification | 复用 `validateBody`（固定 headings 和 receipt 计数）并读取真实 `## Verification` 文本 |

判定：

- `authorized !== true`：`blocked`，exit 126，在任何 git/gh 调用前返回；自检不能授予 push/PR 权限。
- 没有 upstream、或本地有提交未 push：`incomplete`，exit 1。
- `gh pr view` 失败、PR head 不匹配、PR 非 OPEN/MERGED：`incomplete`。
- PR body 缺 heading/计数无 receipt：`incomplete`。
- `## Verification` 明确写 `FAIL`：`incomplete`；即使同时写了 responsible verifier 也不能覆盖已执行的 FAIL。
- `pstack.verifier` 写 PASS/PASS+NOTES，或 verifier 为 BLOCKED 且记录了 responsible verifier：在其余条件满足时 `complete`，exit 0。
- `--pr` 非数字：`blocked`，exit 126。

测试分两层：单元测试注入 `run`，断言实际请求的 git/gh argv；生产 CLI 测试把一个假的 `git`/`gh` 放到 `PATH`，通过子进程真实调用 CLI，并检查两个可执行文件确实被调用；未授权 CLI 断言零调用。

`loop.mjs` 的既有 predicate 语义不需要改动：exit 0 停止为 completed，exit 1 在预算内继续，exit 126 落入 `predicate-error` 停止；operator abort、turn error 和预算耗尽仍优先停止。`scripts/loop.test.mjs` 新增 A6 用例覆盖这四条边界。

### Playbook

模板（源文件）已更新，生成物由 `npm run generate` 产生：

- `opening-a-pr.md.template`：PR 前派 `pstack.verifier`，结果写 `## Verification`；新增完成自检，push/PR 未授权时显式 `BLOCKED`，只有 branch pushed + PR created + `gh pr view` 成功才算完成；给出 completion CLI 和 0/1/126 语义。
- `feature.md.template`：step 8 前派 verifier，结果入 Verification；完成自检同上，未授权外部步骤必须阻塞。
- `bug-fix.md.template`：在 Opening a PR 前派 verifier，结果入 Verification；不可用则记录责任人。
- `shipping.md.template`：每个 PR 的 Verification 必须写 verifier 结论或责任人；自审、绿 CI、完成通知不算 verdict。

### 验证

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node --test scripts/publication-gate.test.mjs` | 0 | 30 tests，30 pass，0 fail。 |
| `node --test scripts/loop.test.mjs` | 0 | 14 tests，14 pass，0 fail。 |
| `node --test scripts/publication-host.test.mjs` | 0 | 1 test，1 pass；生产 Pi gate 仍拦截坏 commit/PR。 |
| `node extensions/pstack/publication-gate.mjs completion` | 126 | 未授权：`blocked`，在任何 git/gh 调用前返回。 |
| `node extensions/pstack/publication-gate.mjs completion --authorized` | 1 | 对真实工作树只读执行：读到 HEAD `a9b36f1...`，检测到无 upstream、`gh pr view` 无 PR，返回 incomplete；没有 push/PR 写入。 |
| `npm run check:generate` | 0 | `{"status":"passed","checked":117,"unmanaged":0}`。 |
| `npm run generate` | 0 | 最后一次 `{"status":"passed","generated":117,"written":2}`（opening-a-pr、feature）；第一次还包括 bug-fix、shipping。 |
| `npm test` | 0 | 完整套件通过，包含上述 19 + 30 + 14 + 1 + 1 个相关用例，无 `not ok`。递归修复后再次运行未再出现测试递归。 |

## 未完成与阻碍

1. **真实 p-queue E2E 未执行**：本机未找到 p-queue checkout，且需要外部授权才能 push/创建 PR。因此“至少一次真实 p-queue 流程调用 `pstack.verifier` 且 PR `## Verification` 有结论”尚未取得证据。不能把 fixture 或本地单元测试冒充该验收；需主控提供 checkout、push/PR 授权后复测。
2. **共享接线需主控处理**：
   - `extensions/pstack/index.ts`：在 `/poteto-mode status` 或 `/setup-pstack status` 的 `capabilities` 中加入 `await getVerificationCapability()`（或 `capabilityFromSandbox`），让用户看到 `degraded`、`warning`、`responsibleParty`、`limitations`。
   - `README.md` 第 34 行仍写“缺少可用沙箱会拒绝执行”，与本次降级行为冲突，需要主控更新。
   - `adapters/pi/overrides/agents/verifier.md.template` 及其生成的 `agents/verifier.md` 仍写“无沙箱则拒绝执行”；需要主控改为“无沙箱则降级并显式告警/限制”，再重新生成。
3. `package.json` 的 `check` 已包含 `verification-exec.test.mjs`、`verifier-child.test.mjs`、`publication-gate.test.mjs`、`publication-host.test.mjs` 和 `loop.test.mjs`，本分支没有新增测试文件，不需要改共享脚本。
4. `docs/port-map.json`、`CHANGELOG.md`、入口 `index.ts`、`AGENTS.md` 未改；由主控统一整合。

## 复现命令

```bash
npm ci --include=dev
node --test scripts/verification-exec.test.mjs
node --test scripts/verifier-child.test.mjs
node --test scripts/publication-gate.test.mjs
node --test scripts/loop.test.mjs
node --test scripts/publication-host.test.mjs
npm run check:generate
node extensions/pstack/verification-exec.mjs --capability
node extensions/pstack/verification-exec.mjs --text "git status --porcelain"
```

真实 OS 沙箱分支需要宿主允许 `sandbox-exec` 或提供 bwrap；本机在 DSH 工作区只能验证降级分支，这一点已在上面的限制中说明。
