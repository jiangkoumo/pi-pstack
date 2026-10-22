# A3 路由验收：ketchup 当前会话与 recall 过去会话（Issue #20）

日期：2026-10-22。分支：`fix/20-ketchup-recall`。工作树：`/Users/jiangkoumo/.herdr/worktrees/pi-pstack/fix-20-ketchup-recall`。模型：`magpie/opendesign/deepseek-v4.1-flash`。

## 结论与边界

- 修复目标：把“当前这轮对话/当前会话的 catch-up”路由到 `ketchup`，把过去会话、过去几天、另一 session id 的路由留给 `recall`；`recall` 的工作区范围与当前会话排除保持不变。
- 修复前真实复现：`catch me up on this conversation` 与 `总结一下这次对话` 两条 live 用例均为 fail（读的是 `recall`，中文用例还列了 sessions 根）。修复后定向 6/6；第二次全量单次 48/48（原 46/46 + 新增 2/2）。第一次全量 47/48，唯一失败是原 `sk-recall-prior` 的 `ls` 路径分类，单项重放 1/1 通过；两次记录都保留，不把重放混进单次全量。
- `ketchup` 只新增模板：正文与固定上游逐字一致，仅改 description；`recall` 只改 description 与 step 1 的路由句；`poteto-mode` 的路由表新增 ketchup 行并把原 recall 行收窄到过去会话。
- 用例清单保留原 46 条不变，另加 2 条 ketchup 补充用例，共 48 条。没有改任何原 request/expect 来凑通过。
- 边界：live 只验证 mode-on 的**路由选择层**（是否读到目标 skill，recall 还要求读到当前 cwd 会话且不越界），不验证完整 ketchup 回复质量或写作规范。
- `docs/port-map.json` 未改。repo 的 `check:generate` 在接线前会因未归属模板失败；live 证据来自临时拷贝中完成同一接线的包，差别见“与 repo 的差别”。

## 基线（修复前）

- 环境：Node `v22.22.2`，npm `10.9.7`；`NODE_ENV=development npm ci --include=dev` 后 `npm test` exit 0。
- `node --test scripts/routing.test.mjs`：7/7 pass，exit 0。
- `npm run check:generate`：`{"status":"passed","checked":117,"unmanaged":0}`，exit 0。
- fidelity：`node scripts/check-upstream-fidelity.mjs` 为 `4229/4501 = 93.9569%`，`errors: []`（85% 总阈值、70% 单文件阈值通过）。严格 `0.94` 尚差 2 句，这是主控已确认的既有基线，不是本次引入。

## 修复前复现

新增测试先跑：

```bash
node --test scripts/routing.test.mjs
# 3 个新测试失败，8 个既有测试通过，exit 1
# - ketchup template ...：ENOENT adapters/pi/overrides/skills/ketchup/SKILL.md.template
# - recall description ...：描述中没有 ketchup
# - poteto-mode routes ...：模板没有 ../ketchup/SKILL.md
```

真实 live（修复前，repo 内生成物正常）：

```bash
node scripts/routing.test.mjs --live --cases sk-ketchup-current,sk-ketchup-zh \
  --out /tmp/pstack-020-prefix-ketchup.json
# exit 1，0/2
```

- `sk-ketchup-current`：第一次成功读取是 `skills/recall/SKILL.md`，随后回复把当前会话当成“没有历史”，`hit=false`。
- `sk-ketchup-zh`：读 `poteto-mode` 后读 `recall`，并用 `ls` 列 `<agent>/sessions` 根，被记为 `foreignSessionAttempt=true`，`hit=false`。

这与用户报告一致：当前会话的 catch-up 落到了 recall。修复前的结论此前标为“待验证”，本次在两条具体请求上完成复现。

## 改动

