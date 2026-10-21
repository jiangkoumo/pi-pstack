# 0.3.2 集成验收（进行中）

基线：`8adf25a`（0.3.1）。本记录只将实际执行结果列为已验证，未完成项不能当作发布通过。

## 当前已执行

- 在主仓库修改 B6 回归测试后，`node --test --test-name-pattern="B6 mode status" scripts/p2-runtime.test.mjs` 退出码1：mode on 后实际 persistent=false，与期望 true 冲突。
- 修复 status 后，`node --test scripts/p2-runtime.test.mjs && git diff --check` 退出码0：8 pass、0 fail。覆盖无模式状态、on、立即status、off及首次assistant消息落盘后。
- 主仓库 `npm test` 退出码0：162 pass、0 fail，耗时62.2秒，自然退出。本机本次未重现复测报告的挂起；Issue #11 继续调查关闭顺序及timer泄漏回归。
- `npm install --package-lock-only --ignore-scripts --include=dev` 退出码0：119 packages，0 vulnerabilities。锁文件root版本0.3.1，119个package条目，resolved URL均为npm registry。干净clone验收尚待集成后执行。
- `npm ls @earendil-works/pi-coding-agent jiti --depth=0` 退出码0：Pi 1.3.0、jiti 2.7.0。jiti在0.3.1 package.json中已声明，不将其报告为新增依赖。

## 已修改但尚待验收

- persistent按有效模式状态文件存在判断，而非首次聊天transcript是否创建；已持久化off也为true；旧分支entry+transcript仍兼容。
- 跟踪package-lock.json，更新AGENTS.md与.gitignore以支持操作者明确要求的npm ci。
- check/publish使用npm ci --include=dev；npm test设180秒超时。timeout失败不能当作自然退出验证。
- publish添加OIDC权限与npm11.5.1供Trusted Publishing使用；未配置或验收可信发布者，不能宣称可CI发布。
- check-ci-local改为clone已提交HEAD、npm ci+test总耗时<180秒，并检查生成与保真度；尚未执行最终版本。

## 仍待完成

Issues #11–#16分支产物、独立审阅与用户批准合并，扩展机械门禁/验证工具真实接线、真实PR验收、46项真实路由验收、两脚本transcript证据、保真度报告、Changelog与0.3.2版本。

npm网页当前未登录，浏览器TaskSpace54已handOff；Trusted Publishing配置需登录后继续。禁止本机npm publish 0.3.2。最终CI和registry结果尚不存在。
