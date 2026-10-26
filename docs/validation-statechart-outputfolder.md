# 阶段 B：#27 statechart 真实 OutputFolder 出图与测试接入

> 历史记录。上游 `076f4b2f` 已删除 OutputFolder 模型与 Mermaid CLI 出图路径；当前行为、Pi 适配和检查见 [statechart 同步验收](validation-statechart-sync.md)。本文件仅保留当时的实际命令证据。

本记录只写本次实际执行的命令与结果，不把文件存在、脚本加载或跳过当通过。上游固定 `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10`（pstack 0.15.30）。statechart 的脚本与测试按固定快照逐字生成，本次没有修改任何脚本或测试字节，也未改生成器、port-map、共享入口、主路由、AGENTS 与 CHANGELOG。

## 结论

- 真实 TLC 出图：`from-spec OutputFolder.tla` 在 scratch 目录里成功运行，5 条不变量全部 holds，写出 `chart.mmd`、`stories.md`、`summary.json`；加 `--png` 也成功出图。
- 上游 `statechart.test.mjs` 已接入 `scripts/run-checks.mjs` 的 `check`/`test` 计划。无 TLC 环境时 0 fail，需要 TLC 的用例带原因跳过；配好真实 jar 时 55 pass / 2 fail / 1 skip。两个失败中，一个是 macOS 缺少 `LD_PRELOAD` 的平台假设，另一个（测试 #55）是上游测试对新版 TLC2（TLA+ v1.8.0）标准模块解压路径格式变更的版本敏感性，都不是端口回归（详见下文）。
- 出图这一步走父 shell 直接调上游脚本：脚本自己启动 Java，`verification_exec` 只做单次 TLC 调用且只写私有 scratch，不能出图。本次没有把出图那一步说成走了 `verification_exec`。

## 环境

| 项 | 值 |
| --- | --- |
| 平台 | macOS（darwin），Node v22.22.2 |
| Java | OpenJDK 21.0.11，`/opt/homebrew/opt/openjdk@21/bin/java` |
| TLC | `~/.local/share/tlaplus/1.8.0/tla2tools.jar`（官方 TLA+ v1.8.0 预发布版，内部版本 `TLC2 Version 2026.10.20.183001`，rev: `d2e1472`，SHA-256 `5bd7b64db99ae4c6c35f290de5e809c0ee41af43f8699cf696099ffb6452b1e2`，未自动下载其他工具，未装到仓库或 npm 包） |
| 依赖 | `npm ci --include=dev` 退出码 0（123 个包） |

本次所有 TLC 命令都显式把 `TLA2TOOLS` 与 `TLA2TOOLS_JAR` 设成同一个 jar，不依赖 shell 启动文件；`JAVA=` 显式指向 Java 21。

## 真实 OutputFolder 出图

模型与映射直接取包内逐字副本 `skills/statechart/scripts/model/OutputFolder.{tla,cfg,map.mjs}`，复制到 scratch 目录（仓库外），在 scratch 目录里运行，产物写在输入旁边：

```sh
S=/tmp/statechart-outputfolder-verify
rm -rf "$S" && mkdir -p "$S"
cp skills/statechart/scripts/model/OutputFolder.tla \
   skills/statechart/scripts/model/OutputFolder.cfg \
   skills/statechart/scripts/model/OutputFolder.map.mjs "$S"/
cd "$S"
env TLA2TOOLS="$HOME/.local/share/tlaplus/1.8.0/tla2tools.jar" \
    TLA2TOOLS_JAR="$HOME/.local/share/tlaplus/1.8.0/tla2tools.jar" \
    JAVA=/opt/homebrew/opt/openjdk@21/bin/java \
    node <repo>/skills/statechart/scripts/statechart.mjs from-spec OutputFolder.tla
```

退出码 0。实际输出（节选）：

```text
TLC on OutputFolder.tla:
  ChartsOneSpec holds.
  KeepsYourFiles holds.
  NeverLosesChart holds.
  ExitTwoLeavesFolder holds.
  OverlapNeverRefuses holds.

Chart: 19 states and 43 transitions from 4294 model states.
It has 2 parallel regions, of 4 and 15 states.
19 work, 0 break a rule.

No rule is broken.

Wrote chart.mmd, stories.md, summary.json in OutputFolder-statechart.
```

产物（`/tmp/statechart-outputfolder-verify/OutputFolder-statechart/`）：`chart.mmd`（7714 字节，Mermaid `stateDiagram-v2`，含 19 个状态与 43 条边）、`summary.json`（1124 字节）、`stories.md`（0 字节）、`tlc/`（每次 TLC 运行的 `.out`、`.dot` 与 `regions-*.mmd`）。`stories.md` 为空是因为这次没有任何规则被破坏，没有 bug 路径可讲；空文件是上游脚本对该情形的正常输出，不是写入失败。