- `adapters/pi/overrides/skills/ketchup/SKILL.md.template`（新）：正文逐字保持固定上游 `upstream/pstack/skills/ketchup/SKILL.md` 的正文；description 增加当前会话正例（`catch me up on this conversation`、`summarize this chat`、`what changed since my last message`、`总结一下这次对话`、`这次对话`、`刚才这轮`）和过去会话反例（past sessions、earlier days、another session id、work from before this chat → recall）。
- `adapters/pi/overrides/skills/recall/SKILL.md.template`：description 去掉裸 `catch me up` 正例，明确“过去会话/过去几天/另一 session id”才用 recall，当前会话 recap 是 ketchup；step 1 增加同一分流说明。工作区范围、当前会话排除、排序与只读规则未改。
- `adapters/pi/overrides/skills/poteto-mode/SKILL.md.template`：新增 ketchup 路由行；原 recall 行保留原有工作区/当前会话语义并收窄到过去会话；Triggered skills、移植说明与恢复清单加入 ketchup。
- `scripts/routing-cases.json`：原 46 条全部保留；新增 `sk-ketchup-current`、`sk-ketchup-zh` 两条，共 48 条；`source.note` 说明“原 46 + 新增 2”，不冒充原始 46 项报告。
- `scripts/routing.test.mjs`：新增 4 个离线测试（清单 48 与原例保留、ketchup 正文与上游逐字一致、recall description 分流、poteto-mode 双向路由）；清单总数断言从 46 改为 48。

## 验证（修复后）

### 离线

| 命令 | exit | 结果 |
| --- | ---: | --- |
| `node --test scripts/routing.test.mjs` | 0 | 11 tests / 11 pass / 0 fail |
| `node scripts/check-skill-references.mjs` | 0 | 90 个模板文件、228 条本地链接、41 个 `/skill:` 引用、0 错误 |
| `git diff --check` | 0 | 无空白错误 |

### 接线后的生成与真实 mode-on

临时拷贝 `/tmp/pstack-020-live-copy.4X44pb/repo` 中把 ketchup 条目从 `inherit-body` 改为 `override`（只改拷贝，见下节）：

- `node scripts/generate-pi-resources.mjs`：`{"status":"passed","generated":117,"written":3}`，exit 0；写到 `skills/ketchup/SKILL.md`、`skills/poteto-mode/SKILL.md`、`skills/recall/SKILL.md`。
- `node scripts/generate-pi-resources.mjs --check`：`{"status":"passed","checked":117,"unmanaged":0}`，exit 0。
- `node --test scripts/routing.test.mjs`：11/11 pass，exit 0。
- `node scripts/check-upstream-fidelity.mjs`：`files:111, overall:0.9395689846700733, kept:4229, upstream:4501, errors:[]`，exit 0；与基线逐字相同，无回归。

定向 live（2 条 ketchup + 4 条 recall）：

```bash
node scripts/routing.test.mjs --live \
  --cases sk-ketchup-current,sk-ketchup-zh,sk-recall-what,sk-recall-last,sk-recall-week,sk-recall-prior \
  --out /tmp/pstack-020-live-subset.json
# exit 0，6/6
```

- 2 条 ketchup：第一次读到的目标文件都是 `skills/ketchup/SKILL.md`，无 session 访问。
- 4 条 recall：都读到 `skills/recall/SKILL.md`，随后读到当前 cwd 的 `--<slug>--` 会话文件；`skillBeforeSession=true`，`foreignSessionAttempt=false`。

全量 live：

```bash
node scripts/routing.test.mjs --live --out /tmp/pstack-020-live-all-48.json
# 第 1 次：exit 1，47/48
# 唯一失败：sk-recall-prior（原 46 中的用例）
```

`sk-recall-prior` 第 1 次失败详情：已读到 `recall`，随后对**当前 workspace 的精确 sessions 目录**执行 `ls`，该路径被判定为 `foreign-workspace`，因此中止且未读到会话；`skillHit=true`、`sessionHit=false`。没有跨 workspace 读取会话文件。

单项重放：

