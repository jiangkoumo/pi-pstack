# #22：待 Hark E2E

状态：待 Hark E2E。操作者提供了本地 bare forge + gh shim 的复现方法，并明确允许将此项交给 Hark。本机两次 `git clone https://github.com/sindresorhus/p-queue.git /Users/jiangkoumo/pq-e2e/pq` 都返回 exit 128，原因是无法连接 github.com:443；没有取得固定基点，未启动模型任务，不记录虚构的 Continue 次数或 PR 成功。

本地已创建 `/Users/jiangkoumo/pq-e2e/bin` 和 `/Users/jiangkoumo/pq-e2e/evidence`。没有创建源仓库、forge、分支或 PR。以下是待执行交接，不是已经跑过的结果。

## 环境与基点

- pstack：本地 main，0.3.3，整合代码提交 `d50262b`；后续仅增加验证记录。使用当前源码包及锁定 pi-subagents 0.79.2，不修改操作者全局配置证明安装。
- p-queue：`sindresorhus/p-queue`，固定提交 `7f272ab`（操作者指定 10.0.0 基点）。拿到完整 clone 或含该提交的离线 Git bundle 后，核对提交及 package.json；先记录 `npm install && npm test` 的真实退出码和各工具测试数。
- 在独立验收目录创建 bare `forge.git`，将它作为 origin。原 GitHub origin 改名 upstream；本次只允许推送到本地 origin。
- 新 Pi session，先 `/poteto-mode on`，然后任务；模型 `opendesign/deepseek-v4.1-flash`。保留 session 路径、包版本、角色模型和实际工具日志。
- 正式流程需要真实 `pstack.verifier` child 调用 `verification_exec` 运行项目的 `npm test`；确定性 provider fixture 不能替代本项模型行为验收。

## gh shim 契约

PATH 最前面放验收目录的 `bin/gh`，所有调用记录到 `gh-calls.log`。`pr create` 保存实际 title/body（支持 `--body` 和 `--body-file`），记录调用，返回本地模拟 PR URL。不要调用真实 GitHub API。

`pr view` 除操作者示例中的 number/state/url 外，还应从保存的 PR 及本地 forge 返回 `headRefOid`、`headRefName`、`baseRefName`、`body`。这是当前 publication completion CLI 的读取字段；不得硬编码一个成功 head 或没有发生过的 PR。

- 没有执行过 `pr create` 时，`pr view` 必须失败。
- `headRefOid` 从 forge 中实际已推送分支读取，不能仅取工作区 HEAD；否则未 push 也会假完成。
- PR body 返回 `pr create` 时实际保存的内容。
- 不支持的 gh 写操作失败；不 merge。

## 原始任务

```text
Implement sindresorhus/p-queue issue #177 "Feature request: Ability to change interval and intervalCap at runtime". Issue text: "As far as I can tell currently there is no way to change the interval and/or intervalCap at runtime. Is there any chance for this to be implemented? The current solution is great if you know in advance that you want to run tasks at a steady rate. However, in more dynamic use cases changing interval or intervalCap would be very useful." Ship it as a PR against main on the origin remote. You are authorized to create a branch, commit, push that branch to origin, and open the PR with gh. Do not merge.
```

这里的 origin 是本地 bare forge；授权不扩展到真实 GitHub push、PR、合并或发布。

## 催促与时间

给足 80–120 分钟。模型停止且任务未完成时只发 `Continue.`，逐次记录时间、当时分支/PR 状态和次数。普通后台 child 完成通知不计人工催促；不要改写成额外指导来绕过计数。成功标准是人工催促不超过一次。

## 验收与交付

1. forge 里存在实现分支；`gh-calls.log` 有真实 `pr create` 记录。
2. commit/PR title 是 Conventional；body 含 Why / What changed / Scope / Tradeoffs / Blast Radius / Verification。
3. 至少一次真实 `pstack.verifier` 执行该项目 `npm test`；报告实际退出码，并把结论写入 PR Verification。若执行降级，保留完整告警，不把它当成 OS 隔离保证。
4. 人工 `Continue.` 不超过一次，提供计数日志。
5. 从本地 forge 独立 clone 实现分支，安装依赖，`npm test` 全绿；按本次实际输出报告 xo/ava/tsc/tsd 的结果，不能照抄上轮 304/304。
6. 返回源基点/实现 head、session 日志路径、verifier 调用与命令证据、PR title/body、forge refs、独立 clone 测试命令/退出码/计数。缺一项明确记未完成。

当前 #21 CHANGELOG/打包要求已在本地实现并实测；#22 的模式持久化、精确 ≥94% 保真度和干净 clone 检查已有 [Stage A 证据](validation-stage-a.md)。本文所列 p-queue E2E 及催促次数仍待执行。
