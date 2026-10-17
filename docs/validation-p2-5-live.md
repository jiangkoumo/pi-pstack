# P2.5 真实模型场景检查

状态：已执行三轮，每轮三个真实 Pi 新会话，共九次。前两轮业务通过但暴露流程偏差；针对性修复后的 R3 已通过主代理业务与流程核查，独立定向复查尚待返回。本记录暂不将 P2.5 标记完成。执行模型为 deepseek/deepseek-flash，thinking=low；独立审阅换用 magpie/opendesign/glm-5.3-flash。

## 场景与验收方法

使用订单报价 CLI 可控样例：整数分商品价格、数量、基点税率和不计税运费。调查与修复场景故意保留 taxBps || 1000 将零税率替换为默认税率的缺陷；功能场景先修正该缺陷，再要求新增 discountBps（0..10000 安全整数），折扣按 Math.round 取分、先折后税、运费不折不税，返回 discountCents 且保留原字段。

每个会话使用独立工作目录和新进程，通过 `-e /Users/jiangkoumo/Documents/pi-pstack` 加载生成包，以 `/skill:poteto-mode` 显式调用。没有给模型注入待测 playbook 正文，也没有替模型完成实现。各目录有八个初始文件，含 cache/user-note.txt 与 notes.txt 两份操作者文件，运行前后对所有文件递归取 SHA256 并比较。目录不是 Git 仓库，cache/ 只由 .gitignore 标记；不能称作已验证真实 Git ignored/tracked 状态。

实际进程选项为：`--mode json --print --no-session --no-extensions --no-mcp --no-context-files --no-prompt-templates --offline --no-approve --tools read,edit,write,bash,grep,find,ls --model deepseek/deepseek-flash --thinking low -e <包路径>`。附加系统约定限制访问当前样例及包内技能、使用原生文件工具、不得修改包或委派。所有模型会话结束后，临时 agent 目录中的 auth.json 和 models.json 副本已删除；用户全局配置未更改。

证据保存在本机：

- R1：`/tmp/pi-pstack-p25-live-20261017/`
- R2：`/tmp/pi-pstack-p25-live-20261017-r2/`
- 各轮启动脚本为 run-live.mjs；原始非增量事件在 evidence/<scenario>.jsonl，包含模型完成消息、工具启动/结果、agent_settled；摘要在 evidence/<scenario>-summary.json，包含实际 prompt、进程状态、工具参数、文件前后指纹和最终答复。
- 两轮压缩审阅输入：`/tmp/pi-pstack-p25-live-review-summary.json`。
- 独立功能验收：各轮根目录的 accept-feature.mjs，由主代理编写并从样例目录之外执行，没有交给模型改写。

JSON 模式退出码 0 单独不足以证明成功；六次摘要都另核对了非 aborted 的 agent_settled、无最终 error/aborted/length 消息。预期的失败测试、非法输入和路径错误作为工具结果保留，没有把它们抹成成功。原始日志保留提示和完整工具内容，临时路径不是长期发布或 CI 证据。

## R1：业务通过但流程失败

| 场景 | 实际结果 | 流程问题 |
| --- | --- | --- |
| 只读调查 | 找到 taxBps 真值回退根因；进程退出码 0；八个文件前后指纹完全一致 | 未读取 investigation.md，shell 执行 ls/find/cat；不能认定遵守技能工具约定 |
| 缺陷修复 | 仅 pricing.mjs 一行变为 taxBps ?? 1000；原测试修前 1 失败、修后 4/4 通过 | 先 shell ls；多命令混用 echo $?，不符合命令证据要求 |
| 折扣功能 | 仅 pricing.mjs 与 pricing.test.mjs 改变；模型回复报告测试 10/10（主代理另运行 npm test 验证 10 通过）；独立功能检查退出码 0 | 未读 feature.md 和原则叶子；验证命令附 echo $? |

主代理独立运行 R1 修复与功能目录的 npm test，退出码均为 0。功能独立验收修前退出码 1（discountCents 为 undefined，而预期 625），修后退出码 0。

## 最小调整与 R2

R1 后仅调整主技能源模板入口：第一工具调用先 read 对应 playbook，说明显式调用只注入主技能；将原生文件工具和单命令退出状态要求前置。执行 npm run generate，14 个资源中 written=1。没有给第二轮模型反馈第一轮的具体输出，也没有复用会话上下文。三个工作目录均从原始样例重建，模型、场景 prompt、工具权限和附加系统约定保持一致。

