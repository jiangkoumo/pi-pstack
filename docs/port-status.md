# 首批移植记录

本批实现 P1 的单代理子集。上游固定为 f713f14203cd6420cec13cd7c55c32d598dbab68，pstack 0.15.25。技能来源作者 Lauren Tan，MIT 声明在 [上游许可](../LICENSES/pstack.txt)。

## 本批范围

- 11 个技能：poteto-mode、correct、tdd 和八个原则。
- 三个主流程：调查、缺陷修复、小行为变更。
- 原清单 57 个技能、23 个流程、2 个代理共 82 项已逐条归类为 ported 14、substitute 6、deferred 62，依据与归属见 [逐项审计](skill-audit.md)，机器可读结果见 [port-map.json](port-map.json)。deferred 只表示本批未适配，不表示方法本身有问题。
- [原始文件指纹](source-files.json) 记录归档文件的 Git blob ID。upstream/pstack 保存本批使用的固定提交原文，不作为 Pi 技能资源加载。

## 适配差异

| 文件 | 改动 |
| --- | --- |
| poteto-mode/SKILL.md | 规范 name；移除 Cursor 展示字段；明确仅本轮调用；路由限于本批三流程和 correct；按需原则链接；以可用 Pi 工具替换 Task、AskQuestion、todo 假设；不携带固定模型、自动外发或 Git 授权 |
| 三份 playbook | 单代理直接执行；保留调查只读、先复现后修复、建模和真实验证；将 how/why/architect/arena/unslop 等尚未移植的强依赖改为流程内必要步骤；移除自动开 PR、提交、rebase、/loop 和 fan-out |
| correct | 两次实际发生的证据门槛；授权范围内选择架构、类型、检查、测试或文档；历史坏例与修正例使用同一约束；不假定可读取所有会话；不自动提交 |
| tdd | 保留上游工作方法，仅增加 MIT frontmatter |
| principle-prove-it-works | 将未移植的 show-me-your-work 引用改为本地证据记录；提交需授权 |
| principle-sequence-verifiable-units | 不自动 rebase 或提交；补齐实际相对链接，将未移植的 build-the-lever 提及改写为通用工具表述 |
| principle-boundary-discipline | 将无条件信任内部代码改为信任已建立的内部不变量，明确插件、持久化和外部代码边界 |
| 其余五个原则 | 保留上游正文，仅增加 MIT frontmatter |

这是可追溯的方法移植，尚未承诺全量复刻。未移植技能不会因目录映射存在而被发现。

## 使用与检查

本地临时加载，不写全局配置：

```bash
pi -e /absolute/path/to/pi-pstack
```

可用入口为 /skill:poteto-mode <任务> 和 /skill:correct <范围>。叶子技能保持显式调用，主技能通过 read 按需读取。尚无 /poteto-mode on/off/status 或 /setup-pstack。

检查：npm run check。需要实际安装的 Pi 1.3.0 时设置 PI_PSTACK_PI_ROOT=<Pi npm 包绝对路径>，再运行 npm run check:pi 与 npm run check:pi:commands。前者用 Pi 的 loadSkills 检查发现与诊断，后者在临时 agent 目录用真实 Pi 进程读取 /skill 命令且不写全局配置。不从 npm 安装宿主副本。

行为样例与证据见 [P1 验收](validation-p1.md)。加载成功、静态检查和人工执行样例分别记录，不互相替代。

## 后续

P1 已完成：逐项审计、隔离样例、`correct` 验收（实际审阅案例与合成历史回归）、新会话调用与遵循证据、Pi 加载与命令检查均有实际结果。

P2 模式与模型配置、P3 子代理、P4 安装卸载、P5 长运行仍未实现。多模型审阅与自动化入口没有随本包导出。
