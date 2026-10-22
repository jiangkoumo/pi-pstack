# 0.3.3 集成验收与 CI 发布结果

基线：`a9b36f1`（0.3.2）。本记录只将实际执行结果列为已验证，未完成项不能当作发布通过。

## 0.3.3 已由 GitHub Actions 发布

- 发布提交：`6e633e9f2aa7901b2079a6b6f2900202013033fe`，附注 tag `v0.3.3`（`cb2c1dfaa8cc5882f12bd6a9aa3ee0370100c45d`）。
- 远端 Actions 运行全部变绿：
  - [publish run 39728866547](https://github.com/jiangkoumo/pi-pstack/actions/runs/39728866547)：`success`。包含 macOS `verifier-sandbox` 任务（`PSTACK_VERIFY_REQUIRE_SANDBOX=1` 真实 OS 沙箱测试通过，耗时 14s）以及 `publish` 任务（包门禁、生成、保真度门禁全过，于 2026-10-22T05:37:07Z 发布到 npm registry）。
  - [tag check run 39728866527](https://github.com/jiangkoumo/pi-pstack/actions/runs/39728866527)：`success`。
  - [main check run 39728864183](https://github.com/jiangkoumo/pi-pstack/actions/runs/39728864183)：`success`。
- npm registry 在线验证：
  - `npm view @jiangkoumo/pi-pstack@0.3.3 version dist-tags dist.integrity --json --prefer-online` 退出码 0。
  - version: `0.3.3`，dist-tag `latest`: `0.3.3`。
  - integrity: `sha512-iq33uCu1mIIsp4c8b5omFmJdqY/n0lZ0chIPziZkbYPY0jbTe36Oz+tTav1K43HmMB3g+Ne5JCFJdC7Mxof8eQ==`。

---

## 本地干净 clone 与整合检查实测

主控提交 `6e633e9` 之前通过 `npm run check:ci` 进行了本地独立 clone 检验：
- `npm ci --include=dev && npm test`：退出码 0，耗时 60128ms（远低于 180s 门禁），243 tests passed，0 failed，0 skipped，自然退出。
- `npm run check:generate`：退出码 0，117 checked，0 unmanaged。
- `npm run check:fidelity`：退出码 0，111 文件，4231/4501 = 94.00133%，严格满足 `>=94%` 要求，errors=[]。

---

## 阶段 A（0.3.3）各 Issue 交付与解决

### A1 & A4（Issue #18）：超时守护、进程生命周期与 provider 扩展保留
- 实现了跨平台超时/杀进程树的 runner（`scripts/run-checks.mjs`），并将 package.json 的 `check` 与 `test` 命令接入。
- 为真实 SSE/SDK 检查增加了 keep-alive 连接清理与有界等待；修复了 SIGINT/SIGTERM 中断时清理 detached 孤儿进程的能力。
- 移除了 fixture 中空 `extensions: []`，消除了 ambient 扩展禁用警告；补充了第三方 provider 扩展在 child 中保留可用的断言。
- 对应提交：`eb7c69d`，合入主干 `7f95ef4`。

### A2 & A6（Issue #19）：verifier 降级工作区与发布完成自检
- 实现了无 bwrap/seatbelt 时的 Git 工作区降级执行（`extensions/pstack/verification-exec.mjs`），提供 `getVerificationCapability()` 接口，在 `/poteto-mode status` 和 `/setup-pstack status` 中诚实暴露 `degraded: true`、告警与局限性。
- 在 `publication-gate.mjs` 中实现了发布完成自检：真实执行只读 Git 与 `gh pr view`，严格校验本地 HEAD 与已 push 分支、PR 状态、PR 编号/链接，以及 `## Verification` 必须有 verifier 结论或责任人；未授权返回 blocked 126。
- 修复了 CI 中 macOS 沙箱强制覆盖的断言缺口，严格模式下无可用沙箱直接失败。
- 对应提交：`09fe615`，rebase 后 `54f9e2d`，合入主干 `84bff00`。

### A3（Issue #20）：ketchup 与 recall 路由边界切分
- 新增 `ketchup` 覆盖模板，正文与固定上游完全一致，仅 description 明确界定当前会话 catch-up；收窄 `recall` 仅负责过去会话。
- 路由语料库扩展为 48 项（保留原 46 项，新加 2 项 ketchup），单次 live 普查取得 48/48 全部命中；离线路由测试 11/11 全过。
- 对应提交：`a85f706`，rebase 后 `075c7e6`，合入主干 `42a033a`。

### A5（Issue #21）：CHANGELOG 补齐与打包校验
- 补齐了 0.3.0 到 0.3.3 的变更记录至 `CHANGELOG.md`，纳入 package.json `files` 清单。
- 在 `scripts/check-package.mjs` 中断言 CHANGELOG 存在且包含当前版本号标题。实际打包 516 个文件（含 CHANGELOG）。
- 对应提交：`8f89d13`。

### A7（Issue #22）：模式持久化与保真度核实
- 模式开启后立即 status 在无 assistant 消息落盘前即报告 `persistent: true`（`mode-persistence.test.mjs`）。
- 指定脚本保真度整体提高并锁定在精确 `>=94%`（实际 94.00133%）。

---

## 仍未完成项与客观阻碍说明

1. **p-queue 真实 PR E2E 与长任务催促计数（Issue #22）**：
   - 操作者提供了本地 bare forge + gh shim 的复现方案，但获取源码所需的 `git clone https://github.com/sindresorhus/p-queue.git` 两次均因无法连接 GitHub 443 端口退出 128。
   - 按操作者允许的降级方案，将该项交接给 Hark（见 `docs/hark-pqueue-e2e.md`），Issue #22 保持开放等待 Hark 证据。不伪造催促计数或 PR 结果。
2. **verifier 降级执行的隔离限制**：
   - 降级工作区执行不阻断网络，也不阻断对工作区外文件的修改（包括通过 node_modules symlink 的修改），且 Git 忽略文件不被复制。这些局限性已在 capability 输出中诚实标注，不能作为 OS 物理沙箱隔离依据。
