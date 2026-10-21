# @jiangkoumo/pi-pstack

[![CI](https://github.com/jiangkoumo/pi-pstack/actions/workflows/check.yml/badge.svg)](https://github.com/jiangkoumo/pi-pstack/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

将 Lauren Tan（[@poteto](https://github.com/poteto)）的 **pstack** 工业级工程技能与工作流移植为原生的 **Pi Package**。

提供开箱即用的一站式安装体验，为 Pi 用户带来包含软件工程准则、调查/修复/重构/自主运行流程、多模型只读审阅以及有界循环执行在内的完整软件工程方法论。

---

## 核心特性与架构

### 1. 全量 82 项条目 100% 决议闭环
上游 82 个条目已全部完成审计、适配与决议：
* **已适配生成 (73 项 Ported)**：包含 24 个工程原则、19 个纯方法技能、7 个深度协同技能（`architect`, `arena`, `interrogate`, `no-comments`, `reflect`, `swarm`, `why`）及 20 份实战 Playbooks（新增 `runtime-forensics`, `trace-forensics`, `visual-parity`）；彻底消除了上游未经授权自动 commit/push 的原生假设，转为本地证据沉淀与显式授权门禁；
* **替代路线定案 (9 项 Substitute)**：对依赖 Slack/Linear/Cursor 私有云的自动化条目（如 Benny、make-bot-ui、云端 transcript）确立了本地优先与 MCP 协议解耦的替代方案，并在主技能与相关文档中明确指出替代路径；
* **延期待定 (0 项 Deferred)**：上游条目已全部清点决议完毕。

### 2. `/loop` 长任务有界续跑运行时
基于 Pi 1.3.0 官方公开的 `agent_before_settle` 事件规范构建的原子续跑底座：
* **硬性轮次预算**：支持 `--max-turns <n>`（默认 8 轮），防止无界死循环；
* **可执行停止谓词**：启动 loop 必须提供 `--until "<command>"`（如 `--until "npm test"`），每轮结算时在子进程执行检查，exit code 0 自动达标停止；
* **分支绑定与隔离**：状态持久化在会话分支的自定义 entry `pstack.loop.v1` 中；会话重载或切换分支时，仍在运行的 loop 会置为 `interrupted`。普通输入不会自动将 loop 标记为中断；需要主动停止时使用 `/loop stop`；
* **安全守卫**：默认拒绝在脏工作区启动（可传 `--allow-dirty`），绝不向模型授予未经授权的自动 Git 操作权限。

### 3. 多代理安全隔离与运行时角色注册
* **运行时公开事件注册**：本扩展在会话启动时通过 `pi-subagents:runtime-agent-register:v1` 公开事件动态注册 `pstack.poteto-agent`（`code`）、`pstack.comment-sicko`（`review`）、`pstack.verifier`（`verification`）和 `pstack.prose-writer`（`prose`），完全解耦静态包导出与全局命名空间；
* **物理只读审阅者 (`pstack.comment-sicko` / `pstack.verifier`)**：强制限定工具白名单为 `read, grep, find, ls`，物理禁用 `edit, write, bash, subagent`，并阻断外部 extensions 与 supervisor 桥接；
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

从源码运行测试或二次开发时，需先执行 `npm install` 安装 `devDependencies`。

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
| **外部替代** | 9 | Benny 自动化系列, `make-bot-ui`, `automate-me` 等 | Substitute（提供标准解耦与本地替代） |

详细的逐项审计、源码指纹与适配说明请参阅 [逐项移植映射 (port-map.json)](docs/port-map.json) 与 [逐项审计清单 (skill-audit.md)](docs/skill-audit.md)。

---

## 质量与防漂移保障

本项目采用“固定上游源码（`upstream/`）+ Pi 适配层（`adapters/pi/`）+ 生成分发资源（`skills/`, `agents/`）”的设计：
* `npm run check:generate`：校验 62 份上游源码 blob SHA-1 哈希与 61 项生成产物，严格防代码漂移；
* `npm run check`：全套门禁包含模式持久化单测、Loop 状态机测试、生成器测试与 Writer Gate 单元测试；
* `npm run check:sim`：真实代码库端到端闭环实测。

---

## 发布

发布由 tag 驱动：推送 `v*` tag 后，`.github/workflows/publish.yml` 会校验 tag 与 `package.json` 版本一致，运行 `npm run check` 与 `npm run check:generate`，再使用仓库 secret `NPM_TOKEN` 发布 npm。

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
