# 首批移植记录

本批实现 P1 的单代理子集。上游固定为 f713f14203cd6420cec13cd7c55c32d598dbab68，pstack 0.15.25。技能来源作者 Lauren Tan，MIT 声明在 [上游许可](../LICENSES/pstack.txt)。

## 本批范围

- 11 个技能：poteto-mode、correct、tdd 和八个原则。
- 三个主流程：调查、缺陷修复、小行为变更。
- 原清单 57 个技能、23 个流程、2 个代理共 82 项，当前累计归类为 ported 77、substitute 5、deferred 0，依据与归属见 [逐项审计](skill-audit.md)，机器可读结果见 [port-map.json](port-map.json)。deferred 已归零；substitute 只表示已记录本地替代路线，不代表该入口已实现或运行验收。
- P5 首批：`pause-safely` 已适配为 Pi 本地暂停流程，使用本地补丁与恢复笔记，未授权不提交或推送；见 [P5 Loop 验收](validation-p5-loop.md)。
- P5 第二批：`autonomous-run` 已适配为 Pi `/loop run` 有界自治流程，使用 `--until` 停止谓词、`--max-turns` 轮次预算与本地迭代证据；未授权不提交或推送；见 [P5 Loop 验收](validation-p5-loop.md)。
- P5 Batch A：`bro`、`in-your-own-words`、`ketchup` 及 16 个 `principle-*` 已按 `inherit-body` 纳入生成；其中 4 项保留到已生成技能的真实链接依赖，`principle-explain-the-number` 用最小 override 将未移植的 `benchmark-checklist` 链接改为文字引用。
- P5 Batch B：`sharpen`、`technical-writing`、`unslop` 按 `inherit-body` 纳入；`typescript-best-practices` 用最小 override 移除 Pi 不支持的 `paths` frontmatter 并标注未随包提供的 examples；`prototype`、`session-pickup`、`worktree-cleanup`、`hillclimb` 按 Pi 隔离、恢复与有界 `/loop` 契约适配。
- P5 Batch C：`architect`、`arena`、`interrogate`、`no-comments`、`reflect`、`swarm`、`why` 与 9 个 PR/编排/性能/重构类 playbook 按 Pi 语义覆盖纳入生成；15 项 Cursor 云/平台/缺失依赖条目转为 `substitute` 并记录本地替代路线，`deferred` 归零。
- Issue #10 复核：`recall`、`automate-me`、`eval`、`authoring-a-skill` 四项由 `substitute` 转为 `ported`。前两项读取当前 cwd 的 Pi 会话并按 mtime 排序，`eval` 从子代理 session/transcript 还原执行链，`authoring-a-skill` 改用 Pi 的 `docs/skills.md` 契约；证据见 [recall](validation-recall.md)、[automate-me](validation-automate-me.md)、[eval](validation-eval.md)、[authoring-a-skill](validation-authoring-a-skill.md)。
- [原始文件指纹](source-files.json) 记录归档文件的 Git blob ID。upstream/pstack 保存本批使用的固定提交原文，不作为 Pi 技能资源加载。

## 适配差异

