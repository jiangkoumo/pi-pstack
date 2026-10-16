## Review

审阅对象：本轮的 P1 增量（`docs/skill-audit.md`、`docs/port-map.json`、三个 `scripts/check-*.mjs`、`docs/validation-p1.md`、`docs/port-status.md`、`docs/migration-plan.md`、`README.md`、`package.json`）。只读，未修改任何文件。

### 执行能力说明（影响证据强度）
我的工具集只有 read/grep/find/ls/watchdog_diff，**没有 bash/shell 工具**，因此本轮无法独立执行 `npm run check`、`npm run check:correct`、`npm run check:pi`、`npm run check:pi:commands`、`npm pack --dry-run`。下面的量化结论来自“脚本源码 + 目录/文件清单”的确定性推算（I 已给出可证伪的预期值），需由主代理实跑确认。仓库仍无提交、全为 untracked，我未按“空 diff”处理。

- Correct（已核实的部分）
  - 审计与映射一一对应、计数自洽：我逐块枚举了 `docs/skill-audit.md` 的表格（`:21-34` 14 行、`:40-45` 6 行、`:51-60` 10 行、`:66-117` 52 行 = 82），与 `docs/port-map.json` 的 `ported=14 / substitute=6 / deferred=62（P3=10，P5=52）` 完全一致；抽查了 `correct/poteto-mode/tdd/8 原则/3 playbook`（ported）、`setup-pstack(P2)/how(P3)/其余 substitute(P5)`、`comment-sicko/poteto-agent(P3)` 的 `disposition/phase/destination/reason`，逐条与审计表相同。没有发现把 deferred 说成已实现、或把 ported 降级表述的条目。
  - substitute 的依据有文件支撑：`docs/skill-audit.md:45` 称 `principle-prove-it-works` “现保留本地证据记录”，对应 `skills/principle-prove-it-works/SKILL.md` 的 “Keep a local evidence record…” 与 “## Script the check when you can”；`:41` 称 investigation 已内嵌 how 的输出结构，对应 `skills/poteto-mode/playbooks/investigation.md` 第 4 步（overview/concepts/flow/source locations/gotchas/recommendation）。
  - `check-package.mjs` 的结构性断言没有空转：`:22-35` 强制 `entries.map(source)` 精确等于 `upstream-inventory` 的 skills+playbooks+agents、`tally.ported===14`、ported 必须有 `destination` 且 `phase==='P1'` 且原文在 `source-files.json`（我核对 `docs/source-files.json` 恰为 LICENSE+11 技能+3 playbook = 15 条），非 ported 必须 `destination===null`；`unchangedBodies` 查表未命中会得到 `undefined` 从而失败，不会假过。
  - `check-correct-acceptance.mjs` 的反例设计是站得住的：`:52` 建立在真实（临时）git 仓库上，`:70-71` 用“失败必须命中契约消息 /Reject invalid quantity/”挡住了“模块不存在/导入错误被当成契约失败”的假通过（`ERR_MODULE_NOT_FOUND` 不会匹配该消息），`:90` 用 `code===2 && out==='RangeError'` 挡住重放时的导入失败。`correct` 的两条约束与 `validation-p1.md:44-48` 描述一致。
  - `package.json`：`:4` `private:true`（并被 `check-package.mjs:21` 断言）；`files` 已含 `docs/`、`AGENTS.md`，README 的本地链接全部落在已发布集合内；文档引用的 `scripts/fixtures/engineering`、`engineering-accepted`（各 7 个文件）与 `scripts/fixtures/empty-agent/.gitkeep` 均存在。

- Finding: P1 — 记录中的 `npm run check` / `npm pack` 输出早于本轮的 `docs/skill-audit.md`，与当前工作树不一致
  位置：`docs/validation-p1.md:52`（“本批最终实际执行”）、`:56`（`"documents":22,"localLinks":69`）、`:68`（“46 个文件”）。
  机制：`scripts/check-package.mjs:64-66` 统计 `documents` = walk(skills) 的 `.md` + walk(docs) 的 `.md` + README + THIRD_PARTY_NOTICES。当前 `skills/` 有 14 个 `.md`，`docs/` 有 7 个 `.md`（新增的 `skill-audit.md`），故应为 **documents=23**；`docs/skill-audit.md:3` 恰有 1 条本地链接（`port-map.json`），故应为 **localLinks=70**。打包数：`package.json:15-21` 匹配 45 个文件 + npm 自动包含的 `package.json`、`README.md` = **47**。三个数字一致地比记录多 1（22→23、69→70、46→47），且“少 1”正好等于本轮新增的 `docs/skill-audit.md`（docs 由 4 json + 6 md 变为 4 json + 7 md）。即：该输出块是一个不含 `skill-audit.md` 的旧快照，却被标为“本批最终实际执行”。
  最小修复：重跑 `npm run check` 与 `npm pack --dry-run --json` 并原样替换 `:54-69` 的输出块（预期 `documents:23`、`localLinks:70`、47 个文件）；若确实无法重跑，则把该段标注为“上一快照”。需主代理实跑确认：`npm run check`（预期退出码 0、`"documents":23,"localLinks":70`）。

