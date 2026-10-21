# 0.3.2 测试生命周期修复验收（Issue #11）

核对日期：2026-10-21。本机环境：macOS arm64、Node `v22.22.2`、npm `10.9.7`、Pi `1.3.0`、pi-subagents `0.79.2`。范围仅限 `scripts/comment-sicko.test.mjs`、`scripts/review-dispatch.test.mjs`、`scripts/check-review-diff.mjs` 及新增测试助手；不涉及扩展入口、依赖包源码或全局 Pi 配置。

## 问题与基线

Issue 报告两个测试在子测试通过后进程不退出，并重复输出 stale extension ctx，怀疑 pi-subagents 的 result-watcher 定时器未清理（待验证）。

先按修复前代码跑基线，每个文件单独起进程并带 75–150 秒看门狗：

| 文件 | 基线退出码 | 基线耗时 | 挂起 | stderr `stale` 次数 |
| --- | --- | --- | --- | --- |
| `scripts/review-dispatch.test.mjs` | 0 | 4s | 否 | 0 |
| `scripts/comment-sicko.test.mjs` | 0 | 17s | 否 | 0 |

本机未能复现“永不退出”：当前 pi-subagents 0.79.2 对多数 watcher 定时器调用了 `unref()`，进程仍能退出。但基线里 comment-sicko 的子测试本身只跑 2.4s，进程却拖到 17s，说明仍有计时器活过了 teardown；不能把“进程碰巧退出”当成清理成功。

新增探针 `scripts/test-session-lifecycle.test.mjs` 直接记录 teardown 后仍存活的 interval，在修复前的 teardown 上失败：

```text
Session disposal leaked 1 interval(s)
Timeout { [Symbol(refed)]: false, _idleTimeout: 1000, _onTimeout: [Function: reconcile], _repeat: 1000 }
```

## 根因

两个夹具都用 `createAgentSession()` 返回的 `AgentSession`，结束时只调用 `session.dispose()`。该方法是会话对象级清理，不发送 `session_shutdown`；发送该生命周期事件的是 Pi 的 `AgentSessionRuntime.dispose()`，而夹具并不持有 runtime。

结果是 pi-subagents 扩展的 `runtimeEntry.cleanup()` 从未执行：result watcher、wait reconciler 等 interval 保留下来，并继续使用会话失效后的 extension context。定时器被 `unref()` 时表现为拖慢退出或偶发不退出；在使能引用计数的版本/环境里就会表现为 Issue 描述的挂起和 stale ctx 循环。

## 修复

| 文件 | 改动 |
| --- | --- |
| `../scripts/test-session-lifecycle.mjs` | 新增共享助手：`disposeTestSession()` 先经公开的 `session.extensionRunner` 发送真实 `session_shutdown`（`reason: "quit"`），再调用 `session.dispose()`；`trackIntervals()` 记录/恢复 interval 句柄，供断言泄漏 |
| `../scripts/comment-sicko.test.mjs` | teardown 改用 `disposeTestSession()`；测试结束断言没有遗留 extension interval |
| `../scripts/check-review-diff.mjs` | `runReviewDiffFixture()` 的 teardown 改用 `disposeTestSession()`，`review-dispatch.test.mjs` 因而走同一生命周期 |
| `../scripts/test-session-lifecycle.test.mjs` | 新增独立探针：绑定真实 pi-subagents 扩展、确认 interval 已创建，teardown 后断言全部清除 |

没有使用 `process.exit()`，也没有靠 `unref()` 掩盖泄漏；清理由宿主公开的生命周期事件驱动。真实子代理验收保持不变：comment-sicko 仍启动真实 detached 后台 child，review-dispatch 仍启动 3 个真实前台 child。

## 修复后验证

