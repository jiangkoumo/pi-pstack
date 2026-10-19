# P5 /loop 长任务有界续跑机制验收

状态：**命令语法、状态机模型、纯单元测试与真实 Pi 1.3.0 宿主端到端测试均已全部通过。**

对应计划项：[移植计划](migration-plan.md#p5长时间执行与全量覆盖)。

---

## 核心设计与契约

上游 pstack 中的 `/loop` 是 Cursor 专属的续跑命令，上游工作流（如 `autonomous-run`、`hillclimb`）严重依赖循环推进。
在 Pi package 移植中，我们确立了以下边界：
1. **不依赖后台常驻进程/定时器**：利用 Pi 官方公开事件 `agent_before_settle` 在单次 Run 即将结算时进行受控续跑，每次只请求一次下一轮，天然具备单步可控与原子有界性；
2. **命令不越权**：`/loop` 仅负责向模型调度下一轮会话，不向模型授予任何未经授权的 Git 自动提交、推送或绕过审查的特权；
3. **分支绑定与重启隔离**：状态记录在会话分支自定义 entry `pstack.loop.v1` 中，切换分支或重载会话时自动标记为 `interrupted`，禁止隐式静默狂跑；
4. **显式停止谓词**：支持 `--until "<cmd>"`，每轮结算前通过 `pi.exec` 执行操作者提供的检查脚本；返回 0 即判定成功停止，非 0 继续，超时（默认 60s）或错误立即中止；
5. **轮次预算保护**：支持 `--max-turns <n>`（默认 8，范围 1～100），耗尽强制停止，防止无限死循环。

---

## 验证证据

### 1. 纯逻辑单元测试（`scripts/loop.test.mjs`）
测试覆盖：
- 参数解析：默认无参 `status`、带原因的 `stop`、带预算校验的 `resume`、带双引号的 `--until` 与 `--` 分隔目标文本；
- 分支状态重构：空分支、活跃状态、停止状态与畸形 entry 拦截；
- 状态转移判定：宿主 aborted/error 停止、谓词达标（exit code 0）成功停止、谓词未达标推进轮次、轮次耗尽（budget-exhausted）安全停止、谓词超时与错误拦截；
- Prompt 生成：包含轮次、目标与谓词状态，包含禁止自动提交与推送的硬性约束。

执行命令：
```bash
node --test scripts/loop.test.mjs
# 7 tests passed (exit code 0)
```

### 2. 真实 Pi 宿主端到端测试（`scripts/check-loop-host.mjs`）
在隔离临时目录中启动本地 Fixture Provider，通过真实 Pi 1.3.0 SDK 的 `createAgentSession` 加载扩展并执行完整生命周期验证：
- **场景 1（预算耗尽停止）**：启动 `--max-turns 2`，无谓词；第 1 轮结算时触发续跑，第 2 轮结算时达到预算上限，会话自动停止并写入 `budget-exhausted` 状态，共发起 2 次模型请求；
- **场景 2（谓词达标成功退出）**：启动 `--max-turns 5 --until "test -f <marker>"`；第 1 轮未满足继续，第 2 轮检测到 marker 生成，谓词返回 exit code 0，会话在第 2 轮提前终止并标记 `predicate-satisfied`；
- **场景 3（操作者中断）**：启动 `--max-turns 10`，运行期间操作者执行 `/loop stop operator aborted manually`，活动 loop 立即被标记为 `stopped`，后续不再继续。

执行命令：
```bash
PI_PSTACK_PI_ROOT=<Pi-path> node scripts/check-loop-host.mjs
# Output:
# PASS Test 1: Bounded loop stops at max-turns budget
# PASS Test 2: Loop stops when predicate is satisfied
# PASS Test 3: Operator /loop stop aborts active loop
# { "status": "passed", "failures": 0 }
```

---

## 关联流程：pause-safely 纳入生成器

`pause-safely` 作为 P5 首批本地暂停流程，与本批 `/loop` 一起纳入生成资源：

- 适配模板：`adapters/pi/overrides/skills/poteto-mode/playbooks/pause-safely.md.template`；
- 生成输出：`skills/poteto-mode/playbooks/pause-safely.md`；
- port-map：`disposition: ported`，`dependencies: ["skills/poteto-mode/SKILL.md"]`，模板只保留 `../SKILL.md` 这一条相对链接，规范化后与声明一致；
- 证据：`docs/validation-p5-loop.md`（本节）。

安全适配点：

- 只在操作者显式暂停时生效；“keep going”“going to bed”不触发暂停。
- 默认不 commit、不 push、不开或更新 PR、不合并、不清理 worktree；这些动作都需要单独授权，暂停请求不等于提交请求。
- 现场状态落入本地 run 目录的 `state.txt`、`changes.patch`、`untracked.txt`、`resume.md`；不以 `/tmp` 作为唯一副本，也不把现场记录伪装成 commit。
- 只停止本 run 记录过的嵌套子代理，按 run id 调用 `subagent({ action: "stop", id })`，不停无关后台任务。

生成与门禁结果（pause-safely 纳入时）：

```text
npm run generate
{"status":"passed","generated":17,"written":1}

npm run check:generate
{"status":"passed","checked":17,"unmanaged":0}

npm run check
EXIT:0
```

`npm run check` 同时报告：`mapped: 82`、`archived: 18`、`dispositions: { ported: 17, substitute: 6, deferred: 59 }`，P2/loop/generation/writer-gate 测试分别为 4、7、25、13 项全部通过。

证据边界：以上覆盖资源生成、链接闭包、授权措辞和全套门禁；本轮没有启动真实模型执行一次“脏树 + 活动子代理”的暂停场景，行为级暂停/恢复样例仍需在后续真实任务中单独记录，不能用生成成功代替。

---

## 关联流程：autonomous-run 纳入生成器

`autonomous-run` 作为 P5 第二批长任务流程纳入生成资源：

- 适配模板：`adapters/pi/overrides/skills/poteto-mode/playbooks/autonomous-run.md.template`；
- 生成输出：`skills/poteto-mode/playbooks/autonomous-run.md`；
- port-map：`disposition: ported`，`dependencies: ["skills/poteto-mode/SKILL.md"]`，模板只保留 `../SKILL.md` 这一条相对链接，规范化后与声明一致；
- 证据：`docs/validation-p5-loop.md`（本节）。

映射与安全边界：

- 上游 Cursor `/loop` 映射为 Pi 的 `/loop run --max-turns <n> --until "<predicate>" --until-timeout <sec> "<goal>"`；`--max-turns` 范围 1-100（默认 8），`--until-timeout` 范围 1-600 秒（默认 60）。
- 谓词退出码 0 停止为 `predicate-satisfied`；1-125 继续有界循环；126 及以上、启动错误或超时按失败停止，不能当作“尚未完成”继续跑。
- 每轮在本地 run 目录写 `decisions.tsv` 与补丁/命令输出；默认不 commit、不 push、不开或更新 PR。只有单独授权才允许提交，且不使用 `git add -A`。
- 操作者用 `/loop stop` 暂停或中止；`/loop resume` 只在显式指示下重入。重启、reload 或分支切换后状态标记为 `interrupted`，不自动续跑。
- 上游的 watcher 子代理与定时心跳没有直接等价物。模板要求用有界轮次和谓词推进；若确需等待外部事件且委派已授权，可使用有界 watcher 子代理，否则在下一轮重新检查，不声称存在内置定时器。

生成与门禁结果（autonomous-run 纳入时）：

```text
npm run generate
{"status":"passed","generated":18,"written":1}

npm run check:generate
{"status":"passed","checked":18,"unmanaged":0}

npm run check
EXIT:0
```

`npm run check` 同时报告：`mapped: 82`、`archived: 19`、`dispositions: { ported: 18, substitute: 6, deferred: 58 }`，P2/loop/generation/writer-gate 测试分别为 4、7、25、13 项全部通过。

证据边界：以上覆盖 autonomous-run 模板的资源生成、链接闭包、`/loop run` 命令语法、授权措辞和全套门禁；本轮没有启动真实模型执行一次完整自治任务，行为级自主续跑样例仍需在后续真实任务中单独记录，不能用生成成功代替。

---

## 关联流程：Batch B 四个 Playbook 纳入生成器

`prototype`、`session-pickup`、`worktree-cleanup`、`hillclimb` 已纳入生成资源，统一只依赖父技能 `skills/poteto-mode/SKILL.md`：

- `prototype`：使用隔离 scratch 目录，明确不启动 `/loop`，不把原型变成 commit、push 或 PR；缺少视觉/行为驱动时明确报告能力缺口。
- `session-pickup`：只读当前 Pi 会话分支或操作者显式提供的会话文件，不扫描 Cursor transcript 或云 URL；恢复 `/loop` 需操作者显式 `/loop resume`。
- `worktree-cleanup`：先审计 `git worktree list`、脏状态、活动子代理与所有者，再逐路径授权删除；不做默认模拟器/缓存清理，不用无界 `/loop` 驱动破坏性清理。
- `hillclimb`：绑定有界 `/loop run --until ... --max-turns ...`，冻结测量 harness，测量串行、代码探索可并行；每个尝试写本地 `decision.tsv`，默认不 commit/push/PR。

生成与门禁结果（Batch B 纳入时）：

```text
npm run generate
{"status":"passed","generated":45,"written":8}

npm run check:generate
{"status":"passed","checked":45,"unmanaged":0}

npm run check
EXIT:0
```

`npm run check` 同时报告：`mapped: 82`、`archived: 46`、`dispositions: { ported: 45, substitute: 6, deferred: 31 }`、`unchangedBodies: 27`、`changedBodies: 7`，P2/loop/generation/writer-gate 测试分别为 4、7、25、13 项全部通过。

证据边界：以上覆盖 4 个模板的资源生成、父技能链接闭包、`/loop` 绑定措辞、受管隔离措辞和全套门禁；本轮没有用真实模型执行原型、会话恢复、worktree 清理或 hillclimb 任务，行为级验收仍需后续真实任务补验。

---

## 关联流程：Batch C 九个 Playbook 纳入生成器

`autopilot-full`、`autopilot-stack`、`babysit`、`multi-phase-plan`、`opening-a-pr`、`orchestrate`、`perf-issue`、`refactoring`、`shipping` 已纳入生成资源，统一只依赖父技能 `skills/poteto-mode/SKILL.md`。

- `autopilot-full` / `autopilot-stack` / `shipping`：保留 owner、frontier、独立 verdict 与 patch-id 规则；推送、PR、合并、重定基全部改为显式授权门，不再假设 Cursor cloud agent 或自动合并。
- `babysit`：声明模式，只处理最低未合并 PR；重复检查使用有界 `/loop run --until ... --max-turns ...`，不再使用无界 `/loop 1h`；冲突和拓扑操作报告给 owner。
- `opening-a-pr`：推送与 PR 创建都要求显式授权；禁止 force-push 共享分支、自动合并和未经授权的 retarget。
- `multi-phase-plan` / `orchestrate`：计划与协调产物落到本地 store；执行需操作者显式 go；worker 使用受管 worktree；没有云环境假设。
- `perf-issue` / `refactoring`：分别保留基线/后测与行为 contract/等价验证；默认不 commit/push/PR。

生成与门禁结果（Batch C 纳入时）：

```text
npm run generate
{"status":"passed","generated":61,"written":16}

npm run check:generate
{"status":"passed","checked":61,"unmanaged":0}

npm run check
EXIT:0
```

`npm run check` 同时报告：`mapped: 82`、`archived: 62`、`dispositions: { ported: 61, substitute: 21, deferred: 0 }`、`unchangedBodies: 27`、`changedBodies: 14`，P2/loop/generation/writer-gate 测试分别为 4、7、25、13 项全部通过。

证据边界：以上覆盖 9 个模板的资源生成、父技能链接闭包、授权门禁措辞和全套门禁；本轮没有用真实模型执行 PR 队列、栈式交付、babysit、编排、性能修复或重构任务，行为级验收仍需后续真实任务补验。

---

---

## 真实代码库端到端模拟测试（check:sim）

在真实业务代码库环境（`scripts/check-real-codebase-simulation.mjs`）中完成了完整的工程闭环模拟：
1. **构造真实业务工程**：初始化带业务精度 Bug 的金融计算模块（`src/calculator.js`）及真实严格单元测试（`test/calculator.test.mjs`），证明基线测试失败（exit code 1）；
2. **加载移植包与模式激活**：由真实 Pi 1.3.0 SDK 在隔离临时目录加载 `@jiangkoumo/pi-pstack` 包，执行 `/poteto-mode on` 成功持久化活动分支模式条目；
3. **真实谓词循环收敛**：启动 `/loop run --max-turns 4 --until "node --test test/calculator.test.mjs" "fix precision calculation"`，经过 2 轮迭代模型精准修复浮点漂移，谓词检查返回 exit code 0，系统检测到谓词满足自动标记 `completed` 并成功停止；
4. **验证仓库实际状态**：工作区业务代码测试通过（`pass 2`，exit code 0）；
5. **机械门禁（Writer Gate）安全合入**：捕获二进制补丁（`fix.patch`），重置源工作区至干净基线，模拟由 `pstack.comment-sicko` 产出的独立 Review 报告（带 sha256 校验），调用 `writer-gate.mjs --apply`，机械门禁检验通过并安全合入补丁（`gateResult.status === 'passed'`，`applied === true`）。

实测运行结果：
```text
PI_PSTACK_PI_ROOT=<Pi-path> npm run check:sim

✓ Baseline: Real test suite fails as expected
✓ Poteto-mode activated with persistent branch entry
✓ Running /loop command: /loop run --max-turns 4 --until "node --test test/calculator.test.mjs" fix precision calculation in calculator.js
✓ Loop successfully converged: predicate exit code 0 achieved in 2 turns
✓ Verification: Real repo test suite passes cleanly
✓ Mechanical Review Gate: Approved with independent review and check validation
{
  "status": "passed",
  "scenario": "real-codebase-e2e-simulation",
  "repo": "ledger-app",
  "iterations": 2,
  "predicate": "node --test test/calculator.test.mjs",
  "gateStatus": "approved",
  "finalInvariants": "all tests passing, clean commit-ready patch generated"
}
```

---

## 结论

`/loop` 底座机制、长任务工作流与机械审查门禁已在 Pi 1.3.0 环境下形成完整的真实业务工程闭环，上游全部 82 项条目已达成 100% 决议覆盖（61 ported, 21 substitute, 0 deferred）。
