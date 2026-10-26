# statechart 同步验收（#40）

来源：仅 `pstack/skills/statechart/**` 同步到 cursor/plugins@076f4b2f57844ff9eb4ada914d4763884d40146e。其余来源仍是 `eb4db2b5`。本记录区分实际命令结果与未执行项目。

## 行为变化

- `--cover` 改为显式开关。默认 `from-spec` 输出完整图；`--cover` 在 `summary.json` 写 `cover.leftOutStates`、`cover.leftOutTransitions`、`cover.states`、`cover.transitions`，并打印裁掉的状态数与迁移数。
- 删除上游已移除的 `OutputFolder` 模型。旧验收记录被本文件取代。
- PNG 由 Pele 与 resvg 生成，依赖按需安装到用户缓存，不进入 npm 包。

## Pi 适配

- 执行入口：`adapters/pi/statechart/entry.mjs`。它用 Node `registerHooks` 保持快照与生成脚本逐字节一致，只替换运行时行为。
- TLC：只接受显式 `TLA2TOOLS`/`TLA2TOOLS_JAR`/`JAVA`，或已经由操作者安装的 mise 工具；从不执行 `mise install`。缺少时给出安装命令并停止。`TLA2TOOLS` 与 `TLA2TOOLS_JAR` 冲突会被拒绝。
- 受限 `verification_exec` 的 TLC 入口和探测未改动。
- PNG：渲染器不可用时保留 `.mmd` 并提示；显式 `render` 子命令仍要求 PNG。部分渲染失败不再把已有的模型检查结果报成失败。

以上差异记录在 `docs/port-map.json` 的 `runtimeAdapters`，原因写在同一条目。

## 检查

| 命令 | 结果 |
| --- | --- |
| 27 个上游文件的 Git blob 对比 `076f4b2f` | 全部一致，0 mismatch；与 #41 worktree 的 `upstream/pstack/skills/statechart` 和 `skills/statechart/scripts` 均无差异 |
| `npm test` | 退出码 0，38/38 检查通过，71.0 秒；`statechart.test.mjs` 5.1 秒，50 pass / 100 skip（PNG 用例在无渲染缓存下显式跳过） |
| `npm run check:generate` | 退出码 0，146 项资源，0 unmanaged |
| `npm run check:fidelity` | 退出码 0，114 个文件，overall 94.04%，0 errors |
| CoverGap 默认回归 | 退出码 0；4 states / 4 transitions，含 `s3 --> s0`，无 `summary.cover` |
| CoverGap `--cover` 回归 | 退出码 0；`summary.cover` 为 drawn、4 states、4 transitions、空 leftOutStates、1 条 leftOutTransitions；CLI 打印裁掉 0 of 4 states 和 1 of 4 transitions |
| 旧 raw CLI 修前复现 | `PSTACK_STATECHART_SCRIPT=skills/statechart/scripts/statechart.mjs node --test scripts/statechart-sync.test.mjs` 退出码 1，0 pass / 2 fail；默认只有 3 transitions，`--cover` 返回 unknown argument |
| `npm run check:statechart:png`（macOS，Node 22.22.2，真实 TLC 1.8.0） | 退出码 0；PNG 70887 字节，666×1182，chart 4 states / 4 transitions |
| `verification_exec` TLC 回归 | `npm test` 中 `verification-exec.test.mjs` 通过；受限入口未改动 |

## 未验证与限制

- Node 24、Linux 的真实 `--png` 未在本机执行；新增 `.github/workflows/statechart-compat.yml` 覆盖 Node 22/24 × Ubuntu/macOS，但没有 dispatch，不能把该矩阵写成已通过。
- 上游测试在模块顶层调用 `loadRenderer()`，缓存为空时会执行 `npm install`。默认 `npm test` 用 `scripts/fixtures/statechart-no-renderer/` 作为 `XDG_CACHE_HOME`，让 PNG 用例显式跳过；真实渲染由 `npm run check:statechart:png` 单独验收，不把跳过当 PNG 通过。
- Pele/resvg 安装在用户缓存，不在 npm 包内，与上游做法一致。
