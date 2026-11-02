# U36 集成记录

上游固定到 `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`（pstack 0.15.36）。六个已审阅分支按 U36-1 至 U36-6 顺序以 `--no-ff` 合并，无冲突。当前固定来源见 [sources.md](sources.md)，历史映射见 [删除记录](validation-upstream-01536-removed.json)，原计划见 [实施记录](validation-upstream-01536-plan.md)。

## 完整删除清单

下列 17 个路径已删除；用代码路径保留历史，不建立指向不存在文件的链接。

- `adapters/pi/overrides/skills/interrogate/references/code-quality-review.md.template`
- `adapters/pi/overrides/skills/interrogate/references/lead-judgment.md.template`
- `adapters/pi/overrides/skills/interrogate/references/reviewer-prompt.md.template`
- `adapters/pi/overrides/skills/interrogate/references/rubric.md.template`
- `scripts/orch.mjs`
- `scripts/orch.test.mjs`
- `skills/interrogate/references/code-quality-review.md`
- `skills/interrogate/references/lead-judgment.md`
- `skills/interrogate/references/reviewer-prompt.md`
- `skills/interrogate/references/rubric.md`
- `upstream/pstack/skills/interrogate/references/code-quality-review.md`
- `upstream/pstack/skills/interrogate/references/lead-judgment.md`
- `upstream/pstack/skills/interrogate/references/reviewer-prompt.md`
- `upstream/pstack/skills/interrogate/references/rubric.md`
- `upstream/pstack/skills/poteto-mode/scripts/orch/orch.test.ts`
- `upstream/pstack/skills/poteto-mode/scripts/orch/orch.ts`
- `upstream/pstack/skills/poteto-mode/scripts/orch/store.ts`

## 实际集成检查

在不含宿主预存未跟踪技能的本地验收副本中执行，源文件与生成产物均与集成分支核对一致。

| 检查 | 退出码 | 结果 |
| --- | --- | --- |
| `npm ci --include=dev` | 0 | 安装 127 个包，审计 128 个包 |
| `npm run generate` | 0 | 523 个受管资源 |
| `npm test` | 0 | 37/37 检查通过，0 失败、0 超时；TAP 452 项，447 通过、5 因缺少真实 TLC jar 跳过 |
| `npm run check:generate` | 0 | checked=523，unmanaged=0 |
| `node scripts/upstream-manifest.mjs --check --root .` | 0 | 941 项 sha256 通过 |
| `npm run check:fidelity` | 0 | 145 文件，4459/4720 = 94.4703%，errors=[] |
| Pi grep 旧资源引用检查 | 只读检查 | 排除 upstream 与历史 issues/validation 后，0 匹配 |
| `git diff --check` | 0 | 无空白错误 |

首次保真度检查整体为 94.4068%，但 poteto-mode 与 reflect 的丢句计数触发失败。补回上游 fast mode、角色默认值与缓存目录的三句规则，保留 Pi 授权约束后通过；没有新增保真度豁免。Orchestrate 的旧豁免已删除。

## 验收范围

本次集成复核包检查、生成漂移、固定来源、真实 Git 临时仓库、Pi 注册工具 schema 与现有宿主夹具。未新增真实在线模型扇出、多日 PR 编排或字幕视频完整渲染验收；真实 TLC 用例依赖可用 jar。操作者任务目录中的 U36-MERGE-RESULTS.md 记录本次实际命令、数字与最终提交。
