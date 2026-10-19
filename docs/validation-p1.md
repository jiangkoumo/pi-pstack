# P1 首批验证记录

## 验证边界

本批验证包括四类证据：资源加载与结构检查、隔离定价样例、`correct` 约束验收、两次真实新会话的行为观察。新会话仅作为定性观察，不代表统计遵循率。

正式独立只读审阅另行记录。只读调查阶段没有修改目标样例；之后的修复和功能样例才修改隔离副本。下面命令均在本次实际执行，输出摘录保留原文。

## 样例与重放

原始坏例位于 scripts/fixtures/engineering/。为隔离执行，复制到 /tmp/pi-pstack-p1-engineering，项目内的原始坏例保持不变。修正后的可重放副本保留在 scripts/fixtures/engineering-accepted/。样例自身不作为发布技能资源导出。

### 调查

问题：显式零税率为什么收税？读取 pricing.mjs 与 check-pricing.mjs，追踪到 taxRate || 0.1 会将合法零值视为缺省。此阶段只读，产出原因说明；没有把调查请求自动转成修改。

### 缺陷修复

在隔离样例执行 node check-pricing.mjs，修复前退出码 1：

```text
AssertionError [ERR_ASSERTION]: An explicit zero tax rate is tax-exempt
+ 220.00000000000003
- 200
  actual: 220.00000000000003,
  expected: 200,
  operator: 'strictEqual',
```

根因在默认值运算而非调用端。改为 taxRate ?? 0.1，保留零值。默认税率的断言采用浮点误差容限，零税率断言仍为精确 200。

同一命令修复后退出码 0，输出 pricing behavior passed。之后加入折扣功能，再运行此检查仍退出码 0。

### 小行为变更

输入 total 的现有对象新增 discountRate，缺省 0，合法范围为有限数字 [0,1]。先折扣后税。无需新类或额外状态。

阻塞步骤是确认定价契约和检查；独立工作不适用，因为只有一个计算入口；共享状态为 pricing.mjs；最小分解是当前 writer 顺序修改并检查。

node check-discount.mjs 在变更前退出码 1，25% 折扣结果实际 220.00000000000003，预期 165。变更后退出码 0，输出 discount behavior passed。检查覆盖缺省值、全额折扣、负数、超过 1、NaN、Infinity、字符串和 null。原零税率检查也通过。

### correct 的约束样例

构造的两次错误发生在两个不同公开入口：cartSubtotal(100,-1) 返回 -100，quoteSubtotal(100,1.5) 返回 150。这是评估 fixture 的已执行坏例。在项目内，`correct` 同时以本项目的实际审阅历史作为真实案例验收：见下文《发布链接的真实案例回归》。

node check-quantity.mjs 在修正前退出码 1，原文为 Missing expected exception (RangeError)。将数量契约收拢到 subtotal，一个函数拥有非负安全整数约束，两个调用方统一使用它。JS 运行时输入不能仅靠静态类型排除坏值，因此使用共同领域入口的运行时边界校验和行为检查。

同一命令修正后退出码 0，输出 quantity constraints passed for both callers。两个公开入口均检查负数、小数、NaN 和 Infinity，同时验证零和正整数正常。未添加单纯重复规则文字的断言，未宣称运行过 CI。

## 当前检查

本批最终实际执行，命令均在项目根目录运行：

```text
npm run check
退出码 0：{"status":"passed","mapped":82,"archived":15,"documents":22,"localLinks":69,"unchangedBodies":6,"changedBodies":5,"dispositions":{"deferred":62,"ported":14,"substitute":6}}

PI_PSTACK_PI_ROOT=<Pi 1.3.0 包绝对路径> npm run check:pi
退出码 0：{"status":"passed","skills":[11 个名称],"diagnostics":[],"defaultPromptCharacters":0}

PI_PSTACK_PI_ROOT=<Pi 1.3.0 包绝对路径> npm run check:pi:commands
退出码 0：{"status":"passed","manifestSkillCommands":11,"processExit":0,"modelRequests":0}

npm run check:correct
退出码 0：{"status":"passed","occurrences":2,"checkBeforeFix":{"exitCode":1},"checkAfterFix":{"exitCode":0},"replayRejectsHistoricalInputs":true}

npm pack --dry-run --json（只读，未生成 tgz）
退出码 0：79 个文件，README 链接到的文档全部在内

npm run check:correct:history
退出码 0：{"status":"passed","evidence":"two actual project review findings","historicalFalsePass":{"omitted":"scripts/","exitCode":0},"rejected":[{"omitted":"docs/","exitCode":1,"target":"docs/port-status.md"},{"omitted":"scripts/","exitCode":1,"target":"scripts/check-subagent-integration.mjs"}],"correctedExitCode":0,"packedFiles":79,"checkedLinks":69}
```