| 场景 | R2 业务及范围证据 | R2 流程观察 |
| --- | --- | --- |
| 只读调查 | 进程 0、settled 非 aborted；八个文件前后指纹一致；正确定位零税率根因 | 第一工具 read investigation.md；原生文件工具与分开的 CLI/测试命令；答复末尾 NaN 行为出现事实矛盾：当前 `NaN || 1000` 实际回退1000，不能称当前会产生NaN税额 |
| 缺陷修复 | 仅 pricing.mjs 变化；主代理 npm test 退出码 0、4/4；会话有修前失败与修后成功证据 | 第一工具 read bug-fix.md；未读无条件要求的 fix-root-causes、prove-it-works 叶子；廉价回归条件成立时要求的 tdd 也未读；test-behavior-not-implementation 同样未读，但它只在新增测试时要求，本次未新增测试，不计作这项规则的违规；最后在非 Git 目录运行 git diff 退出129并说明不可用；仍有多步骤 Git 命令 |
| 折扣功能 | 仅 pricing.mjs 与 pricing.test.mjs 变化；主代理 npm test 退出码 0、11/11；独立功能检查退出码 0 | 第一工具 read feature.md；首次原则路径多一层 poteto-mode 导致读取失败，随后自行纠正并读取五份原则；CLI/测试使用分开且显式cwd的命令；最后回复“三个文件”与实际两文件改动描述不够准确 |

R2 功能独立验收覆盖：25% 折扣、折后税舍入、全额折扣保留运费、默认折扣、显式零税率、默认税率、半分折扣舍入、空订单，以及 -1/10001/小数/NaN/Infinity/字符串/null 均拒绝。命令：`cd /tmp/pi-pstack-p25-live-20261017-r2/feature && node /tmp/pi-pstack-p25-live-20261017-r2/accept-feature.mjs /tmp/pi-pstack-p25-live-20261017-r2/feature`，退出码 0，输出 independent feature acceptance passed。

## 结论与限制

两轮业务实现均通过独立检查；入口调整后，三个会话全部先读取对应流程，R1 的 shell 内容读取和伪装退出码问题在 R2 场景检查中不再出现。仍有原则读取遗漏、路径误解与解释准确性问题，不能报告完整技能遵循或统计可靠性。只有六个小型可控任务，没有评估大型工程、长期执行或 P3 多代理。

隔离 PI_CODING_AGENT_DIR 未隔离 `~/.agents/skills` 自动发现；原始系统事件仍包含用户通用技能目录。没有观察到模型读取无关技能，但这不是纯净环境证明。后续验收应显式 `--no-skills --skill <包内skills>` 后重查技能目录，避免混入环境资源。

## R3：检测问题修复与纯净技能发现

源模板调整：bug-fix 在工作区检查前明确读取 fix-root-causes、prove-it-works，并在廉价回归检查前读取 tdd；feature 明确 ../../ 从 playbooks/ 回到 skills/，前置领域建模与最简原则，并要求区分实际改动与允许改动；investigation 要求边界结论实际执行或标注未验证，区分当前与建议修复后行为。主入口要求完成所选流程的必读材料。执行 npm run generate，14 份资源中 written=4。没有改固定上游原文。

R3 工作目录为 `/tmp/pi-pstack-p25-live-20261017-r3/`，从原始样例重新创建，沿用 R1/R2 prompt、执行模型和权限。新增选项 `--no-skills --skill /Users/jiangkoumo/Documents/pi-pstack/skills`，三个真实系统事件的 skills 段均为空（本包技能均为显式调用），不再出现 ~/.agents/skills。模型仍通过显式 /skill:poteto-mode 获得入口，并实际 read 包内流程及叶子。该设置隔离技能发现，不宣称操作系统沙箱。

| 场景 | 业务、范围和流程结果 |
| --- | --- |
| 调查 | 进程0、settled非aborted、八文件SHA256均不变；第一工具读调查流程，所有文件内容经read，测试与CLI各自执行；没有再断言NaN会污染当前税额。缺省、零税率和影响范围说明与程序一致 |
| 修复 | 第一工具读bug-fix流程，随后依次读fix-root-causes、prove-it-works、tdd，均早于工作区检查；只改pricing.mjs，既有测试修前失败、修后主代理npm test为4/4，退出0；没有新增测试，故test-behavior叶子为条件不适用 |
| 功能 | 第一工具读feature流程，正确读取领域建模、最简、验证、行为测试四叶子，再读取工作区；随后读取顺序与边界原则；没有错误原则路径。仅pricing.mjs和pricing.test.mjs变化，最终答复明确quote.mjs允许但未改；主代理npm test为8/8、退出0 |

主代理补充验证命令（均实际执行）：

- `cd /tmp/pi-pstack-p25-live-20261017-r3/bug-fix && npm test`，退出0，4通过。
- `cd /tmp/pi-pstack-p25-live-20261017-r3/feature && npm test`，退出0，8通过。
- `cd /tmp/pi-pstack-p25-live-20261017-r3 && node accept-feature.mjs /tmp/pi-pstack-p25-live-20261017-r3/feature`，退出0，independent feature acceptance passed。
- `cd /tmp/pi-pstack-p25-live-20261017-r3 && node accept-cli.mjs`，退出0，independent CLI acceptance passed: 4 cases。
- 在R3调查目录使用node --input-type=module直接调用quote({items:[{unitPriceCents:100,quantity:1}],taxBps:NaN})，断言taxCents=10，退出0，输出subtotalCents=100、taxCents=10、totalCents=110。这是主代理对旧答复矛盾的独立反证，非模型自报。

