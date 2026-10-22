# 0.3.4 集成验收与 CI 发布结果

基线：`6c525a2`（0.3.3）。本记录只将实际执行结果列为已验证，未完成项不能当作发布通过。

## 0.3.4 已由 GitHub Actions 正式发布

- 发布提交：`b24bd722410f205e68df849fa0127d35ca3495bd`，附注 tag `v0.3.4`。
- 远端 Actions 运行全部成功变绿（exit 0）：
  - [publish run 39732278518](https://github.com/jiangkoumo/pi-pstack/actions/runs/39732278518)：`success`。包含 macOS `verifier-sandbox` 任务（`PSTACK_VERIFY_REQUIRE_SANDBOX=1` 真实 OS 沙箱测试通过，耗时 12s）以及 `publish` 任务（包含包门禁、生成门禁、保真度门禁，于 2026-10-22T06:13:17Z 成功发布至 npm registry）。
  - [tag check run 39732278533](https://github.com/jiangkoumo/pi-pstack/actions/runs/39732278533)：`success`。
  - [main check run 39732274782](https://github.com/jiangkoumo/pi-pstack/actions/runs/39732274782)：`success`。
- npm registry 在线验证：
  - `npm view @jiangkoumo/pi-pstack@0.3.4 version dist-tags dist.integrity --json --registry=https://registry.npmjs.org/` 退出码 0。
  - `version`: `0.3.4`，dist-tag `latest`: `0.3.4`。
  - `integrity`: `sha512-MxI965i9dKa0CAPZi8xLKtHl9YuW1f4mi4E20V6v0h9QnmIm+F7UcuNFViElCJOjBHUXXmv5jPEDS1K7CMZ0RA==`。
  - `tarball`: `https://registry.npmjs.org/@jiangkoumo/pi-pstack/-/pi-pstack-0.3.4.tgz`。

---

## 本次修复核心与验证依据

1. **前台子代理扩展工具加载修复**：
   - 原因：前台子代理（`async: false`）在父会话进程内执行，绝不加载父进程的 ambient 扩展；此前未显式提供扩展路径，导致 `pstack.verifier`（`verification_exec`）与 `pstack.comment-sicko`（`git_read`）在 `agent_start` 阶段抛出 `formatChildToolDiagnostic` 错误。
   - 修复：在 `verifier.md.template` 和 `comment-sicko.md.template` 源模板及生成物中声明 pi-subagents 公开字段 `subagentOnlyExtensions: ../extensions/pstack/index.ts`。前台子代理将其作为额外路径显式加载；后台子代理保持 ambient 扩展加载，且不声明 `extensions: [...]`，完全保留 A4 修复的第三方 provider 扩展能力。
2. **测试覆盖与门禁保障**：
   - `scripts/verifier-child.test.mjs`：分别测试前台（`async: false`）与后台（`async: true`）派发 `pstack.verifier`，4 次子代理请求均成功调用 `verification_exec` 真实执行 `npm test` 并拒绝未授权写入与 push。在沙箱环境下（`PSTACK_VERIFY_REQUIRE_SANDBOX=1`）同样一次成功，无 `agent_start` 报错。
   - `scripts/generate-pi-resources.mjs`：增加 `subagentOnlyExtensions` 字段白名单与只读扩展工具声明强校验。
   - `scripts/check-p3-agents.mjs`、`scripts/generation.test.mjs`、`scripts/role-agents.test.mjs`、`scripts/comment-sicko.test.mjs` 补充对应断言并全量通过。
