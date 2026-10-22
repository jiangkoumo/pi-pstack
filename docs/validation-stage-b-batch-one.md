# 阶段 B 第一批整合验收

上游固定 `eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10`（pstack 0.15.30），目标移植版 0.3.5；本记录不是发布声明。

用户批准顺序合并 #25 → #24 → #23；#24、#23 在最新 main 上 rebase 后分别执行 npm test，均为 33/33 检查通过（exit 0），随后 fast-forward 合并。未推送或发布、未删除 worktree/分支。#23 的生成 fidelity 报告在 rebase 前单独 stash 保存，#25 的同名报告仍在其 worktree 中，均未混入实现提交。

第一批实现包括 ketchup 与 TypeScript 上游同步、sharpen 四条路由和 TLC 受限执行模块。独立审阅发现 TLC 原先会把 exit 0 的违规/错误输出当成功，真实测试的模块名与文件名不匹配，且通过用例在终点死锁；修复提交已合入，复核确认修复。

主控接线：保留可信项目/用户 pstack.json 的 tla.tla2toolsJar 配置，角色 set/unset 不丢字段；/setup-pstack status 与 /poteto-mode status 显示 tlc；verification_exec 用 command="tlc" 加 spec/config/options 调用同一受限 runner。verifier 仍保持原工具白名单。缺 TLC 返回明确 warning 与真实代码生成式测试指引，不声称运行过 fallback 测试或形式化验证。

sharpen 的上游正文逐字保留。首次完整模型输出额外列出四问分析，故追加 Pi 输出约束：四问作为内部准备，仅返回重写 prompt；未改快照。ketchup 的七项待决事项夹具曾有一次漏编号，随后成功回复列齐七项；这说明模型输出有波动，单次成功不能证明所有输入。

## 本次实际验证

- `npm ci --include=dev` 实际安装成功；首次与 live routing 并行导致路由依赖暂时缺失，并且外层 90 秒超时，全量结果不计通过。后续依赖稳定后顺序重跑 `npm test`：exit 0，33/33 检查通过，64287ms。
- `node --test scripts/p2-runtime.test.mjs scripts/verification-exec.test.mjs scripts/verifier-child.test.mjs`：exit 0，50 tests，49 pass / 0 fail / 1 明确 skip（真实 TLC 缺 jar）。后续按受影响范围复查 `node --test scripts/p2-runtime.test.mjs scripts/verifier-child.test.mjs`：exit 0，14/14。前后台 child 均真实调用注册的 verification_exec 并收到缺 jar 告警和 fallback 指引；它们使用本地可控模型协议服务，不算真实 TLC 执行。
- `node scripts/routing.test.mjs --live --cases sk-sharpen-deepen,sk-sharpen-deepen-zh,sk-sharpen-prompt,sk-sharpen-rewrite`：exit 0，真实 magpie/opendesign/deepseek-v4.1-flash，4/4 命中；此检查只覆盖路由。
- `node scripts/check-stage-b-skills-live.mjs /tmp/pi-pstack-stage-b-skills-live.json`：追加输出适配后 exit 0，2/2。人工阅读完整回复确认 sharpen 无独立四问分析、只输出重写 prompt；ketchup 七项主题全部存在并附上下文。先前的编号必现断言过严，改按七项事项主题检查；未因回复省略编号而推断省略事项。原始成功回复见 [模型输出](validation-stage-b-skills-live.json)。
- `python3 tools/upstream-fidelity.py . --only sharpen --min-overall 0.95`：exit 0，8/8 upstream sentences，100%，新增 Pi 尾部不扣原文。
- `node scripts/generate-pi-resources.mjs --check`：exit 0，117 项、0 unmanaged；`git diff --check`：exit 0。
- 独立 reviewer 在 Herdr pane w1D:p1 完成整合 diff 只读复核，无阻断问题；空项目 tla 对用户 jar 的覆盖边界已改为字段合并并加入回归；check-package 明确要求 sharpen 原文作为前缀保留。schema 对 command=tlc 缺路径仍由 runtime 拒绝，无需扩大工具权限。

## 限制

本批最初无真实 TLC 运行（缺 jar）。用户随后授权搭建环境，已完成最小模型及前后台 verifier 真实 TLC 验收，见 [后续环境验收](validation-stage-b-tlc.md)；这不追溯改变上面历史检查的 skip 结果。阶段 B 整体 fidelity 尚不达标，三个新技能与文档同步留待后续批次；不作为本批已经通过的结果。