R3摘要与三个系统检查汇总在 evidence/review-summary.json，原始事件和各场景摘要沿用前两轮命名。进程已退出；agent/auth.json与agent/models.json临时副本已删除，全局配置未修改。非Git目录中的git log/diff/status尝试仍返回非零并如实报告，不是业务失败，也不能报告为成功diff验收。

## 独立 GLM 审阅与处置

### R1/R2 初步审阅
初次 GLM 审阅给出 OK with notes，确认了业务正确性与 R2 首工具行为改善，但指出漏记原则叶子、NaN 解释矛盾及缺少独立 CLI 验收。主代理针对性补充了外部 accept-cli.mjs 并在 R3 中修复了模板。

### R3 定向复查（已完成）
换用 magpie/opendesign/glm-5.3-flash 独立只读 reviewer，对 R3 的会话证据、产物和命令退出码进行定向静态复查。报告位于本机 pi-subagents 工件 1b7ef78e-92e6-4e3c-94f1-5976dc66d009_reviewer_output.md。审阅者未执行命令。

审阅确认以下六项事实全部成立：
1. **必读时序合规**：bug-fix 首读 playbook，随后同一轮批量读取 fix-root-causes、prove-it-works 与 tdd，均早于工作区检查与 edit；feature 首读 playbook，随后读领域建模、最简、验证与行为测试四叶子，均早于工作区检查与 edit。
2. **错误路径消失**：全部读取路径均为包内 skills/ 与 /tmp workspace；grep 确认三份 jsonl 中无任何 `\.agents` 混入。
3. **命令真实退出码**：jsonl 内 exit_code 与模型最终答复完全一致（3/1→4/4、8/8、CLI 0/1、调查 git 128 等），无掩盖或虚报。
4. **范围与指纹闭环**：调查 8 文件前后 hash 相同，changed: []；bug-fix 仅 pricing.mjs 一行变化；feature 仅 pricing.mjs 与 pricing.test.mjs 两个文件变化，模型报告改动文件数准确。
5. **解释与事实一致**：调查答复只主张了实测行为，对 null/NaN 仅作建议，区分了实测与推断，声明 git 历史不可及。
6. **模板与生成一致**：adapters/pi/overrides/ 下的模板与 skills/poteto-mode/ 生成产物逐字一致。

审阅提出一项 P2（不阻塞）：feature 场景中 sequence 与 boundary-discipline 在 edit 之后、验证前读取；因属于条件触发原则且任务简单，无实际后果。

**Merge verdict: OK** —— 确认 R3 场景验收足以关闭先前指出的所有具体流程问题。本样本（3 场景各 1 次）属于定性验收，不推断统计遵循率。


fresh-context reviewer 使用 magpie/opendesign/glm-5.3-flash，已读取会话摘要、工具事件、样例源码、模型测试和独立验收脚本。它只做静态审阅，未独立执行命令；报告位于本机 pi-subagents 工件 9269d180-6326-472c-84ea-a7f82c994893_reviewer_output.md。

审阅确认业务正确性、修改范围和 R2 首工具读取流程的改善，给出 OK with notes 并认为可以关闭 P2.5。主代理保留更严格的验收结论：技能明文要求的原则读取仍遗漏，且纯净技能发现尚未复验；因此不按 reviewer 建议提前关闭阶段。

| 意见 | 核实与处置 |
| --- | --- |
| 漏记 test-behavior-not-implementation 未读取 | 补入上表。但该叶子要求以新增测试为前提，本次只修实现且沿用既有测试，所以不计作第四项无条件违规；其他三份读取缺失仍成立 |
| 调查 NaN 解释矛盾 | 成立，保留原始答复与问题记录，不能称解释完全准确 |
| 独立功能验收只调用函数，CLI依赖模型自测 | 成立，主代理新增并运行外部 accept-cli.mjs，通过 spawn 启动真实CLI，检查零税率+运费、25%折扣、非法折扣退出码1与默认值四例 |
| R1测试10/10未由reviewer逐条核对 | 记录来源层级：模型回复报告10/10，主代理已另运行 R1 npm test，10通过、0失败；不称 reviewer 独立运行 |

补充实际命令：`cd /tmp/pi-pstack-p25-live-20261017-r2 && node accept-cli.mjs`，退出码 0，输出 independent CLI acceptance passed: 4 cases。脚本位于样例目录之外，仅执行CLI并断言输出/退出码，没有修改模型产物。最后补充脚本和文档未再次交独立模型复查。
