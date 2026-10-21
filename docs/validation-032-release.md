# 0.3.2 集成验收与 CI 发布结果

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

## 最终集成证据

- 67f5f88干净clone `npm run check:ci` exit0：npm ci --include=dev && npm test合计60409ms，216/216，0skip；117资源同步，fidelity93.9569%。
- 远端 [check run 39607077699](https://github.com/jiangkoumo/pi-pstack/actions/runs/39607077699) success；Linux check与macOS verifier-sandbox均success。不是本机fixture冒充远端CI。
- 集成全量live路由44/46、exit1；失败trace-forensics/how。保持原request，补明确触发后只重放两项，2/2、exit0。当前46项均有真实通过证据；单次全量仍44/46。逐项记录在 [routing results](validation-032-routing-results.json)。
- 独立审阅发现普通fix recall请求被过宽regex触发，已缩小为活动回忆意图；p2-runtime10/10、exit0。

## 0.3.2 已由 CI 发布

- 发布提交 `fcdb2559aa63eb0a33ff4770f92f6bd712226a2c`，tag `v0.3.2`。版本更新后实际重跑 npm test、生成检查、fidelity 和 git diff --check，exit0，217/217、0fail、0skip；117 checked；93.9569%。
- [publish run 39616344623](https://github.com/jiangkoumo/pi-pstack/actions/runs/39616344623)：success，verifier-sandbox 与 publish 均完成。发布日志 `2026-10-21T14:24:45Z + @jiangkoumo/pi-pstack@0.3.2`，不是已存在版本的跳过。
- [tag check run 39616344548](https://github.com/jiangkoumo/pi-pstack/actions/runs/39616344548)：success。main发布提交check run39609642773亦success。
- `npm view @jiangkoumo/pi-pstack@0.3.2 version dist-tags dist.integrity --json --prefer-online` exit0：version0.3.2、latest0.3.2，registry integrity `sha512-XpyhuFGzhicQnxOmOOC1Tld2mPLCuqX5Ms4kLkwtxZjqCFzvdMFirEZ7USGT3NIynOEnmSl7qN1RDvM6pVk/Zg==`。
- 操作者要求本地认证后，将本机已验证npm凭据经标准输入配置为GitHub仓库NPM_TOKEN secret，未将值打印或提交。本轮CI使用该secret发布，没有执行本机npm publish。Trusted Publisher网页安全密钥流程未完成，不作为发布依据；后续可复用secret，无需每次网页登录。

## 仍未完成与限制

真实外部合规PR验收仍未执行；swarm84.38%仍未达到90%；单次全量live路由44/46、原请求修复重放2/2，不能宣称一次46/46。严格禁网下本库完整npm test无法在verifier沙箱执行（fixture项目npm test已验收）。上述缺口不因已发布而消失。
