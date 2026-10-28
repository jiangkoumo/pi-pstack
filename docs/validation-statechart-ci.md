# statechart 干净环境与 CI 修复

## 问题与修复

提交 `5022d21` 的 check（run 40652477181）与 statechart-compat（run 40652477158）失败。此前只合入了新版适配入口，包内仍是旧版 JavaScript 脚本；测试会自动选用本机 `/tmp/pi-pstack-01534-source`，所以本机通过没有证明干净 checkout 可运行。此前声称集成完成的结论被这次 CI 失败否定。

本次将 `pstack/skills/statechart/**` 的 407 份固定源码、测试驱动和 corpus 纳入 upstream 指纹归档及生成清单，并纳入 render.md。删除清单中的旧版快照与输出；上游原文保持字节一致。三份 JSON 清单保留其余原文的旧基线，statechart 与新增 ketchup-video 显式 pin 到 `519d36aa98955bf680db01bcde5fdfba686dc901`，不宣称全包升级。

适配器测试、CoverGap 回归与 SVG 冒烟脚本默认执行包内快照，不再自动使用临时源码。真实 TLC 测试仅使用操作者显式配置的 jar/Java，不猜测本机路径。生成测试检查编译器入口、关键模块、INSTANCE 与图测试语料、SVG 指南均有清单归属并与归档一致。普通 npm test 运行新版 chart 测试；兼容性 CI 在 Ubuntu/macOS × Node 22/24 配置真实 TLC 并运行适配器、CoverGap 与 SVG。

## 验证状态

本次修复期间已执行：

- 包内新版 `chart.test.ts`：50 pass / 0 fail / 0 skip。
- 包内 `pipeline.test.ts`：10 pass / 0 fail / 0 skip。
- `npm run check:generate`：退出 0，527 项资源，unmanaged 0。
- `npm run check:fidelity`：退出 0，4755/5039 = 94.36396%，errors 为空。
- 最终补充后的 `env -u PSTACK_STATECHART_SOURCE_ROOT -u TLA2TOOLS -u TLA2TOOLS_JAR -u JAVA npm test`：退出 0，447 pass / 0 fail / 5 skip。
- `node --test scripts/generation.test.mjs`：退出 0，36 pass / 0 fail / 0 skip。
- 不配置临时源码、显式配置 TLC 1.8.0 与 Java 21 的 adapter/sync 回归：退出 0，11 pass / 0 fail / 0 skip。
- 相同工具配置下 `STATECHART_SVG_REQUIRE=1 node scripts/check-statechart-png.mjs`：退出 0，真实 SVG 3984 字节。
- T3 Code 的 Pi / 永不卡住独立只读审阅：PASS，逐项核实 407 份固定 blob；生成检查 527、生成回归 36 pass、chart/pipeline/adapter/sync 联合测试 69 pass / 0 fail / 2 skip；打包预览无 statechart 缺项。其 skip 是未配置 jar，不计为真实 TLC 通过。

待完成：提交后的干净 clone npm ci/npm test、推送与新 CI 的实际结果。远端 job 未完成前不能声称 CI 已恢复。

## 边界

本次解决干净环境缺快照及隐式使用临时文件的问题。不是全量原文同步；新的模型会话遵循性、完整 PROPERTY/状态预算/取消矩阵与视频端到端验收未由本记录补足。原 Task B 记录中的测试通过不代表这些范围已经全部验收。
