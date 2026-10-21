# verifier 受限执行（Issue #13）

状态：**受限执行模块、拒绝规则、OS 沙箱执行和失败处置已实现并实测；仓库完整 `npm test` 在严格禁网策略下返回真实 exit code 1，原因是测试自身需要 loopback 监听。** 这个限制按设计保留，没有为了跑绿而放宽网络策略。主控负责的入口注册、生成产物与共享检查尚未接线，见文末。

对应 Issue：<https://github.com/jiangkoumo/pi-pstack/issues/13>。来源中的 0.3.1 复测报告（p-queue #177 流程通过 307/307）属于待验证推断；本次没有复现该流程，也没有把它当作已证实根因。本次范围是 verifier 只能读、不能实际执行验收命令的能力缺口。

## 已实现

### 1. 纯校验与执行分离

新增 [extensions/pstack/verification-exec.mjs](../extensions/pstack/verification-exec.mjs)，导出：

| 接口 | 作用 |
| --- | --- |
| `parseVerificationCommand(command)` | 纯函数；返回 `{ok, argv, program, category}` 或拒绝原因。不访问文件系统、不启动进程。 |
| `runVerification(command, options)` | 解析后在实际 OS 沙箱内执行；返回 `exitCode`、`status`、`stdout`、`stderr`、耗时和沙箱类型。 |
| `renderVerificationResult(result)` | 给模型的结果文本，始终显式打印 `EXIT CODE` 和 `ENFORCEMENT`。 |
| `createVerificationTool()` | 给宿主直接 `pi.registerTool(...)` 的工具定义，工具名 `verification_exec`。 |
| `detectSandbox()` / `buildSandboxProfile(scratch)` | 沙箱探测与 seatbelt profile 构造，便于测试和诊断。 |

`ok: true` 只表示命令确实启动并收集到状态，不表示命令通过；拒绝或沙箱不可用是 `ok: false`。状态为 `passed`、`failed`、`timed-out`、`aborted`、`refused`、`unavailable` 或 `launch-failed`。

### 2. 命令语法（意图过滤）

只接受 `npm`、`node` 和只读 Git：

| 类别 | 允许 | 说明 |
| --- | --- | --- |
| 测试/构建/lint | `npm test`、`npm run test|lint|build|typecheck|check|verify|format|fmt|coverage[:子任务]` | 不允许 `install`、`publish`、`exec`、`audit`、`pack`、`npx` 或额外参数 |
| Node 测试 | `node --test [仓库内路径...]` | 路径不能是绝对路径或包含 `..` |
| Node 语法检查 | `node --check <仓库内 .js|.cjs|.mjs>` | 只做语法检查 |
| 仓库脚本 | `node <仓库内 .js|.cjs|.mjs>` | 仍是仓库代码，由 OS 沙箱兜底 |
| 只读 Git | `git status|diff|show|log|rev-parse` | 选项白名单；禁止 `--output`、`-c`、`--exec`、`--ext-diff`、`--textconv`、全局 Git 选项和写子命令（`push`、`commit`、`fetch` 等） |

拒绝 shell 组合、重定向、管道、命令替换、引号、通配符、`env` 前缀、多行命令、`sh -c`、`bash -c`、`node -e/-p/--input-type`。执行使用 `spawn` 的 argv，不经过 shell。

**这不是安全边界。** `npm test` 执行 `package.json` 里的任意代码，包括 `pretest`/`posttest` 等生命周期脚本；字符串白名单只限制“请求长什么样”，不限制仓库代码在沙箱内做什么。

### 3. OS 沙箱执行

| 平台 | 实现 | 约束 |
| --- | --- | --- |
| macOS | `/usr/bin/sandbox-exec` seatbelt profile | `(deny network*)`；`(deny file-write*)`，只允许真实路径的私有 scratch 目录和 `/dev/null`、`/dev/stdout`、`/dev/stderr`、`/dev/tty` |
| Linux | bubblewrap `bwrap` | `--unshare-all`（含网络命名空间）；根文件系统只读，只把私有 scratch 目录 bind 为可写 |
| 其他/不可用 | 拒绝执行 | 返回 `unavailable`，不会退化成“只做 argv 白名单” |

每次执行创建临时 scratch，并设置 `TMPDIR`/`TMP`/`TEMP`、`npm_config_cache`、`npm_config_logs_dir`、`GIT_OPTIONAL_LOCKS=0`、`GIT_PAGER=cat`、`GIT_EXTERNAL_DIFF=`、`GIT_TERMINAL_PROMPT=0`，结束后删除。macOS 上必须先把 `os.tmpdir()` 的 `/var/folders/...` 解析为 `/private/var/...`，否则 seatbelt 的 subpath 规则匹配不到真实 vnode，scratch 实际不可写；这个 bug 在真实验证中被抓到并修复。

`runVerification` 的 `ok`、`status` 和 `exitCode` 不会被沙箱探测或拒绝逻辑混用；命令失败不会被伪装成启动失败。

## 实际验证

### 基线（修改前）

