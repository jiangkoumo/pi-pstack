# 阶段 B：本机真实 TLC 环境与验收

用户明确授权搭建 TLC 验证所需环境。复用本机 Homebrew OpenJDK 21.0.11；未安装其他 Java，未修改全局 Pi 配置或 shell 启动文件，未将 jar 放进仓库/npm 包。

## 安装与启用

官方 GitHub release API `gh api repos/tlaplus/tlaplus/releases/latest` 返回稳定版 v1.7.4；release 列表另列 v1.8.0，prerelease=true。下载来源均为 https://github.com/tlaplus/tlaplus/releases 。本次用于通过验收的是 v1.8.0，不将它误称为稳定版。

| 文件 | SHA-256 | 依据 |
| --- | --- | --- |
| `~/.local/share/tlaplus/1.8.0/tla2tools.jar` | `5bd7b64db99ae4c6c35f290de5e809c0ee41af43f8699cf696099ffb6452b1e2` | shasum 实测，与 GitHub asset digest 一致 |
| `~/.local/share/tlaplus/1.7.4/tla2tools.jar` | `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` | shasum 实测；release asset 无公开 digest，不能宣称独立校验一致 |

`~/.local/share/tlaplus/env.sh` 为本机操作者环境文件。新终端显式执行：

```sh
source ~/.local/share/tlaplus/env.sh
```

然后从该终端启动 Pi 或运行检查。当前已运行的 Pi 父进程不会自动继承此变量；测试命令均显式设置变量。也可按 README 将 jar 路径写入用户/可信项目 pstack.json；本次没有修改现有用户配置。

## 真实运行发现与修复

1. v1.7.4：最小模型在 macOS seatbelt 禁网沙箱里失败，内部 FPSet 继承 RMI UnicastRemoteObject，启动监听报 `java.rmi.server.ExportException` / `Operation not permitted`。不放宽沙箱；该组合未验收通过。
2. v1.8.0：正确模型通过，但不变量失败后默认生成 `_TTrace` 文件到只读模型目录，附加写入又产生 postcondition 错误。依据官方 v1.8.0 TLC.java 的参数解析和本机 help，白名单增加两个关闭附加生成的布尔开关 `-noGenerateSpecTE`、`-noGenerateSpecTEBin`。未授权任意输出路径或 Java 选项。
3. 增加真实前后台 child 覆盖，均通过已注册的 verification_exec `command="tlc"` 结构化参数执行。真实场景各拥有独立宿主测试进程，避免 detached registry 跨场景状态串用；测试进程移除 Node 内部 NODE_TEST_CONTEXT 后运行明确 TAP reporter，不能把“未选择到用例”当通过。

## 本次实际验证

命令：

```sh
TLA2TOOLS_JAR="$HOME/.local/share/tlaplus/1.8.0/tla2tools.jar" PSTACK_TLC_REQUIRE=1 PSTACK_VERIFY_REQUIRE_SANDBOX=1 node --test scripts/verification-exec.test.mjs scripts/verifier-child.test.mjs
```

退出码 0，40 tests / 40 pass / 0 fail / 0 skipped。最小模型：status=passed、exitCode=0、isolation=os-sandbox；违规模型：status=failed、exitCode=12、outcome=invariant-violated、isolation=os-sandbox。前台/后台 verifier 均观察到通过与失败，保留其他 Java、写入和推送拒绝测试。模型协议由本地 fixture 驱动，Java/TLC 和 verifier 进程及沙箱执行是真实的，不是 java stub；不是外部真实模型自主选择验证步骤的证明。

全量 `TLA2TOOLS_JAR="$HOME/.local/share/tlaplus/1.8.0/tla2tools.jar" PSTACK_TLC_REQUIRE=1 npm test`：exit 0，33/33 检查，76425ms。隐藏 jar 后 `env -u TLA2TOOLS_JAR -u TLA2TOOLS -u PSTACK_TLC_REQUIRE node --test scripts/verification-exec.test.mjs scripts/verifier-child.test.mjs`：exit 0，37 pass / 0 fail / 3 明确 skip，三个真实 TLC 场景均输出原因。`node scripts/generate-pi-resources.mjs --check`：exit 0，117 项；`git diff --check`：exit 0。独立 reviewer 在 Herdr w1D:p1 只读复核，无阻断问题。

尚未执行：p-queue 上生成项目 verify 技能并对真实代码变异；B2–B4 技能尚待第二批移植；OutputFolder 出图尚待 B4。环境就绪与本次最小性质验收不替代这些端到端验收。
