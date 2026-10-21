# 0.3.2 路由覆盖验收（Issue #14）

日期：2026-10-21。分支：`fix/14-routing-coverage`。工作树：`/Users/jiangkoumo/.herdr/worktrees/pi-pstack/fix-14-routing-coverage`。

## 结论与边界

- 本次修复了 `poteto-mode` 缺失的 recall、tdd、sharpen、correct、automate-me 路由，删除了 `automate-me` / `recall` 的旧 substitute 表行，并移除了 `create-skill` 幻影技能引用。`bugbot-triage` 保留为真实的 `references/bugbot-triage.md` 文件引用。
- 46 条请求和命中断言已入仓，但**原始 46 项复测清单未提供**。这是一份可复现的重建清单（23 个 playbook + 23 个 skill 用例），不是 0.3.1 报告的原样重放，也不能称为“原始 46 项复测通过”。
- 真实 mode-on 验收使用 `magpie/opendesign/deepseek-v4.1-flash`。首轮全量 46 例为 **40 pass / 6 fail**。针对 6 个失败做修复后定向重放，最终有 **44/46** 在真实运行中留下通过记录；**2 个 recall 变体仍未通过**，见下文。
- 真实运行只验证 mode-on 的**路由选择层**：模型成功读取目标 skill/playbook（recall 还要求成功读取当前 cwd 的会话 fixture）。它不代表完整工作流执行、编辑质量或最终答复质量。

## 基线

- 环境：Node `v22.22.2`，npm `10.9.7`。
- 工作树初始无 `node_modules`；首次 `npm ci` 继承了 `NODE_ENV=production`，漏装 `jiti`，`npm test` 以 exit 1 报 `ERR_MODULE_NOT_FOUND: jiti`。这是环境问题，不是代码基线。
- 以 `NODE_ENV=development npm ci --include=dev --cache /tmp/pstack-032-cache-14` 重装后，`npm test` exit 0（主控干净 clone 基线亦为 pass，约 63 秒）。
- 修改前的模板里，`poteto-mode` 的 `Remaining triggers` 没有 recall/tdd/sharpen/correct/automate-me 路由；`Substitute routes` 仍把 `automate-me` 和 `recall` 当替代路线；正文还引用了不存在的 `create-skill` 技能。

## 改动

- `adapters/pi/overrides/skills/poteto-mode/SKILL.md.template`
  - 新增明确触发：recall（含 `what did I work on`、`上次我们做到哪了`、`这周做了什么`、`之前的会话`）、tdd（test-first / red green refactor / TDD）、sharpen、correct、automate-me。
  - 新增 `run until done` / 有界 `/loop run --until` → **Autonomous run**，避免误入 Feature。
  - 删除 `automate-me`、`recall` 的旧 substitute 行，并注明两者已由移植技能接管。
  - 移除 `create-skill` 幻影技能引用；作者流程改指 `authoring-a-skill` playbook。
  - 保留 `references/bugbot-triage.md` 作为真实 reference 文件。
  - Pi 资源路径表补上 recall、tdd、sharpen、correct、automate-me、why、show-me-your-work。
- `adapters/pi/overrides/skills/recall/SKILL.md.template`
  - description 增加中文触发词。
  - 明确先计算唯一的 workspace 目录，禁止列举 sessions 根、禁止 `sessions/*` / `**/sessions/*` 跨目录 glob，禁止读其他 `--<slug>--`。
  - 排序改为运行包内 `scripts/session-context.mjs` 的 `listWorkspaceSessions`（程序，不是 shell 文件读取）；无 shell 时只用原生列目录元数据，不拿 UUID/时间戳前缀猜顺序。
  - 明确正文读取只用原生 `read` / `grep`，不用 `cat`、`head`、`tail`、`sed` 或 shell `grep`。
- `scripts/routing-cases.json`：46 条重建用例，带 `source.kind = "reconstructed"` 和不冒充原始报告的说明。
- `scripts/routing.test.mjs`：离线清单/文件/顺序断言，以及 `--live` 真实 Pi 入口。
- `scripts/check-skill-references.mjs`：模板按生成目标路径解析链接；未知本地链接、未知 `/skill:`、幻影技能名失败；真实 `references/*.md` 通过。

## 离线检查（实际执行）

| 命令 | exit | 结果 |
| --- | ---: | --- |
| `node --test scripts/routing.test.mjs` | 0 | 7 tests / 7 pass / 0 fail；46 条 schema、命中文件存在、触发文本、幻影引用、显式-only、引用检查器正反例 |
| `node scripts/check-skill-references.mjs` | 0 | 89 个模板文件，224 条本地链接，41 个 `/skill:` 引用，0 错误 |
| `git diff --check` | 0 | 无空白错误 |

离线 suite 只证明清单结构和引用闭包，**不能**当作 46 条真实路由通过。真实选择由下面的 live 运行记录。

## 真实 mode-on 运行

入口：

```bash
node scripts/routing.test.mjs --live --timeout-ms 45000 --out /tmp/pstack-032-live-all-14.json
```

harness 行为：

- 每次运行先把当前包复制到临时目录，删除复制品里的 `skills/`、`agents/`，在复制品内运行 `scripts/generate-pi-resources.mjs`，再用生成后的包作为 extension/skill 根。仓库里旧的生成物不参与 live 选择。
- 每个 case 使用独立的临时 cwd、`HOME` 和 `PI_CODING_AGENT_DIR`；`HOME` 与 `PI_CODING_AGENT_DIR` 指向同一 fixture，避免 `~/.pi/agent` 落到操作者真实目录。真实凭据只经只读 `CredentialStore` 读取，从不打印 key。
- 工具白名单只有 `read`、`grep`、`find`、`ls`，不提供 bash；单 case 上限 45 秒。
- 非 recall case 在成功 `read` 目标 skill/playbook 后立即 abort；recall case 必须同时满足：成功读 `recall/SKILL.md`、成功读当前 cwd 的 `--<slug>--` 会话文件、目标 skill 先于会话读取，且没有跨 workspace 的 sessions 访问。
- 只把成功的 `read` tool result 计为命中；`ls`/`find`/`grep` 跨 sessions 根或跨 slug 会记录为 `sessionViolations` 并判 fail，不会因为不是 `read` 而忽略。
- 每个 case 的 `finally` 先 `extensionRunner.emit({type:'session_shutdown',reason:'quit'})`，再 `dispose()`，两步都有超时上限。

