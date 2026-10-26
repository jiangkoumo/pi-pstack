# 第三方来源与许可

## pstack

- 作者：Lauren Tan（@poteto）。
- 官方仓库：https://github.com/cursor/plugins/tree/eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10/pstack
- 参考版本：0.15.30。
- 固定基线提交：eb4db2b55b2b7dec3d9282754cddf0a56bf4ff10。
- statechart 单独固定到 [076f4b2f57844ff9eb4ada914d4763884d40146e](https://github.com/cursor/plugins/tree/076f4b2f57844ff9eb4ada914d4763884d40146e/pstack/skills/statechart)，仅更新 `pstack/skills/statechart/**`，其他技能保持基线。原始脚本与测试逐字节生成；Pi 的 TLC 来源与 PNG 降级行为放在 `adapters/pi/statechart/`，SKILL.md 的宿主说明放在适配模板。
- `--png` 沿用上游按需安装 `pele@1.8.0`（MIT）与 `@resvg/resvg-js@2.6.2`（MPL-2.0）的方式，依赖位于用户缓存；它们及平台原生二进制不包含在此 npm 包。依赖许可随按需下载的包分发。
- 许可：MIT，Copyright (c) 2026 Lauren Tan。
- 许可原文：[LICENSES/pstack.txt](LICENSES/pstack.txt)。

当前已导入并适配 55 个技能、23 份流程以及 2 个上游代理定义（及派生/角色代理），原始材料位于 upstream/pstack/。具体来源、文件指纹及差异见 [首批移植记录](docs/port-status.md)、[源文件清单](docs/source-files.json) 与 [逐项映射](docs/port-map.json)。保留 Lauren Tan 的原始版权与 MIT 许可。

## cursor-team-kit

- 作者与版权：Copyright (c) 2026 Cursor。
- 官方来源：https://github.com/cursor/plugins/tree/f713f14203cd6420cec13cd7c55c32d598dbab68/cursor-team-kit
- 参考技能：deslop、control-cli、control-ui。
- 许可：MIT，原文见 [LICENSES/cursor-team-kit.txt](LICENSES/cursor-team-kit.txt)。
- 当前已核实替代路线并记录来源，尚未导入这些技能实现。未来改编时保留版权与许可。

pi-pstack 是本次独立移植项目的工作名，不表示 Cursor 或 pstack 作者的官方支持。本项目新增代码采用 [MIT](LICENSE)，上游部分继续保留原作者版权及 MIT 声明。本声明不改变上游许可。
