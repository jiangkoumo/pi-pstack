# 0.3.2 保真度恢复验证：swarm / show-me-your-work / why

## 来源与口径

对照固定上游 `f713f14203cd6420cec13cd7c55c32d598dbab68`，使用操作者提供的 `tools/upstream-fidelity.py`，未修改评分、分句、Cursor 匹配或阈值。完整报告由主控生成到 [fidelity.md](fidelity.md)。

单个文件的有效分母为上游句数减去脚本识别出的 Cursor 替换句（`upstream - subst`）；kept 只统计匹配率 ≥0.85 的句子。以下三个数字只取各自主 `SKILL.md`，不把 `why` 的 `references/` 文件或其它合并统计混进来。

| 主文件 | upstream | Cursor subst | 有效分母 | kept | reworded | lost | kept 比例 | 目标 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `skills/swarm/SKILL.md` | 35 | 3 | 32 | 27 | 2 | 3 | 84.38% | **未达 90%** |
| `skills/show-me-your-work/SKILL.md` | 66 | 1 | 65 | 63 | 1 | 1 | 96.92% | 达成 |
| `skills/why/SKILL.md` | 104 | 8 | 96 | 90 | 5 | 1 | 93.75% | 达成 |

本次修改前的基线（同样只取主 `SKILL.md`）：

| 主文件 | 基线 kept/有效分母 | 基线比例 | 本次后 |
|---|---:|---:|---:|
| swarm | 24/32 | 75.00% | 27/32 = 84.38% |
| show-me-your-work | 55/65 | 84.62% | 63/65 = 96.92% |
| why | 85/96 | 88.54% | 90/96 = 93.75% |

三个文件里 show-me-your-work 与 why 的 lost 各为 1，swarm 为 3；都不触发脚本的 `lost > 3` 规则。`docs/fidelity-allow.txt` 中对应的三个 allow 项已移除；其余四项（make-bot-ui、setup-pstack、poteto-help、orchestrate）未动。

## 改动内容

### why

- 恢复角色/模型绑定段、Discovery、Source control 与 investigator roster 的上游表述，并把逐角色绑定、只读调查员和按任务命名 `review` 角色写回正文。
- 修正模型契约：角色只接受精确 `provider/id` 或 `inherit`；未配置角色保留 pi-subagents 默认并在结果中说明。已配置模型被宿主拒绝时停止该 seat 并报告，明确禁止改回默认值、同家族模型或任何替代回退；不假设 `/setup-pstack` 存在 default line。
- 授权、只读工具边界和“不可用连接器按缺口报告”集中在 Pi adaptation，正文不再假定 Cursor Task/MCP 环境。

### swarm

- 修正角色绑定：writer 用 `code`（`pstack.poteto-agent`），只读 verifier 用 `verification`（`pstack.verifier`），不再让所有 worker 继承 verification 角色。
- `worktree: true` 明确放在 outer `subagent` 调用，示例补上该字段，并同时展示 writer 与 read-only verifier 两个任务项；branch 场景改为在 brief 里传 branch 与 SHA。
- 模型规则与 why 一致：正文只绑定 step 4 role，明确 never pass `model`；精确绑定或 `inherit`，拒绝后停止并报告，不做默认值/同家族替换。移除了先前用 Cursor 字段做映射的句子，不恢复不可执行的 Cursor 字段。

### show-me-your-work

- 恢复模板复制、日志写入契约（stamp、header、去 tab/newline、公式前缀）、提交条件、transcript 审阅和跨模型审阅的上游句式。
- `scripts/log.sh` 未随包发布：正文用 Pi `write`/`edit` 复现其行为，helper 与其字节处理在 Pi adaptation 中说明；提交、委派和跨模型审阅的授权条件集中写在 Pi adaptation，正文不再自行放宽权限。
- transcript 路径改为“宿主提供时读取 `agent-transcripts/`，否则只读当前 Pi session 或操作者提供的 transcript”，并保留不扫描无关项目的规则。

## swarm 仍未达到 90% 的原因

swarm 剩余 2 条 reworded 和 3 条 lost 都是 Cursor 专有字段或被明确禁止恢复的回退契约：

- 0.60：`If it rejects the default, use the closest valid slug of the same family from its error message.` 按当前 Pi 契约必须停止该 seat，不能恢复为回退指令。
- 0.70：`"local" only when the worker needs access to something on the user's computer.` Pi 子代理都运行在本机；`worktree` 只控制 checkout 隔离，不能把它写成 local/cloud 能力差异。
- lost：`generalPurpose, environment:` 是 Cursor Task 字段碎片，Pi 没有对应可执行字段。
- lost：`"cloud", runinbackground:` 同上，是 Cursor 专有字段碎片。
- lost：`true, and the step 4 model, left unset for auto or inherit-parent.` 是 Cursor 的 step 4 model 字段；当前 Pi 正文只绑定 step 4 role，并明确 never pass `model`，不能恢复成传递或保留 model 的指令。

本轮在保留上述 Pi 语义（精确角色/模型、fail-closed、不做自动 model 回退）的前提下，swarm 停留在 84.38%，未达到 90% 目标；已到审阅与修订轮次上限，保留该缺口并如实记录，不再通过改写词序、恢复不可执行的 Cursor 字段或恢复自动 model 回退来提高分数。

## 本次实际验证

在 `/tmp/pstack-032-verify-16` 临时副本中修改并生成（worktree 内未改动生成物）：

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `node scripts/generate-pi-resources.mjs` | 0 | 117 个资源生成 |
| `python3 tools/upstream-fidelity.py . --only skills/swarm ...` | 0 | 27/32 = 84.38%，未 flagged |
| `python3 tools/upstream-fidelity.py . --only skills/show-me-your-work ...` | 0 | 63/65 = 96.92%，未 flagged |
| `python3 tools/upstream-fidelity.py . --only skills/why ...` | 0 | 90/96 = 93.75%，未 flagged |
| `node scripts/check-upstream-fidelity.mjs` | 0 | `files:111, kept:4238, upstream:4502, overall:94.14%, errors:[]` |
| `node scripts/generate-pi-resources.mjs --check` | 0 | 117 checked，0 unmanaged |
| `node --test scripts/upstream-fidelity.test.mjs` | 0 | 3 pass，0 fail |
| `git diff --check` | 0 | 无输出 |

`--only` 的三次检查未传 `--allow`，因此结果不是 allowlist 放行后的数字。

## 限制与待办

- 这是文本保真度检查，不是模型行为、子代理启动或权限执行的验收。
- 生成物（`skills/`、`agents/`）和 [fidelity.md](fidelity.md) 由主控在合并后统一生成；本 worktree 未改这些文件，也未跑 `npm test` 全量套件。
- 范围外发现：`adapters/pi/overrides/skills/reflect/SKILL.md.template`、`how/SKILL.md.template`、`arena/SKILL.md.template` 仍含“use the default / closest valid configured model”式回退措辞。它们不在本 issue 允许修改的文件内，未改动，需主控另立任务处理。
- 未 push、未 merge、未 publish，也未修改用户全局配置。