| 文件 | 改动 |
| --- | --- |
| poteto-mode/SKILL.md | 规范 name；移除 Cursor 展示字段；明确仅本轮调用；路由限于本批三流程和 correct；按需原则链接；以可用 Pi 工具替换 Task、AskQuestion、todo 假设；不携带固定模型、自动外发或 Git 授权 |
| 三份 playbook | 单代理直接执行；保留调查只读、先复现后修复、建模和真实验证；将 how/why/architect/arena/unslop 等尚未移植的强依赖改为流程内必要步骤；移除自动开 PR、提交、rebase、/loop 和 fan-out |
| pause-safely | 保留显式暂停与安全边界；按 run id 停止本 run 的子代理；默认以本地 `changes.patch`、`untracked.txt`、`resume.md` 保存证据；wip 提交、推送、PR 与清理均需单独授权 |
| autonomous-run | 将上游 Cursor `/loop` 映射为 Pi `/loop run --until ... --max-turns ...`；谓词退出码 0 才成功，预算耗尽或谓词错误即停；每轮写本地决策证据；默认不 commit/push/PR，恢复需操作者显式 `/loop resume` |
| typescript-best-practices | 正文保持上游；移除 Pi 不支持的 `paths` frontmatter；将未归档的 `references/patterns.md` 改为明确的未随包提供说明 |
| Batch B playbooks | prototype 使用隔离 scratch 目录且不启动 `/loop`；session-pickup 只读当前会话或操作者提供的 Pi 会话文件；worktree-cleanup 需逐项授权并避开活动/脏 worktree；hillclimb 绑定有界 `/loop run`、冻结 harness 与本地决策日志；四者默认不 commit/push/PR |
| Batch C | 7 个深度技能按 Pi 工具、角色模型、受管 worktree 与显式授权语义覆盖；9 个 PR/编排/性能/重构类 playbook 去掉自动 commit/push/merge 与云环境假设；15 项云/平台/缺失依赖条目转 `substitute` 并记录本地替代路线 |
| correct | 两次实际发生的证据门槛；授权范围内选择架构、类型、检查、测试或文档；历史坏例与修正例使用同一约束；不假定可读取所有会话；不自动提交 |
| tdd | 保留上游工作方法，仅增加 MIT frontmatter |
| principle-prove-it-works | 将未移植的 show-me-your-work 引用改为本地证据记录；提交需授权 |
| principle-sequence-verifiable-units | 不自动 rebase 或提交；补齐实际相对链接，将未移植的 build-the-lever 提及改写为通用工具表述 |
| principle-boundary-discipline | 将无条件信任内部代码改为信任已建立的内部不变量，明确插件、持久化和外部代码边界 |
| 其余五个原则 | 保留上游正文，仅增加 MIT frontmatter |
| agents/comment-sicko.md | 声明 package: pstack，强制限定只读工具白名单（read, grep, find, ls），显式设置空 extensions 阻断 ambient extensions，以 excludeTools 排除宿主注入的 contact_supervisor；async: true 为项目统一后台化取舍，遇阻最终返回并由原生通知交接；将 diff against main 改为父会话提供 diff，移除未移植的 /how、/why 引用，保留审查规则与报告格式 |
| agents/poteto-agent.md | 声明 package: pstack，is_background 映射为 async: true；不声明空 extensions 以便加载模型 provider 扩展并消除告警；移除 Cursor 专用查找路径，通过包内相对路径发现 poteto-mode 技能，明确单一 writer 隔离与受管 worktree 约束 |

这是可追溯的方法移植，尚未承诺全量复刻。未移植技能不会因目录映射存在而被发现。

## 使用与检查

本地临时加载，不写全局配置：

```bash
pi -e /absolute/path/to/pi-pstack
```

可用入口为 /skill:poteto-mode <任务> 和 /skill:correct <范围>。叶子技能保持显式调用，主技能通过 read 按需读取。P2 现已提供 /poteto on/off/status 与 /setup-pstack，详见 [P2 契约与验收](validation-p2.md)。

检查：npm run check（缺 pi-subagents 时两个模块探针显式报告 skipped，不算 P3 验收通过）；严格 P3 检查为 npm run check:p3，需要实际 Pi 与 pi-subagents，缺依赖时报错。需要实际安装的 Pi 1.3.0 时设置 PI_PSTACK_PI_ROOT=<Pi npm 包绝对路径>，再运行 npm run check:pi 与 npm run check:pi:commands。前者用 Pi 的 loadSkills 检查发现与诊断，后者在临时 agent 目录用真实 Pi 进程读取 /skill 命令且不写全局配置。不从 npm 安装宿主副本。

行为样例与证据见 [P1 验收](validation-p1.md)。加载成功、静态检查和人工执行样例分别记录，不互相替代。

## 后续

P1 已完成：逐项审计、隔离样例、`correct` 验收（实际审阅案例与合成历史回归）、新会话调用与遵循证据、Pi 加载与命令检查均有实际结果。

P2 模式与角色配置已实现并验证；P2.5 生成式适配迁移与真实场景检查已完成并接入检查，见 [P2.5 验收](validation-p2-5.md) 与 [真实场景检查](validation-p2-5-live.md)。P3 代理生成、清单声明、角色接线、前后台真实 child 拒写（前台+后台 detached runner）、后台 ambient 扩展隔离、managed worktree 并发隔离以及双模型（DeepSeek 与 GLM）真实只读审阅流程均已全部实现并实测验证，见 [P3 验收](validation-p3.md)、[后台隔离验收](validation-p3-background.md)、[工作树验收](validation-p3-worktrees.md) 及 [Live 审阅验收](validation-p3-live.md)。写代码委派的父代理交接契约、机械 review gate 与端到端 host 流程（fixture 模型）已实现并验证，见 [Writer 验收](validation-p3-writer.md)。P4 本地打包、隔离安装/升级/卸载与 GitHub Actions 已通过，见 [P4 验收](validation-p4.md)；发布待后续。P5 长运行待后续推进。多模型审阅与自动化入口逐步随 P3 导出。

分发资源现已通过 `npm run generate` 生成，并通过 `npm run check:generate` 与 `npm run check` 保持防漂移。后续技能维护在 `adapters/pi/` 或 `docs/port-map.json` 中进行；`upstream/` 保持固定原文，升级时同时审阅 SHA 与指纹变更。覆盖源使用 `.template` 后缀，相对链接按输出路径校验。未移植项目继续保持原支持状态。
