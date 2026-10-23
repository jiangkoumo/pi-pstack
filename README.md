# pi-pstack

[![CI](https://github.com/jiangkoumo/pi-pstack/actions/workflows/check.yml/badge.svg)](https://github.com/jiangkoumo/pi-pstack/actions/workflows/check.yml)
[![npm](https://img.shields.io/npm/v/@jiangkoumo/pi-pstack.svg)](https://www.npmjs.com/package/@jiangkoumo/pi-pstack)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

把 Lauren Tan（[@poteto](https://github.com/poteto)）为 Cursor 写的 [pstack](https://github.com/cursor/plugins/tree/main/pstack) 移植到 [Pi](https://github.com/earendil-works/pi) coding agent。

pstack 是一套工程方法：24 条工程原则、23 个工作流程（调查、修 bug、做功能、重构、自主运行……）、独立审阅、多模型分工，以及形式化验证。这个包把它们做成原生的 Pi 技能和扩展，装上就能用。

> 非官方移植。上游固定在 pstack 0.15.30（`eb4db2b5`）。

## 能做什么

- **`/poteto-mode`**：开启后，Pi 会按 pstack 的流程干活：先判断任务类型，再走对应的工作流程，关键步骤停下来等你批准，不会自动 commit 或 push。
- **独立审阅与分工**：配合 `pi-subagents`，代码由 `pstack.poteto-agent` 在隔离 worktree 里写，`pstack.comment-sicko` 只读审阅，`pstack.verifier` 在沙箱里跑测试。每个角色可以用不同的模型。
- **`/loop`**：有轮数上限的长任务续跑，每轮跑一次你给的检查命令（比如 `npm test`），通过就停。
- **形式化验证**：`/skill:create-formal-verification-skill` 为你的项目生成 TLA+ 模型和真实代码检查，完成前会自动重跑并核对结果。需要 Java 和 TLC，没有也能用其余功能。
- **单独使用的技能**：`correct`、`tdd`、`how`、`architect`、`sharpen`、`ketchup`、`recall`、`statechart` 等。

## 安装

```bash
pi install npm:@jiangkoumo/pi-pstack

# 可选：多代理审阅和委派需要它（0.79.x）
pi install npm:pi-subagents
```

装完重启 Pi。没装 `pi-subagents` 时，单代理功能全部可用；需要独立审阅的流程会降级为自审，并明确标注 `BLOCKED: independent review`，不会冒充独立审查。

## 快速上手

```bash
# 开启 pstack 模式，然后照常提需求
/poteto-mode on
/poteto-mode status

# 给不同角色配模型（provider/model + thinking 级别）
/setup-pstack set project code     <provider>/<model> high
/setup-pstack set project review   <provider>/<model> high
/setup-pstack status

# 有界续跑：最多 6 轮，npm test 通过就停
/loop run --max-turns 6 --until "npm test" "fix the edge cases in parser"
/loop status
/loop stop

# 直接调用某个技能
/skill:how "这个 worker 的内存是怎么涨上去的"
/skill:sharpen "refactor caching layer"
/skill:create-formal-verification-skill "queue concurrency invariants"
```

几点说明：

- 可配置的角色有 `code`、`bug-fix`、`perf`、`hillclimb`、`judgment`、`strongest`、`review`、`prose`、`verification`。没配的角色不会静默换成别的模型。
- 用户级配置在 Pi agent 目录的 `pstack.json`，项目级配置在 `.pi/pstack.json`，项目级优先。`subagents.agentOverrides.<name>` 可以单独覆盖某个代理。
- 调用 pstack 代理时不要传顶层 `model` 参数，会被拦下，以保证各角色用你配的模型。
- `/loop` 要在 TUI 或 RPC 模式（`pi --mode rpc`）下用，`pi -p` 和 `--mode json` 不支持。默认拒绝在有未提交改动的工作区启动，可以加 `--allow-dirty`。

## 和上游的对应关系

上游 85 项全部有去处：

| 类别 | 数量 | 处理方式 |
| :--- | :---: | :--- |
| 工程原则 | 24 | 移植 |
| 工作流程（playbooks） | 23 | 移植，去掉自动 commit，加上 Pi 的授权门 |
| 技能 | 31 | 移植，接入角色模型与只读工具白名单 |
| 代理 | 2 | 移植（`poteto-agent`、`comment-sicko`），另加 `verifier`、`prose-writer` 等角色代理 |
| 替代 | 5 | Benny 三项自动化、`make-bot-ui`、`setup-pstack`（改成扩展命令） |

逐项对照见 [port-map.json](docs/port-map.json) 和 [skill-audit.md](docs/skill-audit.md)。上游正文按句子做保真度检查，整体不低于 94%（`npm run check:fidelity`）。

## 安全边界

- 不会自动 commit、push 或开 PR，这些都要你批准。
- 审阅代理只有读文件和只读 git 工具，没有 `edit`、`write`、`bash`。
- `verifier` 在 macOS/Linux 的 OS 沙箱里跑测试，禁网、不能写仓库。没有沙箱时会退到临时 git 工作区执行，并明确提示这种情况不算隔离验证。
- TLC 只能通过受限入口启动你配置的那个 jar，只接受仓库内的 `.tla`/`.cfg` 和白名单选项。

## 更多文档

- [形式化验证：安装 TLC、完成门、版本说明](docs/formal-verification.md)
- [开发、测试与发布](docs/development.md)
- [来源与固定版本](docs/sources.md)

## 许可证

[MIT](LICENSE)。pstack 原文版权归 Lauren Tan，许可证见 [LICENSES/pstack.txt](LICENSES/pstack.txt)，完整第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