命令检查在临时 agent 目录启动真实 Pi 进程，通过 RPC 读取 get_commands，确认 11 个技能命令来自本包 skills/，随后结束进程并清理临时目录。它没有发送 prompt，因此不涉及模型请求，也不写全局配置。该检查显式断言 upstream/ 路径下的上游原文未注册任何命令（upstreamSkillCommands 为 0）。

打包预览只说明清单覆盖，不代表安装、卸载或升级已验收。

### 发布链接的真实案例回归

本项目在本次移植过程中真实经历了两次同类错误，记录在两轮独立只读审阅中：
1. 第一轮审阅指出 package.json 的 files 未包含 docs/ 与 AGENTS.md，导致 README 链接在发布后成为死链。
2. 修复后引入的发布检查使用了包含已发布源文档即放行的规则，第二轮审阅指出这导致 docs/integration-decisions.md 所链接的 scripts/check-subagent-integration.mjs 仍未打包，产生漏报。

这满足 correct 的两次实际发生门槛。修复方法是将约束收拢到 check-package.mjs 的发布链接遍历中，要求所有已发布文档的本地链接目标必须全部包含在打包清单中。

`npm run check:correct:history` 使用保存的历史检查快照证明：
- 错误规则在第二项脚本遗漏时假阳性通过（退出码 0）。
- 修正后的规则对两处历史遗漏均报告退出码 1 并指明具体缺失目标。
- 完整包含后的当前清单退出码 0，且实际 npm pack 清单的 69 处文档链接全部在发布集合内。

已知边界：命令检查通过临时 `-e` 路径加载，不改用户 settings.json；安装／卸载、升级、项目 trust 和包过滤行为仍属 P4。新会话遵循证据只有本文件记录的两例；持久 on/off 模式、子代理执行和多模型审阅未在本批验证。

## 新会话调用与遵循证据

在隔离副本上启动真实新 Pi 会话，通过 `-e` 加载本包，用 /skill:poteto-mode 调用主技能。两次运行都不写会话文件，模型为用户当前默认的 group/never-stuck。

第一次为只读调查，提示词明确要求只解释、不改文件：

```bash
cd /tmp/pi-pstack-new-session
pi --print --no-session --mode json -e /Users/jiangkoumo/Documents/pi-pstack \
  "/skill:poteto-mode 为什么显式传入 taxRate 为 0 时仍然被收了税？只解释原因，不要修改任何文件。"
```

结果：退出码 0。工具序列为 read、codemode、fffind、ffgrep、read、codemode、ls、read、read、read、codemode、read、read、read、bash，没有 edit 或 write。运行前后对 fixture 七个文件取 SHA256，全部一致，证明只读规则真的成立，而不只是模型自述。答复给出 pricing.mjs 第 2 行的 `taxRate || 0.1`，复述吞吐检查点为「n/a，只读调查」，并运行只读检查报告退出码 1 与实际值 220.00000000000003。

第二次为缺陷修复，提示词为「修复显式传入 taxRate 为 0 时仍被收税的问题」：

```bash
cd /tmp/pi-pstack-new-session2
pi --print --no-session --mode json -e /Users/jiangkoumo/Documents/pi-pstack \
  "/skill:poteto-mode 修复显式传入 taxRate 为 0 时仍被收税的问题。"
```

结果：退出码 0。工具序列先读取与复现，随后只有一次 edit，最后运行检查。改动为 `taxRate || 0.1` → `taxRate ?? 0.1`，把合法零值与未传值分开。主代理独立复核：`node check-pricing.mjs` 退出码 0，输出 pricing behavior passed。答复报告了修复前后退出码与数值，并指出目录不是 Git 仓库。

这两次运行只覆盖单代理的调查与修复路径，样本量为 2，不能推断其余流程或更长任务上的遵循率。

## 独立只读审阅

本轮按项目规则追加了一次 fresh-context 只读审阅：pi-subagents 的 reviewer，模型 opencode-go/deepseek-v4.1-flash，上下文 fresh，未获编辑权限，审阅对象为工作树快照（仓库尚无首个提交）。结论为 OK with notes，无 P0/P1。

审阅给出四项 P2，主代理逐项核实并处置：

| 意见 | 核实 | 处置 |
| --- | --- | --- |
| 适配记录称已删除 build-the-lever 引用，正文仍留 lever 措辞 | 成立，属措辞与记录不一致 | 改写为通用「工具、脚本或 codemod」表述，并修正记录文字 |
| 验证记录缺可复现命令输出 | 成立，上一轮快照尚未包含输出 | 本节已补入三项检查的实际输出与退出码 |
| 发现检查指向不存在的 scripts/fixtures/empty-agent | 成立，路径未生效且为死引用 | 建立该目录并保留 .gitkeep |
| files 未覆盖 README 链接到的文档 | 成立，发布后会产生死链 | files 增加 docs/ 与 AGENTS.md，并在检查中新增发布链接覆盖断言 |

