# @jiangkoumo/pi-pstack

[![CI](https://github.com/jiangkoumo/pi-pstack/actions/workflows/check.yml/badge.svg)](https://github.com/jiangkoumo/pi-pstack/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

将 Lauren Tan（[@poteto](https://github.com/poteto)）的 **pstack** 工业级工程技能与工作流移植为原生的 **Pi Package**。

提供开箱即用的一站式安装体验，为 Pi 用户带来包含软件工程准则、调查/修复/重构/自主运行流程、多模型只读审阅以及有界循环执行在内的完整软件工程方法论。

> **可选依赖与优雅降级说明**：
> 本包将 `pi-subagents`（范围 `^0.79.0`，已在 `0.79.x` 严格验证）声明为可选对等依赖（optional peerDependency）。
> - **已安装兼容的 `pi-subagents` 时**：启用完整的多代理协同与角色路由能力。通过公开事件注册 `pstack.*` 角色代理，支持 `how`、`architect`、`arena`、`swarm`、`interrogate`、`comment-sicko` 以及隔离 worktree 代码委派；
> - **未安装或不可用时**：系统保持单代理完整可用，不阻断包加载。所有的工程原则、方法技能、实战 Playbooks、`/poteto-mode` 模式控制、以及 `/loop` 有界循环长任务底座均照常工作。遇有多代理审阅流程时，Playbook 优雅降级为单代理顺序执行，结果明确标注为自审并记录 `BLOCKED: independent review`，不冒充独立审查。

---

## 核心特性与架构

### 1. 全量 82 项条目 100% 决议闭环
上游 82 个条目已全部完成审计、适配与决议：
* **已适配生成 (77 项 Ported)**：包含工程原则、方法技能、多代理技能与实战 Playbooks；`recall`、`automate-me`、`eval`、`authoring-a-skill` 已接入当前工作区的 Pi 会话。保留本地证据与显式 Git 授权边界；
* **替代路线定案 (5 项 Substitute)**：Benny 三项自动化、`make-bot-ui` 与由扩展命令替代的 `setup-pstack`。来源与替代范围逐项记录；
* **延期待定 (0 项 Deferred)**：上游条目已全部清点决议完毕。

### 2. `/loop` 长任务有界续跑运行时
基于 Pi 1.3.0 官方公开的 `agent_before_settle` 事件规范构建的原子续跑底座：
* **硬性轮次预算**：支持 `--max-turns <n>`（默认 8 轮），防止无界死循环；
* **可执行停止谓词**：启动 loop 必须提供 `--until "<command>"`（如 `--until "npm test"`），每轮结算时在子进程执行检查，exit code 0 自动达标停止；
* **分支绑定与隔离**：状态持久化在会话分支的自定义 entry `pstack.loop.v1` 中；会话重载或切换分支时，仍在运行的 loop 会置为 `interrupted`。普通输入不会自动将 loop 标记为中断；需要主动停止时使用 `/loop stop`；
* **安全守卫**：默认拒绝在脏工作区启动（可传 `--allow-dirty`），绝不向模型授予未经授权的自动 Git 操作权限。

### 3. 多代理安全隔离与运行时角色注册
* **运行时公开事件注册**：本扩展在会话启动时通过 `pi-subagents:runtime-agent-register:v1` 公开事件动态注册 `pstack.poteto-agent`（`code`）、`pstack.comment-sicko`（`review`）、`pstack.verifier`（`verification`）和 `pstack.prose-writer`（`prose`），完全解耦静态包导出与全局命名空间；
* **受限审阅与验证**：comment-sicko 只获得原生读取工具与 `git_read`；verifier 另获 `verification_exec`，可在可用的 macOS/Linux OS 沙箱中执行测试、构建和 lint，拒绝网络及仓库写入。缺少可用 OS 沙箱时会在临时 Git 工作区降级执行，并在结果及 `/setup-pstack status` 中明确告警、列出限制和验证责任人；降级模式不阻断网络或工作区外写入，不能作为 OS 隔离验收依据。无法准备工作区时明确拒绝。两者均无 `edit`、`write`、原生 `bash` 或嵌套委派工具；验证命令中的项目代码仍受上述实际执行边界约束；ambient 模型 provider 扩展保持可加载，工具白名单约束可调用能力；
* **机械门禁与长程编排**：代码编写委派必须生成结构化 Handoff Patch，必须通过独立 Review 与命令验收；多阶段规划提供标准计划模板（`docs/templates/pstack-plan.md`）与 Node CLI 计划检查器（`scripts/check-plan.mjs`），未通过门禁前绝不应用补丁，严禁自动 commit 或 push。

### 4. 模式控制与多角色模型配置
* `/poteto-mode on | off | status`：在当前会话分支开启或关闭系统提示词与工程指引注入；
* `/setup-pstack`：严格 Schema 校验，为 `code`、`bug-fix`、`perf`、`hillclimb`、`judgment`、`strongest`、`review`、`prose`、`verification` 分配精确的 `provider/id` 模型和 thinking 级别，绝不静默回退。

---

## 真实代码库场景实测验证（`npm run check:sim`）

本项目不仅通过了纯逻辑单测，还在真实的业务代码库（`ledger-app` 金融计算工程）中完成了端到端全链路闭环模拟实测：
1. **真实 Bug 注入**：计算模块存在浮点精度漂移 Bug，单元测试真实失败（exit code 1）；
2. **模式与循环驱动**：激活 `/poteto-mode on`，启动 `/loop run --max-turns 4 --until "node --test test/calculator.test.mjs"`；
3. **真实谓词收敛**：经过 2 轮迭代，模型修复业务精度，测试命令返回 exit code 0，系统自动检测并标记 `completed (predicate-satisfied)` 停止；
4. **机械门禁安全合入**：生成二进制补丁，恢复源工作区，经只读审阅报告校验通过后由 `writer-gate.mjs --apply` 安全合入代码。

---

## 安装与使用

### 安装

使用 Pi 官方包管理器进行全局或项目安装：

```bash
# 全局安装
pi install @jiangkoumo/pi-pstack

# 本地调试加载
pi -e /path/to/pi-pstack
```

使用多代理审阅或 writer 委派前，必须先安装提供 `subagent` 工具的可选扩展（要求版本 `>=0.79.2`）：

```bash
pi install npm:pi-subagents
```

安装后重新启动 Pi，使扩展加载。`pi-pstack` 通过公共运行时事件动态注册角色代理，`subagent` 工具由 `pi-subagents` 提供。未安装该扩展时，仍可使用单代理技能、模式与 `/loop`，多代理流程不可用。

从源码运行测试或二次开发时，执行 `npm ci --include=dev && npm test`，安装锁文件中的开发依赖（包含 `jiti`）。显式包含开发依赖可覆盖本机的 `NODE_ENV=production` 或 npm `omit=dev` 设置；更改依赖时执行 `npm install --include=dev` 并提交更新后的锁文件。

### 可选依赖：形式化验证（Java 11+ 与 tla2tools.jar）

TLA+ 模型检查（TLC）是可选能力：本包不打包、也不自动下载 Java 或 `tla2tools.jar`，缺少它们时其余功能照常工作。

- **Java 11+**：扩展用 `java -version` 探测版本，低于 11 视为不可用（例如 `1.8.0_x` 会被拒绝）。
- **tla2tools.jar**：从 TLA+ 官方发布页 <https://github.com/tlaplus/tlaplus/releases> 取得（上游 `statechart` 技能脚本使用同一来源），由操作者自行保存。
- **配置 jar 路径**（只认显式声明，不做猜测）：
  - 环境变量 `TLA2TOOLS_JAR=/absolute/path/to/tla2tools.jar`（兼容上游脚本使用的 `TLA2TOOLS`）；或
  - `pstack.json` 中的 `{"version": 1, "roles": {}, "tla": {"tla2toolsJar": "/absolute/path/to/tla2tools.jar"}}`。
  - 两处声明不同路径时会被拒绝，而不是任选其一；相对路径会被拒绝。
- **受限执行**：只能启动已配置的那一个 jar，只接受仓库内的 `.tla` 与 `.cfg` 路径（按真实路径解析，拒绝 `..` 和符号链接越界）以及白名单 TLC 选项：`-cleanup`、`-nowarning`、`-deadlock`、`-continue`、`-difftrace`、`-workers <n|auto>`、`-depth <n>`、`-seed <n>`、`-coverage <n>`；`.cfg` 由请求的 `config` 字段给出（选项里的 `-config` 不被接受）。其他任何 java 调用一律拒绝。
- **执行边界**：沿用 `verification_exec` 的规则（有 OS 沙箱时在其中运行，否则在临时 Git 工作区降级运行并明确标注），并使用同一超时与输出截断上限；TLC 的状态目录（`-metadir`）与 `java.io.tmpdir` 都指向私有 scratch 目录，仓库保持只读。
- **缺少 TLC 时**：结果明确写「未做形式化验证，原因是缺少 TLC」，并给出上游的 no-verifier fallback——用生成式输入测试真实代码，而不是函数的手工模型。该 fallback 只能报告为生成式测试覆盖，**不能**算作 formal pass。
- **状态与 CI**：能力探测结果由扩展的 `getTlcCapability()`（`detectTlc`）提供，`/setup-pstack status` 的 TLC 字段在共享入口接线后展示。CI 不安装 Java、也不提交 jar，真实 TLC 的可选测试会打印跳过原因（`SKIPPED real TLC: 未做形式化验证，原因是缺少 TLC ...`）；设置 `PSTACK_TLC_REQUIRE=1` 可让缺少 TLC 直接失败。需要真实运行的环境自行配置上述 jar，再执行 `node --test scripts/verification-exec.test.mjs`。

上述获取与配置路径来自 TLA+ 官方发布说明和上游 `statechart` 技能脚本；本项目尚未在本机或 CI 完成一次真实 TLC 通过运行的验收（待验证）。

### 常用命令

```bash
# 1. 开启或查看当前会话的 poteto-mode 状态
/poteto-mode on
/poteto-mode status

# 2. 配置多模型角色（例如分配审查模型）
/setup-pstack set project review opendesign/deepseek-v4.1-flash high
/setup-pstack status

# 3. 启动有界自主推进循环
/loop run --max-turns 6 --until "npm test" "fix the edge cases in parser"
/loop status
/loop stop

# 4. 直接使用特定工程技能
/skill:poteto-mode "investigate the memory leak in worker"
/skill:correct "audit recurring regression patterns"
```

`/loop run` 必须提供 `--until "<command>"` 停止谓词；`--max-turns` 限制最大轮次。`/loop` 的交互入口使用 TUI；无头运行请启动 `pi --mode rpc`，通过 RPC 客户端发送 `/loop run ...` 并处理后续事件。不要使用 print/JSON 模式（`pi -p` 或 `pi --mode json`）启动 loop；这些模式不支持此续跑入口。

### 角色优先级与调用规则

通过 `/setup-pstack` 配置的角色模型直接绑定到各角色的运行时定义中。调用任何包含 pstack 代理的工作流或子代理时，禁止传入顶层 `model` 参数（否则会被机械拦截），以确保各角色使用预设的专属模型。用户级配置 `subagents.agentOverrides.<name>` 优先级高于 `pstack.json`，可按需覆盖特定代理模型与 thinking。

---

## 支持条目索引与映射

| 模块 | 数量 | 典型代表 | 状态与实现依据 |
| :--- | :---: | :--- | :--- |
| **工程原则** | 24 | `model-the-domain`, `fix-root-causes`, `prove-it-works`, `build-the-lever` 等 | Ported（全量正文规范化生成） |
| **工作流程** | 20 | `investigation`, `bug-fix`, `feature`, `autonomous-run`, `orchestrate`, `multi-phase-plan`, `babysit` 等 | Ported（消除自动commit，对齐Pi规范） |
| **核心技能** | 27 | `correct`, `tdd`, `architect`, `arena`, `how`, `poteto-help`, `benchmark-checklist` 等 | Ported（接入角色模型与只读白名单） |
| **代理角色** | 4 | `comment-sicko`, `poteto-agent`, `verifier`, `prose-writer` | Ported（通过运行时公共事件动态注册） |
| **替代条目** | 5 | Benny 三项自动化、`make-bot-ui`、`setup-pstack` 扩展命令 | Substitute（逐项记录替代边界） |

详细的逐项审计、源码指纹与适配说明请参阅 [逐项移植映射 (port-map.json)](docs/port-map.json) 与 [逐项审计清单 (skill-audit.md)](docs/skill-audit.md)。

---

## 质量与防漂移保障

本项目采用“固定上游源码（`upstream/`）+ Pi 适配层（`adapters/pi/`）+ 生成分发资源（`skills/`, `agents/`）”的设计：
* `npm run check:generate`：校验固定上游指纹与生成产物，拒绝漂移；当前检查 117 项资源；
* `npm test`：执行模式持久化、Loop 状态机、生成器、Writer Gate 与保真度门禁行为测试；
* `npm run check:fidelity`：运行指定上游文本对比脚本，要求整体至少94%、每个已移植Markdown至少70%；
* `npm run check:sim`：真实代码库端到端闭环实测。

---

## 发布

发布由 tag 驱动：推送 `v*` tag 后，`.github/workflows/publish.yml` 校验 tag 与 `package.json` 版本一致，运行 `npm test`、`npm run check:generate` 和 `npm run check:fidelity`，再发布 npm。0.3.2 的发布目标是由 CI 完成；可信发布者配置与实际结果记录在 [集成验收](docs/validation-032-release.md)。

本地一键发布：

```bash
npm run release -- patch --dry-run   # 跑门禁、显示下一版本，不改文件
npm run release -- patch             # 仅本地 commit + annotated tag
npm run release -- patch --push      # 再 push commit 与 tag
npm run release -- patch --publish   # npm publish 并 push commit 与 tag（需先 npm login）
```

`--publish` 隐含 `--push`；脚本默认只接受 `main` 分支、要求工作区干净，并在任何写入前跑完门禁。支持 `patch` / `minor` / `major`。CI 发布前需在仓库 Settings → Secrets 配置 `NPM_TOKEN`；预发布版本会自动使用 `next` tag。本地 `--publish` 后 tag 仍会触发 workflow；workflow 会检查该版本是否已存在于 npm，已发布则跳过，避免重复发布。

---

## 许可证与来源

- 本项目遵循 [MIT 许可证](LICENSE)；
- pstack 技能与工作流版权归原作者 Lauren Tan（[@poteto](https://github.com/poteto)）所有，上游许可证见 [LICENSES/pstack.txt](LICENSES/pstack.txt)；
- 详细第三方声明参见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
