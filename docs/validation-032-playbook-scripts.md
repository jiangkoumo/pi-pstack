# Playbook 脚本调用验收（Issue #15）

状态：实现与本地验收完成，等待主控统一生成 `skills/` 并合并。分支 `fix/15-playbook-script-calls`；固定上游 `f713f14203cd6420cec13cd7c55c32d598dbab68`。

## 改动范围

- `adapters/pi/overrides/skills/poteto-mode/playbooks/worktree-cleanup.md.template`：审计步骤改为调用随包发布的 `scripts/worktree-audit.mjs`，写明 `--pretty`、`--size`、`-b`、`[repo-path]` 的默认值与退出码；明确脚本只读、无 `--execute`、无删除模式；脏 worktree 一律保留，干净的已合并 worktree 也必须在操作者显式授权并点名路径后才删除。
- `adapters/pi/overrides/skills/poteto-mode/playbooks/babysit.md.template`：状态读取改为调用随包发布的 `scripts/watch-pr.mjs`，写明 `--status-only`、`--green`、`--repo`、`--pr`、`--timeout`、`--interval` 和退出码；明确只读、无 `--execute`；评论、push、合并各自需要当前会话的显式授权。
- `scripts/playbook-script-invocation.test.mjs`：离线行为测试，以及 `--live` 入口的真实 Pi 会话抽测。
- 本文件。

未修改 `upstream/`、生成物 `skills/`、`agents/`、`package.json` 或锁文件；未安装全局包、未修改用户配置、未 push/PR/merge/rebase/publish。

## 基线

初始 `npm test` 因本 worktree 缺少 `jiti` 退出码 1（`ERR_MODULE_NOT_FOUND`）。执行 `npm install --include=dev --cache /tmp/pstack-032-cache-15` 退出码 0，安装 118 个包，0 vulnerabilities，锁文件无变化。随后基线 `npm test` 退出码 0。

## 修复前失败证据

把 HEAD 的模板导出到临时目录 `/tmp/pstack-032-baseline-15`，只放入新测试后运行：

```text
node --test scripts/playbook-script-invocation.test.mjs
```

退出码 1，3 tests / 0 pass / 3 fail。失败点分别是：旧模板没有可执行的 worktree 审计命令、没有 `--status-only` 命令、`worktree-cleanup` 仍写着 `scripts/worktree-audit.sh` 和“无 Pi 对应实现”。这是修复前失败、修复后通过的红绿证据。

## 离线行为测试

```text
node --test scripts/playbook-script-invocation.test.mjs
```

退出码 0，3 pass / 0 fail。测试不是只做字面断言：

1. 从 `worktree-cleanup` 模板的 fenced block 提取命令，替换包根与仓库占位符后真实执行。临时仓库含 main、一个已合并 worktree、一个脏 worktree；断言命令退出 0，merged→`safe-to-remove`，dirty→`hold-wip`，执行前后 `git status`、`git worktree list --porcelain` 和脏文件内容完全一致。额外执行 `--execute`，断言退出 2 且错误码 `usage`，证明脚本没有隐藏的删除模式。
2. 从 `babysit` 模板提取 `--status-only` 和 `--green` 命令，通过 PATH 中的 `gh` shim 真实执行。status-only 只调用一次 `gh`，输出 `READY`、退出 0；失败 checks 的 green 输出 `CHECKS_FAILED`、退出 1；仓库目录在前后没有新增文件。
3. 补充检查模板确实使用 `<package-root>/scripts/...`、不再出现 `node scripts/watch-pr.mjs` 或 `worktree-audit.sh`，并写明只读、无 `--execute`、显式授权门槛。

既有脚本回归：

```text
node --test scripts/worktree-audit.test.mjs scripts/watch-pr.test.mjs
```

退出码 0，16 pass / 0 fail。

## 真实 Pi 会话抽测（模型是否发出 CLI 命令）

命令：

```text
node scripts/playbook-script-invocation.test.mjs --live --out /tmp/pstack-032-live-15.json
```

退出码 0。模型来自实际可用列表：`magpie/opendesign/deepseek-v4.1-flash`。`--live` 在临时副本中重新运行生成器，再用 `DefaultResourceLoader` 加载生成后的 skills；`--live` 的 bash 是 capture-only 的 `customTools` 定义，同名覆盖 builtin `bash`，只记录命令、不执行。报告显示 `captureToolExecutions: 2`、`captureOnlyVerified: true`、`forbiddenCommands: []`。

模型实际读取了两份生成后的 playbook，并发出：

```text
node "<generated-package>/scripts/worktree-audit.mjs" --pretty --size -b main "<temp>/audit/audit-target"
node "<generated-package>/scripts/watch-pr.mjs" --repo "/tmp/pstack-032-watch-pr-check" --pr 2 --status-only --pretty
```

`playbooksRead.cleanup` 与 `playbooksRead.babysit` 均为 true，`worktreeTargeted` 与 `watchTargeted` 均为 true。截取的回复也明确区分了“recorded, not executed”。

边界：这次抽测证明模型能从生成后的 playbook 选择并拼出正确 CLI 命令，**不证明模型实际执行了脚本**；capture-only 的 bash 没有运行任何命令，也不是完整工作流验收。

## 真实 CLI 验证（与上面的 live 抽测分开）

两个脚本另用真实命令单独验证，不是模型执行结果。

1. 当前仓库的 worktree 只读审计：

```text
node scripts/worktree-audit.mjs --pretty --size -b main .
```

退出码 0。`base.ref=main`，`summary.total=10`、`dirty=2`、`merged=4`、`unmerged=3`、`missing=0`；报告把已合并项标为 `safe-to-remove`、脏项标为 `hold-wip`。只读审计未删除、prune 或改动任何 worktree。

2. 本机克隆的已合并 PR：`/tmp/pstack-032-watch-pr-check` 的 `jiangkoumo/agenttape#2`。

```text
node scripts/watch-pr.mjs --repo /tmp/pstack-032-watch-pr-check --pr 2 --status-only --pretty
node scripts/watch-pr.mjs --repo /tmp/pstack-032-watch-pr-check --pr 2 --green
```

两条命令退出码均为 0。status-only 报告 `verdict=MERGED`、`green=true`、`polls=1`、4/4 checks passed；green 报告 `mode=green`、`polls=1`。没有创建或修改外部 PR，只读取已有合并 PR。

## 生成与全量回归

在临时副本 `/tmp/pstack-032-generate-15` 中执行（未改动 worktree 的生成物）：

```text
npm run generate
npm run check:generate
npm test
```

- `npm run generate`：退出码 0，`generated:117`、`written:2`。
- `npm run check:generate`：退出码 0，`checked:117`、`unmanaged:0`。
- `npm test`：退出码 0，20 个测试文件合计 162 pass / 0 fail；自然退出，无挂起。
- worktree 内 `git diff --check`：退出码 0。

worktree 中生成的 `skills/poteto-mode/playbooks/*.md` 尚未更新，这是预期的：生成物不在本任务允许范围，主控合并模板后统一运行生成器。当前直接在本 worktree 跑 `npm test` 会因生成漂移失败，不能把临时副本的结果当成 worktree 已生成。

## 未完成与边界

- 生成物接线、`package.json` 中新增测试接线、跨模板引用（例如 `shipping.md` 仍写相对 `node scripts/watch-pr.mjs`）不在本任务允许范围，留给主控统一处理。
- live 抽测只覆盖一次模型运行、两个只读命令；没有执行真实任务全流程，也不宣称模型完成了完整 cleanup 或 babysit。
- 未创建外部 PR，未合并、推送、发布或修改用户全局配置。