- Finding: P1 — “发布链接覆盖断言”对已发布文档内的链接恒真，已存在一条未被发现的发布死链
  位置：`scripts/check-package.mjs:92`（`assert(included(target) || included(relative(root, file)), …)`），以及 `scripts/check-package.mjs:85`（`assert(included('README.md') || true, …)`）；漏报对象 `docs/integration-decisions.md:100` → `../scripts/check-subagent-integration.mjs`。
  机制：`docs/` 在 `package.json:17` 被发布，因此任一来自 `docs/*.md` 的链接都会命中 `included(relative(root, file))`（`docs/xxx.md`.startsWith('docs/')），使 `:92` 的断言无条件为真；也就是说该断言实际只对 README.md 生效（README 不在 `files` 中，其分支为 false）。而 `docs/integration-decisions.md:100` 链接到 `scripts/check-subagent-integration.mjs`，`scripts/` 未列入 `package.json:15-21`，这正是断言声称要拦下的“Published doc links an omitted file”，却因该 `||` 分支被放过（第一段循环只做 `stat`，文件存在所以不报错）。`:85` 的 `|| true` 是恒真断言，等于没有检查。`docs/validation-p1.md:114,116` 声称已“新增发布链接覆盖断言”并用真实反例验证过——反例只覆盖了 README（删除 `docs/` 时 README 的链接失败），未覆盖 docs 内部链接。
  最小修复：删除 `:92` 的 `|| included(relative(root, file))` 分支，删除 `:85` 的 `|| true`；随之必须把 `scripts/` 加入 `package.json.files`，或把该链接改成不发布脚本的写法（例如改为纯文本引用）。修好后 `npm run check` 应报 `Published doc links an omitted file: scripts/check-subagent-integration.mjs`。

- Finding: P1 — README 与 port-status 把 `correct` 的样例验收称作“真实历史验收”，与本项目自己的验证记录相矛盾
  位置：`README.md:5`（“`correct` 真实历史验收”）、`docs/port-status.md:43`（“`correct` 真实历史验收”）、`docs/migration-plan.md:82`（“含两次真实同类错误提交的临时仓库验收”）；反证 `docs/validation-p1.md:44`（“这是评估 fixture 的已执行坏例，不是项目提交或真实历史纠错记录。真实历史挖掘仍待实际仓库验收”）。
  机制：`scripts/check-correct-acceptance.mjs` 在一个 `mkdtemp` 出的临时仓库里 `git init` 后合成两次同类错误，它证明的是“新约束能拦住已执行坏例”，没有任何真实仓库历史挖掘。README/port-status 的措辞会让读者以为真实历史验收已经完成，而验证记录明确说该项待办；这正落在项目规则“不让…冒充真实行为验证”和“不得把未完成写成已完成”的红线上。
  最小修复：`README.md:5` 与 `docs/port-status.md:43` 改为“`correct` 含两次同类错误的临时仓库验收”，并保留“真实历史挖掘仍待验收”的边界说明。

- Finding: P2 — `docs/validation-p1.md:71` 把 `check:pi:commands` 的结论扩大到它并未断言的属性
  位置：`docs/validation-p1.md:71`（“该检查同时证明 upstream/ 中的上游原文副本不会被当作技能加载”）对照 `scripts/check-pi-commands.mjs:51-52`。
  机制：`own` 只统计 `sourceInfo.path` 以 `<root>/skills/` 开头的命令，再断言 `own.length===11`。若 Pi 额外从 `upstream/` 加载技能，这些命令的路径前缀是 `<root>/upstream/…`，既不会被计入 `own`，脚本也没有对命令总数或“无 upstream 来源命令”做任何断言，因此该检查对“upstream 未被当作技能加载”这一命题没有证明力（现实中由 `pi.skills:['./skills']` 决定，属另一条证据链）。`check-pi-discovery.mjs` 也只显式传入 `skills` 目录，同样不覆盖 upstream。
  最小修复：增加一条断言，例如 `assert(commands.every(c => !c.sourceInfo?.path?.startsWith(resolve(root,'upstream') + '/')))`（或断言总命令数等于 11+内置），否则把 `:71` 的表述降级为“未观察到 upstream 命令”。

