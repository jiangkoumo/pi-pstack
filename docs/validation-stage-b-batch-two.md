# 阶段 B 第二批

准备基线：第一批及真实 TLC 环境验收已合入 main。第二批 #26 负责 create/maintain 正文与 Pi 尾部适配，#27 负责 statechart 及原样脚本测试，#28 负责 setup 可选提议逻辑与命名检查。共享生成清单、扩展入口与路由由主控接线。

三个新技能先进入 preparedResources，状态 pending-acceptance；不因文件生成成功就宣称支持。statechart scripts 从固定快照 verbatim 生成，保持 Git blob 字节，单独校验漂移。后续实际测试、模型行为与限制追加于此。
