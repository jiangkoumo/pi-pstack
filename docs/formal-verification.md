# 形式化验证（TLA+/TLC）

## 安装 TLC（Java 11+ 与 tla2tools.jar）

TLA+ 模型检查（TLC）是可选能力：本包不打包、也不自动下载 Java 或 `tla2tools.jar`，缺少它们时其余功能照常工作。

- **Java 11+**：扩展用 `java -version` 探测版本，低于 11 视为不可用（例如 `1.8.0_x` 会被拒绝）。
- **tla2tools.jar**：从 TLA+ 官方发布页 <https://github.com/tlaplus/tlaplus/releases> 取得（上游 `statechart` 技能脚本使用同一来源），由操作者自行保存。
- **配置 jar 路径**（只认显式声明，不做猜测）：
  - 环境变量 `TLA2TOOLS_JAR=/absolute/path/to/tla2tools.jar`（兼容上游脚本使用的 `TLA2TOOLS`）；或
  - `pstack.json` 中的 `{"version": 1, "roles": {}, "tla": {"tla2toolsJar": "/absolute/path/to/tla2tools.jar"}}`。
  - 两处声明不同路径时会被拒绝，而不是任选其一；相对路径会被拒绝。
- **受限执行**：通过 `verification_exec` 的结构化入口 `{"command":"tlc","spec":"models/Spec.tla","config":"models/Spec.cfg","options":["-cleanup","-noGenerateSpecTE","-noGenerateSpecTEBin"]}` 调用。只能启动已配置的那一个 jar，只接受仓库内的 `.tla` 与 `.cfg` 路径（按真实路径解析，拒绝 `..` 和符号链接越界）以及白名单 TLC 选项：`-cleanup`、`-nowarning`、`-deadlock`、`-continue`、`-difftrace`、`-noGenerateSpecTE`、`-noGenerateSpecTEBin`、`-workers <n|auto>`、`-depth <n>`、`-seed <n>`、`-coverage <n>`；`.cfg` 由请求的 `config` 字段给出（选项里的 `-config` 不被接受）。其他任何 java 调用一律拒绝。
- **执行边界**：沿用 `verification_exec` 的规则（有 OS 沙箱时在其中运行，否则在临时 Git 工作区降级运行并明确标注），并使用同一超时与输出截断上限；TLC 的状态目录（`-metadir`）与 `java.io.tmpdir` 都指向私有 scratch 目录，仓库保持只读。
- **缺少 TLC 时**：结果明确写「未做形式化验证，原因是缺少 TLC」，并给出上游的 no-verifier fallback——用生成式输入测试真实代码，而不是函数的手工模型。该 fallback 只能报告为生成式测试覆盖，**不能**算作 formal pass。
- **状态与 CI**：`/setup-pstack status` 与 `/poteto status` 的 `tlc` 字段展示 Java、jar 和 fallback 探测结果。用户配置位于 Pi agent 目录的 `pstack.json`，项目配置位于 `.pi/pstack.json`；可信项目的 jar 设置覆盖用户设置。CI 不安装 Java、也不提交 jar，真实 TLC 的可选测试会打印跳过原因（`SKIPPED real TLC: 未做形式化验证，原因是缺少 TLC ...`）；设置 `PSTACK_TLC_REQUIRE=1` 可让缺少 TLC 直接失败。需要真实运行的环境自行配置上述 jar，再执行 `node --test scripts/verification-exec.test.mjs`。

本机真实验收使用 Java 21.0.11 与官方 [v1.8.0](https://github.com/tlaplus/tlaplus/releases/tag/v1.8.0) jar（GitHub 标记为预发布版，内部标识为 `TLC2 Version 2026.10.20.183001`，rev `d2e1472`，SHA-256 `5bd7b64db99ae4c6c35f290de5e809c0ee41af43f8699cf696099ffb6452b1e2`）：最小模型通过，违反不变量返回 12，前台/后台 verifier 均在 OS 沙箱内执行。旧的 OutputFolder 示例已随上游 `076f4b2f` 删除；statechart 的真实出图验收改用 CoverGap 回归，见 [statechart 同步验收](validation-statechart-sync.md)。该版本默认往模型目录生成反例探索文件；仓库只读时需传 `-noGenerateSpecTE` 与 `-noGenerateSpecTEBin`，文本反例仍保留。官方稳定版 v1.7.4 在当前 macOS 禁网沙箱内因内部 RMI 监听失败而未通过；不能仅凭能力探测可用就宣称该组合兼容。

## TLC 版本敏感性
statechart 快照已包含上游 #776 对 TLC 1.8.0 的测试修复，旧的第 55 条断言敏感性不再由本项目绕过或改写。未配置 jar 时，需要 TLC 的用例仍以原因跳过；配置真实 jar 时的结果以 [statechart 同步验收](validation-statechart-sync.md) 的实际记录为准。

版本、校验值与命令详见 [真实 TLC 验收](validation-stage-b-tlc.md)。

## 完成门与续跑预算

生成或维护项目形式化验证技能时，完成门会从 `SKILL.md` 所属项目根目录执行 `## Run it` 中标为 `sh` / `bash` 的代码块；每条命令限时 30 秒，超时终止进程组，输出按流限制为 128 KiB。无语言标记或 `text` 的预期输出块不作为命令。命令可以包含 shell 引号、环境变量及组合语法。TLC 使用同一受限后端，记录为独立一行的 JSON 调用，例如：

```text
verification_exec {"command":"tlc","spec":"models/Spec.tla","config":"models/Spec.cfg","options":["-cleanup","-noGenerateSpecTE","-noGenerateSpecTEBin"]}
```

项目 `.pi/pstack.json` 或用户 `pstack.json` 可以配置 `"autoContinue":{"enabled":true,"maxTurns":3}`（与 `version:1`、`roles:{}` 同级，轮数范围 1–10）。形式化门共用这个 `maxTurns` 配置，默认最多 3 轮检查；连续两次缺项完全相同会提前停止。停止时只追加一次最终报告提示，列出“未验证”项，然后结束本次请求；不会把预算耗尽视为验证通过。新的用户消息会重置预算；历史技能引用不会单独触发新请求。缺 TLC 或配置无法读取时，最终提示会列出阻塞原因。`enabled` 控制普通 auto-continue，形式化门仍独立执行自身检查；活动 `/loop` 会让位给形式化门的续跑与停止决定。
