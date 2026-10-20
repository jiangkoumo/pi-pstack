# pi-pstack 0.1.0 Bug 清单（来自 2026-10-20 测试报告，pi 1.3.0）

## fix/loop

B1 [High] extensions/pstack/index.ts:274-280
/loop run 在 print/JSON 模式下什么都不做，状态还会丢失。
复现：pi --mode json --session-id x '/loop run --max-turns 4 --until "npm test" "fix"'
现象：写入了 pstack.loop.v1 running 这条记录，但进程没跑任何一轮就退出；之后 /loop status 返回 null（session 文件从没落盘）。RPC/TUI 模式下正常。
修法：ctx.mode 为 print/json 时，要么报错提示“请用 RPC/TUI”，要么用 pi.sendUserMessage 启动这一轮，让 print 模式等它跑完。README 里写明无头运行用 pi --mode rpc。

B3 [Med] loop.mjs:43-63
以子命令词开头的目标会被解析错。/loop stop the flaky test 被当成 stop；/loop status foo 反而启动了一个 8 轮的自动运行，目标是 "status foo"。
修法：只有当 status/stop/resume 是整条命令（加上合法选项）时才当子命令；或者要求目标前必须写 run。

B4 [Med] loop.mjs:241-265
不带 --until 的 loop 一定会跑满 maxTurns（默认 8 轮），因为模型没有办法表示“做完了”。
修法：强制要求 --until（或调低默认轮数），或者加一个模型可以调用的完成标记/工具。

B8 [Low] index.ts:166, loop.mjs:178-265
event.context.canContinue 传进来了却从没检查。
修法：!canContinue 时停止，reason 设为 host-cannot-continue。

B9 [Low] index.ts:142-162
这一轮被中止或出错时（比如按了 Esc），--until 的判断命令仍然会执行。
修法：先检查 event.outcome。

B11 [Low] loop.mjs:25-41,83
分词器不支持反斜杠转义（--until "echo \"x\"" 会解析错）；parseInt 会接受 --max-turns 5abc。
修法：换用 shell-words 解析器，用 Number() 加整数校验。

## fix/roles

B2 [High] skills：hillclimb.md:10, prototype.md:9, multi-phase-plan.md:10, orchestrate.md:7, pause-safely.md:10, autonomous-run.md:11, architect/SKILL.md:15；以及 scripts/check-*
硬编码了 ~/.pi/agent/pstack-runs，忽略了 PI_CODING_AGENT_DIR。实测中模型把 decisions.tsv 写进了真实的家目录。自检脚本也只在 $HOME/.pi/agent 下找 pi-subagents。
修法：由 extension 用 getAgentDir() 算出 run 目录，写进注入的 mode 段落；skills 里改成“使用 system prompt 里给出的 pstack run 目录”。

B5 [Med] index.ts:44, runtime.mjs:343-386
角色路由只对两个 pstack agent 的单次直接 subagent 调用生效。workflow（并行分发）调用会跳过它，导致 arena/swarm/interrogate 的并行分发拿不到角色模型。prose/verification 两个角色能在 /setup-pstack 里配置，但从没被用到。
修法：在 workflow.runs[*] 里也做角色映射；把 prose/verification 接到具体的 agent 或 skill 上，或者从配置里删掉。

B6 [Low-Med] index.ts:88-94
在没有任何对话之前执行 /poteto-mode on，状态只存在内存里，但 status 仍然显示 persistent: true。
修法：session 文件存在之前报 persistent:false，或者给出警告。

B7 [Low-Med] index.ts:62-67, runtime.mjs:304-313
角色配置只有在 mode 开启时才会告诉模型。mode 关闭时，模型会错误地说“没有配置 review 角色”。
修法：只要用到 pstack 的 skill 就注入角色信息，或者让 skill 自己去读 /setup-pstack status。

## fix/docs（只改 markdown）

B10 [Low] README 第 2 节：写着“用户输入普通消息时 loop 会被标记为 interrupted”，但代码里并没有 input 处理函数。改 README（如果要加 input handler，留给 fix/loop）。
B12 [Low] agents/poteto-agent.md:4,17：残留了“Substituting generalPurpose”，还引用了移植时已经删掉的 poteto-mode “Subagents section”和“inline Principles index”。重写这两处。
G2：README 没写必须先 pi install npm:pi-subagents，不装就没有 subagent 工具。补上。
docs/ 里有 38 个坏的相对链接：从 docs/ 内部写成了 scripts/... 和 ../SKILL.md，应该是 ../scripts/... 等。

## 备注
- npm run check 目前通过（49 个测试），但抓不到 B1、B3、B4、B8，每个修复都要补能复现的测试。
- tsc --noEmit 有 6 个类型错误，都来自没加类型的 .mjs JSDoc，和 pi API 本身无关，不在这次修复范围内。