| 检查 | 结果 |
| --- | --- |
| `node --test scripts/comment-sicko.test.mjs` | exit 0，3/3 通过，进程 3s 自然退出，stderr `stale` 0 次 |
| `node --test scripts/review-dispatch.test.mjs` | exit 0，1/1 通过，进程 3s 自然退出，stderr `stale` 0 次 |
| `node --test scripts/test-session-lifecycle.test.mjs` | exit 0，1/1 通过；同一探针修复前为 exit 1（泄漏 1 个 interval） |
| `npm run check` | exit 0，47s |
| `npm test`（含 upstream fidelity） | exit 0，47s（< 180s），TAP 无 `not ok` |

真实行为验收：comment-sicko 断言后台 run 写入 `status.json`、completion replay 成功、child session 带 `REVIEW_SAMPLE_JS`、ambient extension 在 detached runner（pid 不同、`asyncRunner=1`）加载；review-dispatch 断言 12 次真实 child 请求、写/改被真实工具注册表拒绝、三份报告都带回 `DIFF_EVIDENCE_*` 证据。

主控另在干净 clone 执行 `npm ci --include=dev && npm test`：63.0s、exit 0、无挂起。需要注意：本次修复前后都未能复现“永不退出”的原报告；泄漏证据来自 interval 探针（修复前遗留 1 个 1000ms `reconcile` interval），不是进程是否退出。

## 本地 pi-subagents 依赖与不再 skip

主控已在 `package.json` 固定 devDependency `pi-subagents@0.79.2`（本文件所在分支尚未 rebase 到该提交）。测试侧改动：

| 文件 | 改动 |
| --- | --- |
| `../scripts/check-review-diff.mjs` | `findSubagentsRoot()` 候选顺序改为：显式 `PI_SUBAGENTS_ROOT` → 仓库内 `node_modules/pi-subagents` → Pi agentDir 全局安装 → `~/.pi/agent` 全局安装 |
| `../scripts/review-dispatch.test.mjs` | 找不到 pi-subagents 时失败（明确提示安装本地 devDependency），不再 `t.skip` 静默跳过 |
| `../scripts/test-session-lifecycle.test.mjs` | 探针断言实际加载的 root 等于仓库本地依赖（显式 env 优先），确保真实装载本地包而不是全局安装 |

验证方式：本地安装 `pi-subagents@0.79.2`（`npm install --no-save --no-package-lock`，不改 `package.json`），再把 `HOME` 指向空临时目录并取消 `PI_SUBAGENTS_ROOT`，模拟“无全局安装”：

```bash
env -u PI_SUBAGENTS_ROOT HOME=/tmp/pstack-032-empty-home \
  node --test scripts/comment-sicko.test.mjs
env -u PI_SUBAGENTS_ROOT HOME=/tmp/pstack-032-empty-home \
  node --test scripts/review-dispatch.test.mjs
env -u PI_SUBAGENTS_ROOT HOME=/tmp/pstack-032-empty-home \
  node --test scripts/test-session-lifecycle.test.mjs
```

结果：三个文件均 exit 0；comment-sicko 3/3、review-dispatch 1/1、lifecycle 1/1，三者 `skipped 0`。review-dispatch 的 childRequests 仍为 12，说明在无全局安装时真实加载了仓库本地 pi-subagents 并执行了真实 child。

## 未完成与需主控处理

`package.json` 属于本 Issue 禁止修改的文件，因此独立探针 `scripts/test-session-lifecycle.test.mjs` 未加入 `check` 脚本。当前 `npm run check` 已经通过 `comment-sicko.test.mjs` 内的 interval 断言覆盖同类回归；主控若要把独立探针纳入 CI，建议在 `check` 中 `comment-sicko.test.mjs` 之后插入：

```text
node --test scripts/test-session-lifecycle.test.mjs &&
```

夹具临时目录仍保留原有的 500ms 等待后再删除，用于让真实后台 child 的收尾写入完成；该等待不是泄漏掩盖，teardown 的 interval 断言在删除完成后立即执行。