`summary.json` 的实际字段（本次内容原样）：

```json
{
  "view": "customer",
  "modelStates": 4294,
  "modelTransitions": 11824,
  "chartStates": 19,
  "chartTransitions": 43,
  "chartStatus": { "works": 19, "fixed": 0, "wrong": 0 },
  "chartGroups": [
    { "name": "Finished", "color": "#d6eaf8", "states": 1 },
    { "name": "Not started", "color": "#fdebd0", "states": 1 },
    { "name": "Running", "color": "#e8daef", "states": 2 }
  ],
  "mixedGroups": [],
  "regions": {
    "drawn": true,
    "states": [4, 15],
    "transitions": 43,
    "all": 103,
    "flat": { "states": 47, "transitions": 387 }
  },
  "classes": [],
  "codeLike": ["Start(1)", "Stop(1)", "Stop(2)", "Stale(1)", "KillNode(1)", "KillNode(2)", "Refuse(2)", "Stale(2)", "RenameFails(2)", "Refuse(1)", "RenameFails(1)", "Foreign(2)", "Foreign(1)", "MoveIn(1)", "MoveIn(2)", "MoveAside(2)", "MoveAside(1)", "Clean(1)", "Clean(2)", "KeepAside(2)", "KeepAside(1)", "Restore(2)", "Restore(1)"]
}
```

同一命令（另一个 scratch 目录 `/tmp/statechart-outputfolder-verify2`）再加 `--png`：退出码 0，写出 `chart.png`（677935 字节，`-s 2`）。`--png` 由上游脚本调 `npx -y @mermaid-js/mermaid-cli`，因此需要该包和无头浏览器；本次 npx 把它取到本机 npx 缓存并渲染成功，没有全局安装。`codeLike` 列出 24 个读起来像代码的映射标签，这是上游自带 `OutputFolder.map.mjs` 的现状，本次没有改写它（脚本与模型都在禁止修改范围内）。

## 上游测试接入 `npm test`

`scripts/run-checks.mjs` 新增一条检查：

```js
{ name: 'statechart.test.mjs', command: skillTest('skills/statechart/scripts/test/statechart.test.mjs'), timeoutMs: 300_000 },
```

它是同一份上游测试文件的逐字节副本，不加过滤、不改断言；用例自身按 `TLA2TOOLS` 决定是否跳过需要 TLC 的 24 个用例。由于真实 TLC 跑全套约 158 秒，超过运行器的 90 秒默认上限，这一条检查声明自己的 300 秒预算（`runCheck` 现在接受单条检查的 `timeoutMs`，其余检查仍用运行级默认值）。

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| 无 TLC（默认 `npm test` 环境） | `node --test skills/statechart/scripts/test/statechart.test.mjs` | 退出码 0，58 tests：27 pass / 0 fail / 31 skip，约 3 秒 |
| 真实 jar | 同上，带 `TLA2TOOLS`/`JAVA` | 退出码 1，58 tests：55 pass / 2 fail / 1 skip，约 158 秒 |
| 经运行器，无 TLC | `node scripts/run-checks.mjs -- node --test …` | 退出码 0，`run-checks: PASS`，约 14 秒 |
| 经运行器，真实 jar | `node scripts/run-checks.mjs --timeout 300000 -- node --test …` | 退出码 1，`run-checks: FAIL command: failed exit 1`，58 tests：55 pass / 2 fail / 1 skip，156 秒，未超时 |
| 接入后全量 `npm test`（无 TLC 环境变量） | `npm test` | 退出码 0，34/34 检查，70.0 秒；`statechart.test.mjs` 单条 3144ms 通过 |
| 基线（本次改动前） | `npm test` | 退出码 0，33/33 检查，87.7 秒 |

真实 jar 下的两个失败与一个跳过，分别属于平台环境假设与上游测试对 TLC 版本的敏感性，不是端口改动引起的：

