# 开发、测试与发布

## 本地开发

从源码运行测试或二次开发时，执行 `npm ci --include=dev && npm test`。显式包含开发依赖可以覆盖本机的 `NODE_ENV=production` 或 npm `omit=dev` 设置；改依赖时执行 `npm install --include=dev` 并提交更新后的锁文件。

## 质量门禁

本项目采用“固定上游源码（`upstream/`）+ Pi 适配层（`adapters/pi/`）+ 生成分发资源（`skills/`, `agents/`）”的设计：
* `npm run check:generate`：校验固定上游指纹与生成产物，拒绝漂移；当前检查 131 项资源；
* `npm test`：执行模式持久化、Loop 状态机、生成器、Writer Gate 与保真度门禁行为测试；
* `npm run check:fidelity`：运行指定上游文本对比脚本，要求整体至少94%、每个已移植Markdown至少70%；
* `npm run check:sim`：真实代码库端到端闭环实测。

## 端到端模拟（`npm run check:sim`）

本项目不仅通过了纯逻辑单测，还在真实的业务代码库（`ledger-app` 金融计算工程）中完成了端到端全链路闭环模拟实测：
1. **真实 Bug 注入**：计算模块存在浮点精度漂移 Bug，单元测试真实失败（exit code 1）；
2. **模式与循环驱动**：激活 `/poteto on`，启动 `/loop run --max-turns 4 --until "node --test test/calculator.test.mjs"`；
3. **真实谓词收敛**：经过 2 轮迭代，模型修复业务精度，测试命令返回 exit code 0，系统自动检测并标记 `completed (predicate-satisfied)` 停止；
4. **机械门禁安全合入**：生成二进制补丁，恢复源工作区，经只读审阅报告校验通过后由 `writer-gate.mjs --apply` 安全合入代码。

## 发布

发布由 tag 驱动：推送 `v*` tag 后，`.github/workflows/publish.yml` 校验 tag 与 `package.json` 版本一致，运行 `npm test`、`npm run check:generate` 和 `npm run check:fidelity`，再发布 npm。0.3.2 的发布目标是由 CI 完成；可信发布者配置与实际结果记录在 [集成验收](validation-032-release.md)。

本地一键发布：

```bash
npm run release -- patch --dry-run   # 跑门禁、显示下一版本，不改文件
npm run release -- patch             # 仅本地 commit + annotated tag
npm run release -- patch --push      # 再 push commit 与 tag
npm run release -- patch --publish   # npm publish 并 push commit 与 tag（需先 npm login）
```

`--publish` 隐含 `--push`；脚本默认只接受 `main` 分支、要求工作区干净，并在任何写入前跑完门禁。支持 `patch` / `minor` / `major`。CI 发布前需在仓库 Settings → Secrets 配置 `NPM_TOKEN`；预发布版本会自动使用 `next` tag。本地 `--publish` 后 tag 仍会触发 workflow；workflow 会检查该版本是否已存在于 npm，已发布则跳过，避免重复发布。
