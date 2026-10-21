# 指定上游保真度脚本与 CI 门禁验证

## 来源与口径

`tools/upstream-fidelity.py` 原样导入操作者提供的脚本，对照固定上游 `f713f14203cd6420cec13cd7c55c32d598dbab68`。不改评分、分句、Cursor 匹配规则或阈值默认值。完整生成报告在 [fidelity.md](fidelity.md)。

该脚本剔除代码块和 frontmatter，逐句寻找最佳匹配；匹配率 ≥0.85 为 kept，≥0.55 为 reworded；未保留但命中 Cursor 正则的句子计为 substitution，并从分母扣除。整体按句数加权，不能与此前词级估算或逐行 LCS 混用。Markdown 百分比四舍五入到整数，门禁使用精确计数。

## 门禁

运行 `npm run check:fidelity`，其包装脚本调用原 Python 程序：

```text
python3 tools/upstream-fidelity.py <package-root> --out <package-root>/docs/fidelity.md --json <temporary-report.json> --min-overall 0.85 --flag-kept 0.70 --allow <package-root>/docs/fidelity-allow.txt
```

- 整体 kept 比例必须 ≥85%。所有被分析的上游 Markdown 均保留在整体分母，包括缺失的 substitute 文件。
- 每个 `ported` 条目及 prepared Markdown 文件必须 ≥70%，缺失文件失败。
- `check-package` 另行保证每个 ported 条目存在且有 validation 证据。若已移植 Markdown 缺少评分结果，包装器同样拒绝，防止漏扫描被当作通过。
- 原脚本还以 `lost > 3` 标记文件。`fidelity-allow.txt` 记录下面的明确例外；包装器独立检查前两项，allowlist 无法绕过整体或单个已移植文件的最低比例。
- check 与 publish workflow 均执行相同门禁。Python 程序失败、JSON 读取失败或阈值未达到都以非零退出。

## lost > 3 例外及限制

| 文件 | 依据与限制 |
|---|---|
| make-bot-ui | port-map 已决议为 substitute；上游需要 `updatestate` webhook routine、secret-request 和 routine wake。未声称移植，仍计入整体分母。 |
| setup-pstack | port-map 已决议为 extension-command；模型目录/JSON 配置替代 `.mdc`。没有同名生成技能，不将命令冒充技能。 |
| poteto-help | 安装入口替换为 Pi；未随包带 Cursor guide pages 2/6/9。已修正 recall、automate-me、eval、authoring 的过时替代入口。 |
| orchestrate | 云执行、本地 transcript 路径、旧 orch 锁服务替换；当前 orch 没有旧锁服务和 frontier/inbox/ledger 子命令，正文 Pi adaptation 明确记录能力差距。此豁免不代表编排功能全部完成。 |
| show-me-your-work | `log.sh` 和 shell printf 改为 Pi 文件工具/已有决策日志路径；会话路径、thinking 与独立审阅授权有适配。 |
| swarm | Cursor Task 的 generalPurpose/environment/cloud_base_branch 字段改为本地 subagent/worktree 契约；分句后字段碎片未被 Cursor 正则全部识别。 |
| why | `.mdc`、model fallback、Task 字段改为精确角色绑定与可用工具检查；不会假定所有宿主均有 git/gh 或 MCP。当前实际可用工具决定覆盖范围。 |

TypeScript `references/patterns.md` 是真实漏打包项，本次补齐原文并纳入 generator，没有加入例外。

## 本次实际验证

- 原始脚本首次执行（尚未补漏/配置例外）：退出码 1；整体 4147/4502 = 92.11%；8 个 flagged 文件。不能将整体达标当作该命令通过。
- `npm run check:fidelity`：退出码 0；`files:111, kept:4222, upstream:4502, overall:0.9378054198134163, errors:[]`。
- `node --test scripts/upstream-fidelity.test.mjs`：退出码 0；3 pass、0 fail。覆盖整体边界、单文件 <70% 即使整体很高也失败，以及 missing ported 失败。
- `npm install --include=dev --no-package-lock`：退出码 0；审计119个包，0 vulnerabilities。
- `npm test`：退出码 0；162 pass、0 fail。
- `npm run check:generate`：退出码 0；117 checked、0 unmanaged。
- `git diff --check`：退出码 0。

四项新移植按指定脚本的结果：recall 50/53 = 94.34%；automate-me 83/90 = 92.22%；eval 35/36 = 97.22%；authoring-a-skill 11/11 = 100%。

仍低于85%的已存在文件：how 16/22 = 72.73%；principle-sequence-verifiable-units 11/15 = 73.33%；swarm 24/32 = 75%；runtime-forensics 13/17 = 76.47%；reflect 37/47 = 78.72%；interrogate 39/47 = 82.98%；show-me-your-work 55/65 = 84.62%。完整 dropped 原句见生成报告。它们通过70%最低门禁，但未达到原任务中部分目标文件85%的更高目标，不能据此宣称全部完成。

没有推送或发布；远端 CI 尚未针对本地提交运行。此检查是文本保真度检查，不是模型行为或编排功能验收。