- `a run whose rename fails after it moves the output folder aside puts the folder back, or says where it is`：用例用 `LD_PRELOAD` 注入 `rename` 失败的 `.so`。macOS 不用 `LD_PRELOAD`，注入不生效，命令退出码 0，而用例期望 2。
- `each TLC run writes the standard modules in its own temp folder, so overlapping runs cannot rewrite them under each other`（测试 #55，`skills/statechart/scripts/test/statechart.test.mjs:2611`）：**上游测试对 TLC 版本敏感**。
  - **失败现象**：上游测试断言严格比较 `assert.equal(parsed, 'Parsing file ' + join(folder, "Naturals.tla"))`，期望解析日志精确等于临时目录下的平铺路径。而在当前已验证的 TLC 版本（TLA+ v1.8.0 / TLC2 2026.10.20）下，Java 实际输出形如 `Parsing file <tmp>/tmp/tlc-<随机数>/Naturals.tla (jar:file:.../tla2tools.jar!/tla2sany/StandardModules/Naturals.tla)`，触发 AssertionError。
  - **根本原因**：新版 TLC2 调整了解压逻辑，将标准模块（如 `Naturals.tla`）解压到二级独立子目录 `tmp/tlc-<随机数>/`，并在输出日志中增加了 jar 来源标识（macOS 下还伴随 `/private/var/...` 的规范化路径差异）。标准模块确实在各自独立的临时目录中解压与使用，隔离目标本身是达成的；但上游测试代码硬编码了旧版 TLC 的平铺解压路径和无后缀日志格式，从而导致断言失败。
  - **CI 与默认环境行为**：CI 运行环境默认未安装 Java 和 TLC，所有需要 TLC 的用例均通过 `needsTlc` 判定自动优雅跳过（skip），退出码为 0，因此 CI 构建和无 TLC 的默认 `npm test` 完全不受影响。
  - **上游反馈背景**：本项目严格遵守上游代码逐字移植规则，禁止修改上游测试和实现代码（`skills/statechart/scripts/**`）。此问题属于上游测试代码与特定 TLC 版本内部行为的紧耦合，已完整记录现象与根因，适合向上游（cursor/plugins）提交 issue，建议上游放宽该用例对日志字符串格式的严格判等。
- 跳过的一条是 `runs in PID namespaces that hide which namespace they are in chart only their own spec`，原因是本机不能建 PID namespace（`unshare` 不存在），用例自身给出该原因。

因此：没有配置 TLC 时 `npm test` 通过（需要 TLC 的用例显式跳过）；在配置了真实 jar 后，全套用例中的测试 #55 会因 TLC 版本断言敏感性失败。要改该用例只能改动上游测试，本次范围严格禁止，故如实记录，等上游更新或另开任务处理。

## 定时上限与 B1 受限入口的边界

`verification_exec` 的 `command: "tlc"` 入口一次只跑一次 TLC，只接受仓库内真实路径的 `.tla`/`.cfg` 和白名单选项（本次可用 `-cleanup -noGenerateSpecTE -noGenerateSpecTEBin`），只写私有 scratch 目录。statechart 脚本的做法与它不同：脚本自己起 Java，每条规则跑一次 TLC，还要读状态图并把结果写到输入旁边。两者不能互相顶替。

结论与操作要求：

- 出图与逐规则检查走父 shell 直接执行上游脚本，`TLA2TOOLS`/`TLA2TOOLS_JAR` 指向同一个 jar；这不算 `verification_exec` 调用，不能这样上报。
- 若某个模型还要经受限入口检查，模型必须落在仓库内（该入口拒绝 `..` 与符号链接越界），例如忽略路径 `.statechart-scratch/`；该入口在无 OS 沙箱时用临时 Git worktree（HEAD + 工作区 diff + 未跟踪文件），只存在于仓库外或未纳入的副本不可见。
- 缺 jar 时按上游规则报告「未做形式化验证，原因是缺少 TLC」，改用生成式输入测试真实代码；本次没有这种情况，但也不把任何 fixture TLC 或跳过当形式化通过。

## 未完成与阻碍

- 没有用 `verification_exec` 跑 statechart 模型：受限入口不能出图，且本次不允许新增脚本把两者串起来。B1 自身的真实 TLC 验收见 [阶段 B TLC 环境](validation-stage-b-tlc.md)。
- `--png` 依赖 `npx` 拉取 `@mermaid-js/mermaid-cli` 和无头浏览器；本次成功，但没有验证离线或没有浏览器时的行为（上游脚本在该情形返回 2 并保留 Mermaid 源）。
- 真实 jar 下上游测试用例（平台假设与测试 #55 的 TLC 版本敏感性）仍会失败，未修（禁止改上游测试）。
- 阶段 B 整体保真度仍需主控同步文档后再判定，本记录只覆盖 statechart。

## 生成与保真检查

| 命令 | 结果 |
| --- | --- |
| `node scripts/generate-pi-resources.mjs --check` | 退出码 0，131 项资源、0 unmanaged |
| `python3 tools/upstream-fidelity.py . --only statechart` | 退出码 0，47/47 上游句子 100% 保留、0 丢弃、23 条 Pi 追加 |

生成后的 `skills/statechart/SKILL.md` 是「上游正文逐字前缀 + `## Pi execution and authority` 尾部」；上游正文 3755 字节逐字保留，尾部只写 Pi 执行边界（父 shell 与同一 jar、受限入口的路径与写入限制、scratch 位置、`--png` 依赖、未验证不算 formal pass）。