### 首轮全量

- 命令 exit 1；结果文件 `/tmp/pstack-032-live-all-14.json`。
- 模型：`magpie/opendesign/deepseek-v4.1-flash`。
- **40 pass / 6 fail**。
- 6 个失败：`pb-autonomous-run`（误读 feature/architect/how，45s timeout）、`sk-recall-what`、`sk-recall-last`、`sk-recall-week`、`sk-recall-prior`（跨 sessions 根/未读会话）、`sk-correct-repeat`（fixture preamble 超时，尚未进入最终请求）。

### 修复后定向重放（只跑受影响 case）

| case | 结果 | 证据摘要 |
| --- | --- | --- |
| `pb-autonomous-run` | pass | 成功读 `poteto-mode/SKILL.md` → `playbooks/autonomous-run.md`，5.9s；request 未改 |
| `sk-correct-repeat` | pass | 成功读 `poteto-mode/SKILL.md` → `correct/SKILL.md`，13.9s；request 保持 `same mistake again; correct the approach`，上下文以 SessionManager fixture 消息注入 |
| `sk-recall-what` | pass | `poteto-mode` → `recall`，随后成功读当前 cwd fixture 的 `2026-10-20...2222.jsonl`；skill 先于 session；无跨 workspace 访问 |
| `sk-recall-week` | pass | `poteto-mode` → `recall` → 当前 cwd fixture `...1111.jsonl`；skill 先于 session |
| `sk-recall-last` | **fail** | 读到了 `recall`，但用 `ls` 列 `<temp>/home/.pi/agent/sessions` 根目录；判定为跨 slug 枚举，未读到目标会话 |
| `sk-recall-prior` | **fail** | 成功读了当前 cwd 的两个会话文件，但从未读 `recall/SKILL.md`；路由顺序失败（session 先于 skill，且没有 skill 命中） |

最终记录：**44/46 有真实通过记录，2 个 recall 变体未通过**（`sk-recall-last`、`sk-recall-prior`）。不把定向重放说成首轮全量通过。

### recall 失败的精确路径

`sk-recall-last` 的违规尝试：

```text
ls <temp>/pstack-routing-live-.../case-0/home/.pi/agent/sessions
```

这是 sessions 根目录，不是 `--<cwd-slug>--` 目录；按“禁止跨 workspace/slug”的验收规则判 fail，没有放宽。

`sk-recall-prior` 的读取顺序：

```text
README.md → <agent>/sessions/--...workspace--/1111.jsonl → 2222.jsonl
```

会话读取本身在正确 workspace 内，但 `recall/SKILL.md` 的 `skillHit = false`，所以不能算 recall 路由成功。

## 实现层未完成项（交由主控）

1. **生成物**：本次只改了 `adapters/pi/overrides/.../*.template`，没有改 `skills/`、`agents/`。主控需运行 `node scripts/generate-pi-resources.mjs` 生成并提交。live harness 已在临时副本中自动生成，避免使用旧生成物。
2. **接线**：未改 `package.json` / `check-package`。建议主控把
   - `node --test scripts/routing.test.mjs`
   - `node scripts/check-skill-references.mjs --include-generated`

   加进 `check`；`--include-generated` 要在生成物更新后使用。
3. **recall 的确定性入口（可选，需主控改 index）**：当前 `extensions/pstack/index.ts` 调 `modeGuidance(mode, skillPath, roles)`，没有注入真实的 `PI_CODING_AGENT_DIR` / session root。若要让 recall 不再靠模型自己算路径，可在 `modeGuidance` 增加 `{ cwd, agentDir, sessionRoot }` 并在 mode 段落写一行精确路径。index 不在本任务允许范围，本次未改；recall 模板已要求先算路径、不列根目录。
4. **两个未通过 recall 变体**：没有为了凑绿放宽跨 workspace 判定，也没有反复重试。`sk-recall-last` 是模型列了 sessions 根；`sk-recall-prior` 是模型跳过 recall skill 直接读会话。两者都是真实行为缺口，保留为已知失败。

## 证据文件

- `/tmp/pstack-032-live-all-14.json`（首轮 46 例，40 pass / 6 fail）
- `/tmp/pstack-032-live-replay-14.json`（6 个失败首次重放）
- `/tmp/pstack-032-live-isolation-14.json`（HOME 隔离后 recall-what、correct-repeat）
- `/tmp/pstack-032-live-recall3-14.json`（recall-last/week/prior 定向重放）
- `/tmp/pstack-032-live-check-14.json`、`/tmp/pstack-032-live-recall-14.json`（早期 harness 证据；后者是 recall 在严格边界检查前的一次通过记录，不作为最终计数）
- `/tmp/pstack-032-live-all-14.log`、`/tmp/pstack-032-live-*.log`（逐 case 的 stderr 进度摘要）

首次 live 尝试因 `node:test` 顶层注册在 `--live` 下也自动执行、且未在读中目标后中止，被主控中止；日志保留为 `/tmp/pstack-032-live-14.log`。当前 `registerOfflineTests()` 只在非 live 路径注册，live 入口命中后立即 abort。
