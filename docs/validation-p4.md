# P4 打包与安装验收

状态：**本地打包、真实 Pi 安装/移除、隔离加载、升级与卸载已通过；CI 尚未真实运行，npm 未发布，名称已被占用。** 本文件只记录实际执行结果，不把“安装成功”当成行为验收。

对应计划项：[移植计划](migration-plan.md#p4打包与安装验收)。

## 已验证

### 1. 打包内容

`npm pack` 产出 `jiangkoumo-pi-pstack-0.1.0-alpha.1.tgz`：

| 项 | 值 |
| --- | --- |
| 文件数 | 144 |
| 大小 | 约 300 KB（以 `npm pack` 输出为准） |
| 必需文件 | `package.json`、扩展、11 个技能、2 个代理、适配层、`writer-gate.mjs`、`docs/validation-p3-writer.md`、`LICENSE`、`LICENSES/pstack.txt`、`THIRD_PARTY_NOTICES.md` |
| 禁止项 | 无 `node_modules/`、无 `.tgz`、无 `.git/` |
| 清单状态 | `private: true`，未发布 |

检查还要求 `package.json` 的 `files` 包含 `agents/`，`pi` 清单声明扩展、技能与 `subagents.agents`。

### 2. 真实 Pi CLI 注册与移除

在隔离的 `PI_CODING_AGENT_DIR` 和临时项目中：

```bash
pi install <tarball> -l -a
# project .pi/settings.json: packages: [".../jiangkoumo-pi-pstack-0.1.0-alpha.1.tgz"]

pi remove <tarball> -l -a
# project .pi/settings.json: packages: []
```

`pi install` 对本地 tarball 是路径注册，不是从 registry 下载；它验证了 Pi 的安装/移除设置路径，不验证 registry 安装。

### 3. 隔离安装

在一次性 consumer 目录按 Pi 的包布局安装到 `.pi/npm/node_modules/@jiangkoumo/pi-pstack`，用真实 Pi 1.3.0 的 `DefaultResourceLoader` 只注册该包：

- 扩展加载错误：0。
- 本包技能：11 个（环境里其他全局技能不计入）。
- 本包代理：`pstack.comment-sicko`、`pstack.poteto-agent`，`packageName: pstack`。
- 未写入用户全局 Pi 配置；agentDir 是临时目录。

### 4. 升级不覆盖用户配置

用同一个 tarball 覆盖安装（升级模拟），重新加载后：

- 技能集合不变；
- `pstack.json` 内容逐字不变；
- 用户 `settings.json` 的 `theme` 保持不变。

### 5. 卸载

删除安装目录并从 `packages` 移除后重新加载：

- 本包技能为 0；
- 扩展加载错误为 0；
- `pstack.json` 仍在（卸载不删除用户配置），但不再被包自动加载；
- 安装目录不存在。

## 实际执行

```bash
PI_PSTACK_PI_ROOT=/Users/jiangkoumo/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent \
npm_config_cache=/tmp/pi-pstack-npm-cache \
node scripts/check-p4-install.mjs
# 退出码 0，status: passed
```

输出摘要：

```json
{
  "status": "passed",
  "tarball": { "entryCount": 144, "required": 11 },
  "install": { "skills": 11, "agents": ["pstack.comment-sicko", "pstack.poteto-agent"], "extensionErrors": 0 },
  "upgrade": { "skillsUnchanged": true, "userConfigUnchanged": true, "settingsUnchanged": true },
  "uninstall": { "packageRemoved": true, "skills": [], "extensionErrors": 0, "userConfigPreserved": true },
  "cli": { "install": "registered", "remove": "removed", "projectSettings": [] }
}
```

`npm_config_cache` 是本机默认 npm cache 报 EPERM 时的临时绕行；该问题不是包失败，但会让默认复现命令失败。

## CI 配置

新增 `.github/workflows/check.yml`，在 Node 22 上运行 `npm run check` 与 `npm run check:generate`。

本地 CI-equivalent 已通过：`node scripts/check-ci-local.mjs` 把当前提交 clone 到一次性目录（只含已提交文件、工作树干净），再执行工作流里的两条命令：

```bash
node scripts/check-ci-local.mjs
# exit 0；npm run check 约 7.4s，npm run check:generate 约 0.15s
```

**但 GitHub Actions 仍未真实运行**：仓库没有远端，也没有 runner 记录。不能把“YAML 解析通过 + 本地等价命令通过”当成 GitHub CI 通过；需要远端后跑一次并记录结果。

host 级检查（`check:p3`、`check:p4`）需要本机 Pi 与 pi-subagents，未放进默认 CI。

## npm 名称

`npm view pi-pstack --json`（2026-10-19）返回已存在的 `pi-pstack@0.1.0`：

- maintainer：`kkgogogo17 <hello@ideaoverflow.dev>`
- 创建时间：2026-08-08
- 描述同样是 Pi 的 pstack 移植

因此 **`pi-pstack` 不是可用名称**。在发布前必须改名或使用作用域，并确认归属；本包继续保持 `private: true`，本次没有发布、没有联系 maintainer。

2026-10-19 只读查询的候选（404 表示当时未查到包，不等于永久可用）：

| 候选 | `npm view` 结果 |
| --- | --- |
| `@jiangkoumo/pi-pstack` | E404，未查到 |
| `@jiangkoumo/pstack` | E404，未查到 |
| `pi-pstack-port` | E404，未查到 |
| `pi-pstack-pi` | E404，未查到 |

已选定作用域名称为 `@jiangkoumo/pi-pstack`；包仍为 private，是否发布仍需单独授权。

## 支持版本与依赖

| 项 | 值 |
| --- | --- |
| Node | `>=22.19.0` |
| Pi | 实测 1.3.0；`pi` 清单声明扩展、技能、`subagents.agents` |
| pi-subagents | 可选，实测 0.79.0；缺失时核心技能与单代理流程仍可用 |
| 运行依赖 | 只有 Pi 宿主 peer dependencies：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent` |
| 模型 | 不内置供应商或默认模型；角色配置必须匹配操作者实际可用列表 |

## 尚未完成 / 不能宣称

1. **GitHub CI 未运行**：工作流 YAML 有效，本地 clean-clone 等价命令通过，但没有远端 runner 执行证据。
2. **npm 未发布**：包名已改为 `@jiangkoumo/pi-pstack`，仍保持 `private: true`；registry 上的 `pi-pstack@0.1.0` 未被使用。发布前需确认 scope 归属并取得授权。
3. **本地安装是路径注册**：`pi install <tarball> -l` 只把 tarball 路径写进项目设置；资源发现测试另行把 tarball 解压到 `.pi/npm/node_modules` 并用真实 Pi loader 加载。没有验证 registry 下载、完整性校验或代理环境。
4. **未验证外部 registry 安装**：没有从 npm registry 拉取、校验签名或代理环境。
5. **未验证 Pi 升级/降级**：只在固定 1.3.0 上跑过；升级后行为变化仍需复验。
6. **未验证 Windows/非原生 worktree 的安装行为。**

## 后续

- 有远端后运行 CI 并记录真实结果。
- 需要发布时先确认名称、作用域、发布授权与 registry 凭证。
- Pi 或 pi-subagents 升级后重跑 `check`、`check:p3`、`check:p4`，记录版本差异。