```bash
node scripts/routing.test.mjs --live --cases sk-recall-prior \
  --out /tmp/pstack-020-live-prior-replay.json
# exit 0，1/1
```

重放中 `skillBeforeSession=true`、`sessionHit=true`、`sessionViolations=[]`，读到当前 cwd 的 `2026-10-20T09-00-00-000Z_11111111-1111-1111-1111-111111111111.jsonl`。因此原 46 条在第 1 次全量口径下是 45/46，加这次定向重放后 46/46 有真实通过记录；新增 2 条在第 1 次全量中 2/2。不把“45/46 + 重放”写成“单次 46/46”。

第二次全量（同一入口、同一接线拷贝）：

```bash
node scripts/routing.test.mjs --live --out /tmp/pstack-020-live-all-48-r2.json
# exit 0，48/48
```

第 2 次 `status: passed`，48 条全部通过：原 46 条 46/46，新增 ketchup 2 条 2/2。`sk-recall-prior` 这次 `skillBeforeSession=true`、`sessionHit=true`、无 violations。最终结论以这次单次全量为准，同时保留第 1 次的失败记录。

## 与 repo 的差别及主控接线

repo 的 `docs/port-map.json` 按 Issue 要求未改。临时拷贝只改了 ketchup 条目：

```json
"adaptation": {
  "strategy": "override",
  "override": "adapters/pi/overrides/skills/ketchup/SKILL.md.template"
},
"dependencies": "from-template"
```

（`reason` 同步改为“正文保持上游，仅改 description 区分当前会话与 recall”，`evidence` 指向本文件。）

接线前，repo 内：

```bash
npm run check:generate
# exit 1
# AssertionError: Unmanaged override template: adapters/pi/overrides/skills/ketchup/SKILL.md.template
```

因为生成器要求 `adapters/pi/overrides/` 下每个模板都已在 `docs/port-map.json` 归属。接线后应能生成并提交 3 个生成物（ketchup、poteto-mode、recall）。在接线完成前，`npm test` 会在 `check:generate` 处失败；`node --test scripts/routing.test.mjs`、`node scripts/check-skill-references.mjs` 与 fidelity 检查不依赖该接线，仍可通过。

生成的 `skills/*/SKILL.md` 本次没有提交，避免手工改生成文件绕过映射。live harness 会在临时副本删除 `skills/`、`agents/` 后重新生成，因此 live 选择不受 repo 旧生成物影响。

## 未完成与阻碍

1. `docs/port-map.json` 的 ketchup override 接线与 3 个生成物更新由主控在合并时完成；完成前 repo 的 `npm run check:generate` 和 `npm test` 不绿。这是 Issue 明确允许报告的范围阻碍，没有擅自改共享映射或生成文件。
2. fidelity 严格 `0.94` 仍差 2 句（4229/4501），与基线完全相同；没有为了凑数恢复与本任务无关的 Cursor 专有句。
3. 第 1 次全量 47/48 的 `sk-recall-prior` 抖动已保留记录；第二次全量 48/48。同一请求在定向重放与第二次全量都通过，该抖动不是本次模板改动引入，但说明 live 路由对模型构造路径的稳定性有限。没有为此放宽跨 workspace 判定。
4. live 只覆盖路由选择层；ketchup 回复是否遵守 150 词、read-only、visual 规则没有在本任务做真实运行验收。

## 证据文件

- `/tmp/pstack-020-prefix-ketchup.json`（修复前 2 条，0/2）
- `/tmp/pstack-020-live-subset.json`（修复后定向 6/6）
- `/tmp/pstack-020-live-all-48.json`（第 1 次全量，47/48）
- `/tmp/pstack-020-live-prior-replay.json`（`sk-recall-prior` 单项重放 1/1）
- `/tmp/pstack-020-live-all-48-r2.json`（第 2 次全量，48/48，exit 0）
- `/tmp/pstack-020-live-all-48.err`、`/tmp/pstack-020-live-all-48-r2.err`（逐 case 进度摘要）