- Finding: P2 — `docs/validation-p1.md:118` 的“六个改编技能”与其自身引用的脚本输出互相矛盾
  位置：`docs/validation-p1.md:118`（“五个…逐字相同，六个改编技能正文确有差异，tdd 仅改 frontmatter”）对照 `scripts/check-package.mjs:42-43`（`unchangedBodies` 6 项、`changedBodies` 5 项）与同文件 `:56` 引用的 `"changedBodies":5`。
  机制：11 个技能中，未改正文的是 5 个原则 + tdd（脚本 `unchangedBodies`），确改正文的是 `poteto-mode, correct, principle-prove-it-works, principle-sequence-verifiable-units, principle-boundary-discipline` 共 5 个。若“六个”不含 tdd，则与 5 不符；若含 tdd，则与紧随其后的“tdd 仅改 frontmatter”自相矛盾，也与同页引用的 `changedBodies:5` 冲突。
  最小修复：改为“五个改编技能正文确有差异”。

- Finding: P2 — `docs/validation-p1.md:5` 的边界声明与 `:79/:101` 的新会话证据互相矛盾
  位置：`:5`（“没有启动新的模型会话来统计技能遵循率”）对照 `:79`（“在隔离副本上启动真实新 Pi 会话…两次运行”）与 `:101`（“样本量为 2，不能推断…遵循率”）。
  机制：本批确实启动了两个新会话（并被作为“遵循证据”记录），因此“没有启动新的模型会话”按字面为假；可以成立的只是“没有统计遵循率”。文件头部的边界段看起来是新会话章节定稿前的旧版文字。
  最小修复：`:`5 改为“本批只在两例新会话中记录遵循证据，未统计遵循率”。

- Finding: P2 — `scripts/check-correct-acceptance.mjs` 的临时目录只在成功路径清理；`occurrences` 统计的是提交数
  位置：`scripts/check-correct-acceptance.mjs:108`（`await rm(repo, …)` 位于脚本末尾，无 `try/finally`）、`:52`（`const occurrences = git('log','--oneline')…length`）。
  机制：任一断言失败即抛出，`rm` 不执行，`/tmp/pi-pstack-correct-*` 残留（对比 `check-pi-commands.mjs` 用了 `finally`）；同时输出里的 `occurrences:2` 只是提交条数，不是“同类错误出现两次”的检测结果，容易被读成后者。
  最小修复：把主体包进 `try/finally`；把 `occurrences` 重命名为 `commits` 或改为从坏例探针结果推导。

- Finding: P2（证据可追溯性，按需处理） — `docs/skill-audit.md:21-34` 的 14 行 ported 依据全部为同一句“本批已适配并记录验证证据”，而 `docs/validation-p1.md` 只对 `correct`、`poteto-mode` 与三份 playbook 留有条目级证据（8 个原则与 `tdd` 只有流程内嵌/边界的概括说法）。`docs/skill-audit.md:120`“只有 ported 的 14 项有本批行为证据”因此对部分条目强度偏高。
  最小修复：把依据列改成指向具体证据（如“见 validation-p1.md §正确性约束样例”“见 §新会话调用与遵循证据”），或把措辞改为“已在流程样例中被读取并执行”。

### 需主代理执行的命令（我无 shell 权限）
- `npm run check` —— 预期退出码 0，且输出应为 `"documents":23,"localLinks":70`（若仍打印 22/69，则确认 Finding 1）。
- `npm pack --dry-run --json` —— 预期 47 个文件（若为 46，同上）。
- 修 Finding 2 后：`npm run check` 预期退出码 1 且报 `Published doc links an omitted file: scripts/check-subagent-integration.mjs`；随后按修复方案（把 `scripts/` 加入 `files` 或改写链接）恢复为 0。
- `PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent npm run check:pi` 与 `npm run check:pi:commands`、`npm run check:correct` —— 我未能复跑，记录中的退出码 0 尚未被独立确认。

### Merge verdict
**BLOCK**（三处 P1 均为小改：一段过期输出块、一处断言分支、两处状态措辞；核心实现与映射结构不需要返工）。P2 建议随手修，其中 `docs/validation-p1.md:71` 的结论扩大会影响“新脚本是否证明其声称结论”的表述准确性。