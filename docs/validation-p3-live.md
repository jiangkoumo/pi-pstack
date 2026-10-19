# P3 live 双模型只读审阅验收

状态：**本轮机械门槛通过（脚本 exit 0）。** 两个不同真实模型各完成一次只读审阅，两轮请求全部经过本地录制代理并被记录，wire 上的 `model`、`reasoning_effort`、声明工具与本地网关的 200 响应都有证据。意见内容的逐条核实仍归主代理；本文件不把“脚本通过”当成 P3 整体通过。

对应计划项：[移植计划](migration-plan.md) 的“使用实际可用模型完成一次不同模型的审阅；主代理核实意见并给出证据”。本轮实现的是该验收的一个可重放子集。

上一次运行（同一脚本、修复前）失败于“Round B 未经过录制代理”，其证据保留在 `scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model-attempt1/`，仅作历史对照，不再被任何断言引用。

## 0. 本轮修复：为什么 Round B 会绕过录制代理

根因（在 `~/.pi/agent/models.json` 与本机网关目录中实际核对，不是推测）：

1. `magpie` provider 是 `openai-completions`，`baseUrl` 指向本机网关 `http://127.0.0.1:3425/v1`；脚本把临时 `models.json` 里 provider 的 `baseUrl` 改写成录制代理地址。
2. 但 `opendesign/glm-5.3-flash` 这个**模型条目自身**带有 `baseUrl: "http://127.0.0.1:3425"` 和 `api: "anthropic-messages"`。Pi 的 `ModelRuntime` 让模型级 `baseUrl` 优先于 provider 级，于是该轮 child 直连本机网关，完全跳过录制代理 → `requests: 0`。
3. 同一模型走的是 Anthropic messages 线格式（`/v1/messages`），而录制代理只解析/转发 OpenAI chat-completions 请求体，两者不可能同时成立。
4. 网关目录中存在同族、无模型级覆盖的 `opendesign/glm-5.3-flashx`（provider 级 `openai-completions`）。

据此做了三处改动（均在 `scripts/check-p3-live-review.mjs` 与 `scripts/fixtures/p3-live-review/scope.json`）：

| 改动 | 作用 |
| --- | --- |
| 临时 `models.json` 中每个模型条目改为 `structuredClone` 后删除所有 endpoint 形态字段（`baseUrl`/`url`/`endpoint`/`host`/`origin` 等），删除清单写进 `summary.json.providerIsolation.neutralizedModelEntryFields` | 任何模型都不可能解析出绕过录制代理的地址；即使以后 catalog 再给某个模型加 `baseUrl`，也只会被剥掉 |
| 建表后加不变式断言：遍历 provider 下的每个模型条目，出现 endpoint 形态的键、或值形如 `http(s)://…` 就 `deepEqual([], [])` 失败 | 从“改对了”升级为“错了就跑不起来” |
| 选择模型时改用**生效** api `entry.api ?? provider.api`，非 `openai-completions` 直接 `status: blocked` 退出 | 线格式不匹配会被明确报告，而不是被静默改写成另一种格式 |
| `scope.json` 的 Round B 换成 `magpie/opendesign/glm-5.3-flashx`（同属 GLM-5.3 家族，原生 openai-completions，无模型级 `baseUrl`） | 两轮仍是两个不同底层模型，且都在代理可解析的线格式上 |

录制代理**没有**增加 Anthropic messages 解析：脚本选择“换同族 openai-completions 模型”这条路线，并对 Anthropic 模型显式阻断（第 4 节有实测）。

## 1. 真实项目、合成 fixture 与本地 fixture 的分解

必须分开看的三层，混在一起就会把 fixture 结果当成生产验收：

