# 0.3.2 集成验收（进行中）

基线：`8adf25a`（0.3.1）。本记录只将实际执行结果列为已验证，未完成项不能当作发布通过。

## 当前已执行

- 在主仓库修改 B6 回归测试后，`node --test --test-name-pattern="B6 mode status" scripts/p2-runtime.test.mjs` 退出码1：mode on 后实际 persistent=false，与期望 true 冲突。
- 修复 status 后，`node --test scripts/p2-runtime.test.mjs && git diff --check` 退出码0：8 pass、0 fail。覆盖无模式状态、on、立即status、off及首次assistant消息落盘后。
- 主仓库 `npm test` 退出码0：162 pass、0 fail，耗时62.2秒，自然退出。本机本次未重现复测报告的挂起；Issue #11 继续调查关闭顺序及timer泄漏回归。
- `npm install --package-lock-only --ignore-scripts --include=dev` 退出码0：119 packages，0 vulnerabilities。锁文件root版本0.3.1，119个package条目，resolved URL均为npm registry。干净clone验收尚待集成后执行。
- `npm ls @earendil-works/pi-coding-agent jiti --depth=0` 退出码0：Pi 1.3.0、jiti 2.7.0。jiti在0.3.1 package.json中已声明，不将其报告为新增依赖。

## 干净 clone 实测

主控提交 `4a700ba` 修复状态显示，`a8e21b7` 记录锁文件和CI调整。`npm run check:ci` 退出码0，总耗时103.6秒，检查对象为已提交的 `a8e21b7af4d8699e4ab25f8a1e602a4226a0c514`，新clone初始git status干净。

- `npm ci --include=dev && npm test`：exit0，合计63039ms（<180秒），自然退出；无挂起。
- `npm run check:generate`：exit0，117 checked、0 unmanaged。
- `npm run check:fidelity`：exit0，111 files、4222/4502=93.78054%、errors=[]。

这是本地干净clone证据，不是远端Actions。最终分支集成后必须重新执行。

## 已修改但尚待最终集成验收

- persistent按有效模式状态文件存在判断，而非首次聊天transcript是否创建；已持久化off也为true；旧分支entry+transcript仍兼容。
- 跟踪package-lock.json，更新AGENTS.md与.gitignore以支持操作者明确要求的npm ci。
- check/publish使用npm ci --include=dev；npm test设180秒超时。timeout失败不能当作自然退出验证。
- publish添加OIDC权限与npm11.5.1供Trusted Publishing使用；未配置或验收可信发布者，不能宣称可CI发布。
- check-ci-local改为clone已提交HEAD、npm ci+test总耗时<180秒，并检查生成与保真度；已在a8e21b7验证，尚待全部分支合并后重跑。

## 开发依赖实际执行

主控将pi-subagents@0.79.2固定为devDependency，保留用户安装时optional peerDependency。`npm install --save-dev --save-exact --include=dev pi-subagents@0.79.2` exit0，新增5 packages，审计124 packages，0 vulnerabilities。仓库本地依赖使隔离探针由skipped变passed，修正B2错误的“必须skip”假设。重新 `npm test && git diff --check` exit0，162/162，0 skipped，59.7秒。分支合并后仍需最终clone重跑。

## recall 入口修复

主控在before_agent_start对recall触发请求注入精确workspaceSessionDir路径和先读recall技能的要求，禁止列sessions根或依HOME换目录。新增B2行为回归在实现前exit1，实现后p2-runtime 9/9 exit0。主仓库 `npm test && git diff --check` exit0：163 tests、0 fail、0 skipped，61.6秒。真实路由仍保留子分支44/46记录，入口修复后尚未复测，不把提示注入当作模型遵循。

## 分支集成与生产入口验收

操作者批准后按 #11→#12→#13→#14→#15→#16 合并；第二个开始先rebase最新main并跑相关检查。集成基线bd7b1f8，后续共享接线由主控完成：publication gate在生产入口注册，verifier注册verification_exec，generator只对verifier允许该工具，check-package检查模板及生成资源引用，五项新增测试与两个生产host/child测试均进入npm test。

- 最新 `npm test && npm run check:generate && git diff --check`：exit0，216 tests、216 pass、0 fail、0 skipped，53.1秒；117 checked、0 unmanaged。
- `PSTACK_VERIFY_REQUIRE_SANDBOX=1 node --test scripts/verifier-child.test.mjs`：exit0，真实生产注册的detached pstack.verifier使用verification_exec执行fixture项目npm test，exit0；write与push请求均被拒；4个真实child provider请求。provider为本地确定性SSE，证明真实工具/子进程传输，不是live模型遵循测试。
- `node --test scripts/publication-host.test.mjs`：exit0，生产Pi入口真实拦截坏commit与坏PR请求，并创建唯一一个Conventional commit。没有创建外部PR。
- `npm run check:fidelity`：exit0，111文件，4229/4501=93.9569%，errors=[]。worktree-cleanup初始66.67%失败，恢复适用上游句式/简化内嵌调用后21/30=70%，无allow豁免。
- `node scripts/routing.test.mjs --live --cases sk-recall-last,sk-recall-prior ...`：首次集成运行1pass/1fail；last错误地把目录内下划线改成连字符。入口增加逐字复制精确路径后，last定向重放exit0/1pass，prior在前轮已通过。累计46项均有真实通过记录，但尚非单次全量46/46；最终全量正在执行。

CI增加macos verifier-sandbox任务并设置PSTACK_VERIFY_REQUIRE_SANDBOX=1，缺沙箱不能skip冒充通过；publish依赖此任务成功。Linux常规suite仍可明确skip未安装bwrap的沙箱用例，最终以独立macOS任务验证能力。

## 仍待完成

最终干净clone与远端CI、完整46路由结果、真实外部PR验收、所有最终证据归档、0.3.2版本与CI发布。swarm84.38%仍未达到90%；严格禁网下本库完整npm test无法在verifier沙箱执行（fixture项目npm test已验收）。

npm网页已登录。Trusted Publisher已填写为GitHub Actions、jiangkoumo/pi-pstack、publish.yml、Environment空，仅Allow npm publish；提交现停在Security key二次验证，TaskSpace54已handOff，连接尚未确认保存。禁止本机npm publish 0.3.2。最终CI和registry结果尚不存在。