| 命令 | 结果 |
| --- | --- |
| `NODE_ENV=development npm run check` | exit 0 |
| `NODE_ENV=development npm test` | exit 0，62s；20 个 TAP 组合计 162 pass、0 fail；另有 `check-package` 的 JSON 通过 |

依赖安装注意：本机 shell 带 `NODE_ENV=production`，直接 `npm ci` 会跳过 devDependencies 并生成空 `node_modules`；基线使用 `NODE_ENV=development npm ci --include=dev` 安装。`package-lock.json` 未提交。

### 新模块单测

```bash
PSTACK_VERIFY_REQUIRE_SANDBOX=1 NODE_ENV=development node --test scripts/verification-exec.test.mjs
# exit 0；15 tests，15 pass，0 fail，0 skipped
```

覆盖 15 项：

1. 拒绝重定向（`>`、`>>`、`2>&1`）、`&&`、`;`、管道、命令替换、反引号和换行注入。
2. 接受 `npm test`、`npm run lint`、`npm run check:p3`、`node --test`、`node --check`、仓库 node 脚本、只读 Git 组合。
3. seatbelt profile 含 `deny network*`、`deny file-write*`，只允许 scratch subpath。
4. 沙箱不可用或未知类型时严格拒绝，不回退到 argv 校验。
5. 拒绝结果渲染为 `REFUSED`。
6. 工具定义契约（名称、必填 `command`、禁止额外字段）。
7. 沙箱内真实 `git status --porcelain`，exit code 0。
8. 沙箱内 `npm test` fixture，exit code 0，stdout 含 `FIXTURE_PASS`。
9. 沙箱内失败 fixture，真实 exit code 7，状态 `failed`。
10. 恶意 npm 脚本：向 fixture 内和 `../` 写文件均 `EPERM`，连 `127.0.0.1` 被拒；脚本捕获异常后仍 exit 0，但文件和连接都不存在。
11. 恶意直接 `node` 脚本：同样的写入和 loopback 拒绝。
12. scratch 正例：构建脚本可在私有 scratch 写文件并正常退出。
13. 多字节截断：4,000 个 `汉` 在 1,024 字节上限下输出，`outputTruncated` 为真，回传字符串按 UTF-8 重新编码仍不超过上限。
14. 进程树超时：测试脚本再 spawn 一个继承 stdout 的孙进程并持续写 heartbeat；600ms 超时后主进程和孙进程都被杀，heartbeat 不再增长，结果在 4s 内返回。
15. 简单超时正例：10s 脚本在 500ms 超时后被杀，状态 `timed-out`，不冒充通过。

超时/中止按进程组发送 `SIGKILL`（`detached` 让验证命令成为进程组组长），而不是只杀直接子进程；另有 2s 强制收尾定时器，防止存活后代一直占住 stdout 导致 `close` 永不触发。强制收尾只保证调用返回，不保证后代已死，所以真实测试用 heartbeat 文件验证后代确实停止写入。

输出收集按 `Buffer` 字节截断，不按字符；解码时若切在多字节字符中间，会裁掉替换字符直到重新编码不超过上限，并置 `outputTruncated`。

另有拒绝用例表（同一测试内逐条断言）：`git push`/`commit`/`fetch`、全局 Git 选项、`--output`、`--ext-diff`、`npm install`/`publish`/`run postinstall`/额外参数、`npx`、`curl`、`wget`、`sh -c`、`bash -c`、`env` 前缀、`node -e`/`-p`/`--input-type`/`--require`、绝对路径和 `..`。

没有沙箱时这些测试会 skip；`PSTACK_VERIFY_REQUIRE_SANDBOX=1` 会把 skip 变成失败，避免“跳过即通过”。本次真实运行没有 skip。

### 真实命令

```bash
node extensions/pstack/verification-exec.mjs --text "git status --porcelain"
# ok: true, sandbox: macos-seatbelt, status: passed, exitCode: 0

node extensions/pstack/verification-exec.mjs --text "node --test scripts/p2-runtime.test.mjs"
# ok: true, status: passed, exitCode: 0；8 tests，8 pass

node extensions/pstack/verification-exec.mjs --text "npm test"
# ok: true, status: failed, exitCode: 1（2.9s）
```

`npm test` 在沙箱内的真实失败点是 [scripts/loop.test.mjs:246](../scripts/loop.test.mjs) 的 host fixture：它需要在本机 `127.0.0.1` 上监听，严格禁网策略返回 `listen EPERM: operation not permitted 127.0.0.1`。同一命令在没有沙箱的基线运行是 exit 0、62s。这不是“普通无网络测试通过”被冒充成整套测试通过：verifier 如实报告了 1，也没有把网络放开。

### 嵌套宿主沙箱

当前 DSH 工作区本身禁用了嵌套 `sandbox_apply`：在普通工作区权限下运行 seatbelt 会得到 `sandbox-exec: sandbox_apply: Operation not permitted`（exit 71）。模块据此返回 `unavailable` 并拒绝执行；验收中的真实沙箱结果是在一次性宽权限下取得的。这个现象说明“宿主外层沙箱 + verifier 内层沙箱”可能不兼容，不应把 `detectSandbox()` 的失败当作命令失败，也不应静默降级。