| 层 | 内容 | 是否真实 |
| --- | --- | --- |
| 被审阅内容 A | 本仓库工作树的 `extensions/pstack/runtime.mjs`、`scripts/check-p3-readonly-gate.mjs` | 真实项目文件，审阅前后 sha256 未变 |
| 被审阅内容 B | `scripts/fixtures/p3-live-review/controls/comment-slop-sample.ts`，文件开头即声明 SYNTHETIC FIXTURE | 合成对照，只用来证明 reviewer 真的读到了给定文件 |
| 父会话 | 本地确定性 SSE fixture，只产生 `subagent` 工具调用 | 合成，无外部推理、无费用 |
| child reviewer | 本机 `magpie` 网关后的真实模型（`opendesign/deepseek-v4.1-flash`、`opendesign/glm-5.3-flashx`） | 真实外部推理，有 wire 记录、model echo 与 usage/cost |
| 录制代理 | 本地 HTTP passthrough，记录 wire 上的 `model`、`reasoning_effort`、声明工具，响应字节原样转发 | 合成观测层，不改变语义 |
| 临时 agent 配置 | 从 `~/.pi/agent/models.json` 只拷贝必要 provider 配置到临时目录（mode 0600），模型条目剥掉 endpoint 字段，`pstack.json` 只写 review 角色 | 临时隔离，未改全局配置 |

`magpie` 是本机网关，因此脚本能证明的是“请求里发出的 provider/model id、thinking 档位、声明工具，以及网关返回了 200 与真实用量”，**不能证明网关内部如何路由到厂商**。

## 2. 执行与实际结果

```bash
# 1) 只读预检：目录、模型 id、brief 渲染，不发推理
node scripts/check-p3-live-review.mjs --dry-run
# 退出码 0，status: dry-run；两轮 effectiveApi 均为 openai-completions

# 2) 确定性自检：同一条装配链路，上游为本地 stub，不发外部推理
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  node scripts/check-p3-live-review.mjs --self-test --out /tmp/p3-live-test
# 退出码 0，status: self-test-passed

# 3) 实跑：两个真实模型各一次审阅
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  node scripts/check-p3-live-review.mjs --out scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model
# 退出码 0，status: passed，failures: []
```

第 3 步实测：两个 review 会话（每模型 1 个），无重试、无回退、无替代模型。脚本 sha256 前缀 `8b0b0f33c4534b07`。

## 3. 两轮证据

| 证据 | Round A | Round B |
| --- | --- | --- |
| 配置的 review 角色 | `magpie/opendesign/deepseek-v4.1-flash` + `high` | `magpie/opendesign/glm-5.3-flashx` + `high` |
| 生效 api / 被剥掉的模型条目字段 | `openai-completions` / 无 | `openai-completions` / 无 |
| wireCapture | `recorded` | `recorded` |
| 录制代理请求数 | 4（turn 1–4） | 3（turn 1–3） |
| 每请求 `model` | `opendesign/deepseek-v4.1-flash` | `opendesign/glm-5.3-flashx` |
| 每请求 `reasoning_effort` | `high` | `high` |
| 每请求声明工具 | `read/grep/find/ls` | `read/grep/find/ls` |
| 上游状态 | 每请求 200 | 每请求 200 |
| child 会话日志 `model_change` / thinking | 同上 / `high` | 同上 / `high` |
| pi-subagents observed model | `magpie/opendesign/deepseek-v4.1-flash` | `magpie/opendesign/glm-5.3-flashx` |
| child `exitCode` / `error` | 0 / null | 0 / null |
| 工具调用来源（代理 / 会话日志） | 15 / 7 | 9 / 6 |
| usage（input/output/cacheRead, turns） | 6099 / 4098 / 19456，4 turns | 6544 / 3643 / 9024，3 turns |
| cost（网关回报） | 0 | 0.00765183 |
| 墙钟 | 25.3 s | 36.3 s |
| 结构化 findings 数（真实 / 对照） | 20（9 / 11） | 6（1 / 5） |
| 对照锚点命中 | 5 / 5 | 5 / 5 |

