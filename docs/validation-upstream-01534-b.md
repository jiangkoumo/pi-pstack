# statechart TypeScript 编译器适配与验收（#47）

来源：upstream cursor/plugins@519d36aa98955bf680db01bcde5fdfba686dc901 (v0.15.34)。
源码校验基线：`/tmp/pi-pstack-01534-source/pstack/skills/statechart/`（全部 407 个文件：31 个运行和文档文件、376 个测试语料）。

## 行为变化与上游 CLI 演进

1. **执行入口变更**：
   - 移除了旧版的 `from-spec`、`from-chart`、`render` 子命令以及 `--cover`、`--fixed`、`--against`、`--png` 选项。
   - 新版命令格式统一为：`node <package>/adapters/pi/statechart/entry.mjs SPEC.tla [--config FILE] [--view FILE] [--out DIR]`。
   - 映射模块由 `.map.mjs` 改为 `.view.mjs`，导出 `title`、`state(vars)`、`step(action, from, to)` 等。
2. **输出产物变更**：
   - 旧版 `summary.json` 被 `report.md` 和 `tlc.out` 取代。
   - Mermaid 图形直接输出为 `chart.mmd`。
3. **渲染架构变更**：
   - 移除了旧版内联生成的 `--png` 选项与 resvg-js 依赖。
   - 渲染由外部解耦工具链负责：使用 `pele@1.9.0`（遵循 `references/render.md` 规范）将 `.mmd` 渲染为深浅色自适应的主题化 SVG。

## Pi 适配设计

1. **`adapters/pi/statechart/entry.mjs`**：
   - 作为面向 Pi 的执行边界，支持 Node 22 原生 TypeScript 执行。
   - 处理 `--help` / `-h` 参数，输出正确的用法与 Pi 运行约束提示（退出码 0）。
   - 拦截已移除的旧版命令和参数（`from-spec`, `from-chart`, `render`, `--cover`, `--fixed`, `--against`, `--png`），输出明确的迁移指南并以退出码 2 退出。
   - 在主进程中向 `process.execArgv` 注入 `--import <hook.mjs>`，确保上游 `statechart.ts` 派生的独立后台 worker 进程（通过 `spawn(process.execPath, [...runtime, ...])`）自动继承该 hook。
   - 动态加载上游 `statechart.ts`。
2. **`adapters/pi/statechart/hook.mjs`**：
   - 利用 Node.js `registerHooks` 在 ESM 模块加载阶段拦截 `run.ts`。
   - 将上游 `run.ts` 中调用 `mise` 动态安装/查找 TLC 与 Java 的 `findTlc` 实现，严格替换为加载 Pi 本地适配器 `tlc-tools.mjs`。
   - **Fail-closed 保护**：通过 `assert.equal(source.split(resolver).length, 2)` 确保被替换函数模板在上游代码中严格存在一次。一旦上游代码发生变更，立即抛出 `AssertionError` 拒绝执行，防止意外调用未受控的外部工具。
3. **`adapters/pi/statechart/tlc-tools.mjs`**：
   - 仅使用操作者显式配置的工具路径（环境变量 `TLA2TOOLS`、`TLA2TOOLS_JAR`、`JAVA`）。
   - 绝不自动下载或安装 mise、TLC 或 Java。
   - 强制绝对路径校验，并在 `TLA2TOOLS` 与 `TLA2TOOLS_JAR` 不一致时明确报错拒绝。
4. **测试语料迁移**：
   - 将 `scripts/fixtures/statechart-sync/CoverGap.map.mjs` 重命名并改写为 `CoverGap.view.mjs`，导出 `title = 'Cover gap'` 和 `state = (v) => v.s`。

## 验证与检查结果

| 检查项 | 命令 / 依据 | 退出码 | 验证结果 |
| --- | --- | --- | --- |
| 单元测试：TLC 配置探测与 mise 阻断 | `node --test scripts/statechart-adapter.test.mjs` (test 1, 2) | 0 | 无环境变量时提示手动安装说明并报错；正确处理绝对路径和配置冲突；绝不调用 mise |
| Worker Hook 继承与阻断 | `node --test scripts/statechart-adapter.test.mjs` (test 3) | 0 | Worker 独立子进程继承 hook，捕获缺失配置并阻断 fake mise，未触发 mise 调用 |
| 帮助与弃用命令提示 | `node --test scripts/statechart-adapter.test.mjs` (test 4, 5) | 0 | `--help`/`-h` 输出完整用法；所有 7 种弃用命令/参数均返回退出码 2 并给出迁移提示 |
| Hook fail-closed 保护 | `node --test scripts/statechart-adapter.test.mjs` (test 6) | 0 | 模拟上游 `run.ts` 变更，加载器立即抛出 `AssertionError` 并中止（退出码 1） |
| 真实 TLC 1.8.0 跑通 CoverGap | `node --test scripts/statechart-adapter.test.mjs` (test 7) | 0 | TLC 运行成功，退出码 0；StatesKnown 成立；`report.md` 记录 4 states / 4 steps；`chart.mmd` 包含完整 4 个状态与 4 个迁移；`tlc.out` 确认 "No error has been found" |
| Pele 1.9.0 SVG 渲染验证 | `node --test scripts/statechart-adapter.test.mjs` (test 8) | 0 | `chart.mmd` 成功渲染为 `<svg class="pele pele-state">`，含完整节点类名与迁移 |
| 适配器测试套件完整运行 | `PSTACK_STATECHART_SOURCE_ROOT=/tmp/pi-pstack-01534-source/pstack/skills/statechart node --test scripts/statechart-adapter.test.mjs` | 0 | 9/9 测试通过（耗时 2.8s） |
| 同步测试回归 | `node --test scripts/statechart-sync.test.mjs` | 0 | 2/2 测试通过（CoverGap 端到端模型检查 + 弃用命令拦截） |
| SVG 冒烟脚本验证 | `node scripts/check-statechart-png.mjs` | 0 | 输出 `{"status":"passed","bytes":3984,"format":"svg","renderer":"pele@1.9.0","chartStates":4,"chartTransitions":4}` |
| 全局测试套件 | `npm test` | 0 | 全部 38 项测试计划检查通过（耗时 83.4s） |

## 交付产物清单

- `adapters/pi/statechart/entry.mjs`：对齐 0.15.34 的 Node/TypeScript 入口及 worker 参数注入
- `adapters/pi/statechart/hook.mjs`：Fail-closed 的 upstream run.ts 模块钩子
- `adapters/pi/statechart/tlc-tools.mjs`：严格免 mise 的本地 TLC/Java 探测器
- `scripts/fixtures/statechart-sync/CoverGap.view.mjs`：新版视图模块适配
- `scripts/statechart-adapter.test.mjs`：涵盖 worker hook、fail-closed、Pele 1.9.0 SVG 的 9 项测试
- `scripts/statechart-sync.test.mjs`：新版 CoverGap 端到端验证测试
- `scripts/check-statechart-png.mjs`：迁移至 Pele 1.9.0 SVG 的冒烟脚本
- `docs/validation-upstream-01534-b.md`：本验收审计报告