## 信任边界（明确不声称的部分）

1. **命令白名单不是沙箱。** 它只约束请求形状。`npm test`、`npm run build`、`node <script>` 都执行仓库控制的代码；恶意的 `package.json` 可以尝试任何系统调用。
2. **OS 沙箱是本地尽力而为的约束，不是形式化保证。** macOS `sandbox-exec` 是 Apple 已弃用的 API；bubblewrap 依赖内核和 user namespace 配置；内核漏洞、沙箱实现缺陷不在防护范围。
3. **不限制读取。** 仓库代码可以读取当前用户可读的密钥、其他仓库和主目录。验证执行不应被描述为“隔离机密”。
4. **不限制进程信号和资源。** 可以杀同用户进程、创建大量子进程、消耗 CPU/内存/磁盘（scratch 无配额）。超时/中止按进程组 `SIGKILL`，并用 2s 强制收尾兜底；强制收尾只保证调用返回，极端情况下不能证明所有后代已终止，需要宿主侧进程审计。
5. **不做可信命令快照。** argv 被冻结，但 `package.json`、脚本内容、`node_modules` 和 `PATH` 解析在执行时读取，另一个进程可以改动它们（TOCTOU）。仓库控制的 `PATH` 条目也可能替换 `npm`/`node` 并伪造 exit code；沙箱能兜住写入和网络，但不能证明“跑的是审阅过的那份脚本”，也不能证明“exit 0 等于测试真的执行了”。
6. **网络策略是 deny-all，包括 loopback。** 因此需要本机端口的测试套件在 verifier 下必然失败。这是有意的取舍：Issue 要求禁止网络，默认不开放 loopback。
7. **只支持 macOS 和 Linux + bwrap。** 其他平台或没有 bwrap 的主机只能得到明确的 `unavailable`。
8. **输出是截断采集。** 每个流默认最多 128 KiB，按字节截断；多字节字符切边会裁掉替换字符。完整日志不落盘，模型看到的是截断副本。

### 关于完整仓库测试

严格禁网下完整 `npm test` 不能作为本仓库的绿色验收命令。可选路线需要主控/操作者决定，本次没有实现：

- 保持 deny-all，verifier 只运行不依赖 loopback 的子集，并在报告里标注完整套件 blocked；
- 增加显式 `network: 'loopback'` 策略，只在操作者批准时使用，并把“允许本机端口”写进结果和文档；
- 在单独的网络命名空间里提供 loopback-only 的测试宿主，仍然阻断外部网络。

在这三条中任选其一之前，不应把完整 `npm test` 的 exit 0 说成受限执行已经覆盖。

## 主控待接线（不在本分支）

本分支只改 Issue 允许的四个路径。以下共享文件需要主控在合并前后处理：

1. `extensions/pstack/index.ts`：注册工具。
   ```ts
   import { createVerificationTool } from './verification-exec.mjs';
   // 在既有 registerTool 能力检查内：
   if (typeof pi.registerTool === 'function') pi.registerTool(createVerificationTool());
   ```
2. `scripts/generate-pi-resources.mjs` 第 163 行：`allowedReadOnly` 加入 `verification_exec`。当前生成器把只读代理限制为 `read/grep/find/ls/git_read`，因此模板改动后 `node scripts/generate-pi-resources.mjs --check` 会以 `Forbidden tool granted to read-only agent: verification_exec in agents/verifier.md` 退出 1。这是共享策略变更，不应由本分支绕过。
3. 重新生成 `agents/verifier.md`（模板已改为 `tools: read, grep, find, ls, verification_exec`）；不要手改生成物。
4. `scripts/check-p3-agents.mjs` 第 72 行：期望值改为 `["read", "grep", "find", "ls", "verification_exec"]`。
5. `scripts/generation.test.mjs` 第 77 行：正则改为 `^tools: read, grep, find, ls, verification_exec$`。
6. `package.json` 的 `check`：加入 `node --test scripts/verification-exec.test.mjs`；CI 的 Linux 任务需要安装 bubblewrap 才能真实覆盖沙箱分支，否则这些用例会 skip。
7. 如果希望完整仓库 `npm test` 在 verifier 下可跑，先决定上面的 loopback 策略。

在完成 2–5 之前，`npm run check` 会因生成器只读白名单、生成资源漂移和 verifier 工具期望不一致而失败；这是预期的共享接线缺口，不是本模块单测失败。

## 复现

```bash
NODE_ENV=development npm ci --include=dev
NODE_ENV=development node --test scripts/verification-exec.test.mjs
PSTACK_VERIFY_REQUIRE_SANDBOX=1 NODE_ENV=development node --test scripts/verification-exec.test.mjs
node extensions/pstack/verification-exec.mjs --text "git status --porcelain"
node extensions/pstack/verification-exec.mjs --text "node --test scripts/p2-runtime.test.mjs"
node extensions/pstack/verification-exec.mjs --text "npm test"
```

本机真实沙箱运行需要宿主允许 `sandbox-exec`；在 DSH 工作区权限下需临时宽权限，否则只能得到 `unavailable` 的拒绝证据。