两轮读到的文件都在授权范围内：A 读了 3 份文件并 grep 了 2 份真实文件；B 同样覆盖 3 份文件、3 次 grep。会话内没有任何 `edit`/`write`/`bash`/`codemode` 调用。

## 4. provider 隔离：机制与两道护栏的实测

隔离靠两件事同时成立：临时 `models.json` 的 provider `baseUrl` 指向录制代理，且没有任何模型条目能覆盖它。脚本已把第二件事变成硬约束（第 0 节表格第 1–3 行）。护栏都实际跑过：

```bash
# 护栏 1：构造一个“模型条目自带 baseUrl”的 catalog（模拟本次根因，不含任何凭证）
# 期望：脚本剥掉该字段，dry-run 仍 exit 0，并在计划里记录剥离了什么
PI_PSTACK_LIVE_MODELS=/tmp/p3-probe-catalog.json node scripts/check-p3-live-review.mjs --dry-run
# 退出码 0，status: dry-run，Round A 的 neutralizedModelEntryFields: ["baseUrl"]

# 护栏 2：把 Round B 临时指回 anthropic-messages 模型
# 期望：明确 blocked，而不是静默改写线格式
node scripts/check-p3-live-review.mjs --dry-run
# 退出码 1，status: blocked，
# reason: recording pass-through only supports the openai-completions wire format…
# modelApi: anthropic-messages, modelBaseUrlOverride: http://127.0.0.1:3425
```

（护栏 2 是一次临时探针，测试后 `scope.json` 已恢复为 `glm-5.3-flashx`；探针用的 catalog 副本在 `/tmp`，不含 apiKey。）

本轮 `summary.json` 的机械结论：两轮 `wireCapture` 均为 `recorded`，`requests` 分别为 4 与 3（> 0），`declaredTools` 均为 `["find","grep","ls","read"]`，`readOnly.forbiddenToolAttempts: 0`，`readOnly.repositoryUnchanged: true`，`failures: []`，脚本退出码 0。如果任一 round 再出现“0 请求”，脚本会以 `the child never traversed the recording proxy…` 失败，不会给出“通过”。

## 5. 只读与范围证据

- child 侧只有 `read`、`grep`、`find`、`ls`：两轮每个 wire 请求的声明工具都恰好是这 4 个。
- 两个 child 会话日志中不存在 `edit` / `write` / `bash` / `codemode` 调用。
- 全部工具路径落在授权文件内，没有 `.pi/`、`auth.json`、`.env` 等凭证形态路径，也没有仓库外路径。
- 受审文件的 sha256 在运行前后一致；`git status --porcelain` 除证据目录外无变化。
- reviewer 没有读取 scope 之外的文件；父会话 fixture 的两轮各只产生 1 次 `subagent` 调用，且 args 未携带 `model`（角色由扩展注入）。
- 证据文件中无凭证：对 `runs/2026-10-18-dual-model/` 全目录搜 `apiKey|Bearer|sk-…|authorization` 只命中 `summary.json` 里那句“apiKey 不会写入证据”的说明。

## 6. 脚本与主代理的分工

脚本机械断言（不依赖模型判断）：

- 两个 round 必须是不同模型；模型必须出现在本机 catalog 且网关 `/v1/models` 列出。
- 生效 api 必须是 `openai-completions`；模型条目不得带 endpoint；两轮必须同一 provider。
- 父会话 args 不得含 `model`；child 请求/会话的 model 必须等于保存的 review 角色；thinking 档位必须等于配置。
- wire 声明工具必须恰为 `read/grep/find/ls`；会话日志不得出现其它工具。
- 工具路径必须在仓库内、且不含凭证形态路径；至少读过一份真实项目文件。
- 受审文件 hash 与 `git status` 在运行前后一致。
- 输出必须带约定 JSON 块；对照锚点命中 ≥2。
- child 会话日志被复制进证据目录并记 sha256。
- 失败即 exit 1，不会因为“审阅文字看着不错”而改判。