新增的发布链接断言已用真实反例验证：临时省略 docs/ 时 npm run check 退出码 1，报 Published doc links an omitted file: docs/port-status.md；恢复后退出码 0。审阅者本人没有 shell 权限，未执行任何检查；上表结果由主代理实际运行得到，不把审阅意见本身当作运行证据。

审阅确认的关键事实也由主代理复算：11 个技能目录与 SKILL.md 一一对应、名称合法且与目录同名；pi.skills 是 Pi 1.3.0 真实清单字段；82 条映射计数一致；五个「仅加 frontmatter」原则正文与上游逐字相同，五个改编技能正文确有差异，tdd 仅改 frontmatter。该结论已固化为 check-package.mjs 的断言，防止适配记录与文件日后漂移。

审阅者未能运行检查，也无法核验新会话遵循；它报告的正文一致性由主代理用脚本复算后写入结构检查。审阅期间 THIRD_PARTY_NOTICES.md 曾更新，因此审阅快照与本文件最终状态存在时差。

具体执行命令和最终结果以本节为准。

## P5 Batch A：19 项纯文本技能纳入生成器

本批将 `bro`、`in-your-own-words`、`ketchup` 及 16 个 `principle-*` 纳入生成资源，验证范围是资源生成、正文完整性、链接闭包和仓库门禁，不是逐技能行为评测。

- 18 项使用 `inherit-body`，正文与上游逐字相同，仅由生成器补 `name`、`description`、`disable-model-invocation` 与 `license: MIT`。
- `principle-explain-the-number` 使用最小 override：保留正文，仅把未移植的 `benchmark-checklist` 链接改为文字引用并注明能力缺口；其余引用仍指向已生成技能。
- 依赖不是全部为空：`ketchup`、`principle-attack-the-premise`、`principle-build-the-lever`、`principle-minimize-reader-load` 保留真实链接依赖；`principle-explain-the-number` 依赖 `principle-prove-it-works`。其余 14 项为 `[]`。
- 本轮实际执行：`npm run generate` 生成 37 项、写入 19 项；`npm run check:generate` 通过 37 项、0 未归属；`npm run check` 退出码 0，`mapped: 82`、`archived: 38`、`dispositions: { ported: 37, substitute: 6, deferred: 39 }`。

`check-package.mjs` 的 `unchangedBodies` 断言覆盖 18 项正文不变技能；`principle-explain-the-number` 因 override 进入 `changedBodies`。这些断言只能证明资源与正文一致，不能证明每个技能在真实任务中被正确触发或遵循。

## P5 Batch B：4 项技能纳入生成器

本批纳入 `sharpen`、`technical-writing`、`typescript-best-practices`、`unslop`。前 3 项使用 `inherit-body`，正文与上游逐字相同；`typescript-best-practices` 使用最小 override：保留规则正文，移除 Pi 不支持的 `paths` frontmatter，并把未归档的 `references/patterns.md` 改为明确的“未随包提供”说明。

- 4 项都无相对链接，`dependencies` 均为 `[]`，`evidence: validation-p1.md`。
- `npm run generate` 生成 45 项、写入 8 项；`npm run check:generate` 通过 45 项、0 未归属；`npm run check` 退出码 0，`mapped: 82`、`archived: 46`、`dispositions: { ported: 45, substitute: 6, deferred: 31 }`。
- `check-package.mjs` 的 `unchangedBodies` 增加 `sharpen`、`technical-writing`、`unslop`；`typescript-best-practices` 因 examples 说明改动进入 `changedBodies`。

以上只验证资源生成、正文完整性和 frontmatter 可加载性，不证明这些技能在真实任务中的触发与遵循。

## P5 Batch C：7 项深度技能纳入生成器

本批纳入 `architect`、`arena`、`interrogate`、`no-comments`、`reflect`、`swarm`、`why`。7 项均使用语义 override，而不是 `inherit-body`：上游正文含 Cursor `Task`/`subagent_type`、`~/.cursor` 模型规则、固定 slug、云环境或未归档的 `references/` 文件，直接继承会把不可用假设带进 Pi。

- 覆盖后的正文只使用 Pi 工具、`subagent` 语义、受管 worktree 与操作者授权；不引入额外 Markdown 链接，`dependencies` 均为 `[]`，`evidence: validation-p1.md`。
- `architect` 把缺失的 design red-flags 参考内联为本地检查；`arena`/`swarm` 去掉 Cursor slug、cloud 与 `run_in_background` 假设；`interrogate`/`no-comments` 使用只读评审与父代理核实；`reflect` 只读当前 Pi 会话；`why` 只列本环境实际可用的证据源。
- `npm run generate` 生成 61 项、写入 16 项；`npm run check:generate` 通过 61 项、0 未归属；`npm run check` 退出码 0，`mapped: 82`、`archived: 62`、`dispositions: { ported: 61, substitute: 21, deferred: 0 }`。

这些是语义覆盖与资源门禁的证据，不是 7 个技能在真实任务中的独立行为评测。