主代理负责（脚本不判断）：每条意见的内容是否成立、引用位置是否成立、是否属于授权范围、是否值得修改，以及能否把本轮结果上升为 P3 支持状态。本轮 26 条结构化 findings 尚未做这一步逐条核实。

## 7. 未完成与具体阻碍

1. **意见内容未逐条核实**（本轮验收剩余的主要工作）：Round A 20 条（9 条真实项目 + 11 条对照）、Round B 6 条（1 条真实项目 + 5 条对照）。脚本只证明“拿到结构化意见”，不证明意见对。注意 Round B 只对真实项目给出 1 条意见，覆盖面明显窄于 Round A，不能据它判断 `scripts/check-p3-readonly-gate.mjs` 无问题。
2. **`docs/validation-p3.md` 第 17 行仍记录“未全通（exit 1）”**：该表格不在本次可写路径内，需要主代理更新，否则文档之间自相矛盾。
3. **历史证据目录改名**：修复前那次运行的证据从 `runs/2026-10-18-dual-model/` 移到了 `runs/2026-10-18-dual-model-attempt1/`（未纳入 git，改名是为了让本轮输出能落在任务指定路径且不销毁旧证据）。若其他文档引用旧路径，需要同步。
4. **Anthropic messages 模型仍不支持**：录制代理只解析 openai-completions；`opendesign/glm-5.3-flash` 这类模型会被显式 `blocked`。若将来必须用它，需要代理支持 `/v1/messages` 的解析与转发。
5. **`pi-subagents` 的 ambient extensions 警告**：运行日志出现 `extensions: [] override for agent 'pstack.comment-sicko' disables ALL ambient extensions…`。本轮不受影响（provider 由 models.json 解析），但这条警告提示角色若依赖 provider 扩展会失效，属于待确认项。
6. **未覆盖**：网关内部路由到厂商、后台 child、取消/超时返回路径、writer 委派、并发 worktree、Pi 升级后的行为变化、以及 `--self-test` 之外的其它上游线格式。

## 8. 复现

```bash
# 只读预检（无外部调用）
node scripts/check-p3-live-review.mjs --dry-run

# 全链路自检（本地 stub 上游，无外部调用，会复制 stub child 的会话日志）
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  node scripts/check-p3-live-review.mjs --self-test --out /tmp/p3-live-selftest

# 实跑（两个真实模型各一次；会向本机 magpie 网关发出真实推理）
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
  node scripts/check-p3-live-review.mjs --out scripts/fixtures/p3-live-review/runs/<run-id>
```

依赖：本机 pi 1.3.0 包根、pi-subagents、可用的 `magpie` provider（catalog 与网关都要在），以及 `~/.pi/agent/models.json` 中列出的 `opendesign/deepseek-v4.1-flash` 与 `opendesign/glm-5.3-flashx`。缺任一项脚本输出 `status: blocked` 并以非零退出，不做替换。

## 9. 证据文件

`scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model/`：

- `summary.json`：本轮结论、`providerIsolation`（隔离机制与剥离清单）、每轮 wire 捕获、只读汇总、`failures: []`。
- `round-A.json` / `round-B.json`：每轮请求记录、工具调用、usage、`exitCode`、结构化 findings。
- `round-A.md` / `round-B.md`：模型原始报告全文。
- `round-A-child-session.jsonl` / `round-B-child-session.jsonl`：child 会话原始日志（含 `model_change`、工具调用与工具结果）。
- `run-notes.md`：本批文件的来源、脱敏与归档说明。

输入（可重放）：`scripts/fixtures/p3-live-review/scope.json`（真实范围、合成对照、两个 round 的模型）、`brief.md`、`controls/comment-slop-sample.ts`。

历史对照：`scripts/fixtures/p3-live-review/runs/2026-10-18-dual-model-attempt1/`（修复前那次 exit 1 的完整证据）。
