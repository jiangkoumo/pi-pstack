# P4 打包与安装验收

状态：**本地打包、隔离安装、升级与卸载已通过；CI 尚未真实运行，npm 未发布，名称未核实。** 本文件只记录实际执行结果，不把“安装成功”当成行为验收。

对应计划项：[移植计划](migration-plan.md#p4打包与安装验收)。

## 已验证

### 1. 打包内容

`npm pack` 产出 `pi-pstack-0.1.0-alpha.1.tgz`：

| 项 | 值 |
| --- | --- |
| 文件数 | 143 |
| 大小 | 298,414 bytes |
| 必需文件 | `package.json`、扩展、11 个技能、2 个代理、适配层、`writer-gate.mjs`、`docs/validation-p3-writer.md`、`LICENSE`、`LICENSES/pstack.txt`、`THIRD_PARTY_NOTICES.md` |
| 禁止项 | 无 `node_modules/`、无 `.tgz`、无 `.git/` |
| 清单状态 | `private: true`，未发布 |

检查还要求 `package.json` 的 `files` 包含 `agents/`，`pi` 清单声明扩展、技能与 `subagents.agents`。

### 2. 隔离安装

在一次性 consumer 目录按 Pi 的包布局安装到 `.pi/npm/node_modules/pi-pstack`，用真实 Pi 1.3.0 的 `DefaultResourceLoader` 只注册该包：

- 扩展加载错误：0。
- 本包技能：11 个（环境里其他全局技能不计入）。
- 本包代理：`pstack.comment-sicko`、`pstack.poteto-agent`，`packageName: pstack`。
- 未写入用户全局 Pi 配置；agentDir 是临时目录。

### 3. 升级不覆盖用户配置

用同一个 tarball 覆盖安装（升级模拟），重新加载后：

- 技能集合不变；
- `pstack.json` 内容逐字不变；
- 用户 `settings.json` 的 `theme` 保持不变。

### 4. 卸载

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
  "tarball": { "entryCount": 143, "bytes": 298414, "required": 11 },
  "install": { "skills": 11, "agents": ["pstack.comment-sicko", "pstack.poteto-agent"], "extensionErrors": 0 },
  "upgrade": { "skillsUnchanged": true, "userConfigUnchanged": true, "settingsUnchanged": true },
  "uninstall": { "packageRemoved": true, "skills": [], "extensionErrors": 0, "userConfigPreserved": true }
}
```

`npm_config_cache` 是本机默认 npm cache 报 EPERM 时的临时绕行；该问题不是包失败，但会让默认复现命令失败。

## CI 配置

新增 `.github/workflows/check.yml`，在 Node 22 上运行 `npm run check` 与 `npm run check:generate`。**该工作流尚未真实执行**：仓库没有 GitHub 远端，也没有 CI 运行记录。不能把“已写 YAML”当成 CI 验收通过；需要远端后跑一次并记录结果。

host 级检查（`check:p3`、`check:p4`）需要本机 Pi 与 pi-subagents，未放进默认 CI。

## 支持版本与依赖

| 项 | 值 |
| --- | --- |
| Node | `>=22.19.0` |
| Pi | 实测 1.3.0；`pi` 清单声明扩展、技能、`subagents.agents` |
| pi-subagents | 可选，实测 0.79.0；缺失时核心技能与单代理流程仍可用 |
| 运行依赖 | 只有 Pi 宿主 peer dependencies：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent` |
| 模型 | 不内置供应商或默认模型；角色配置必须匹配操作者实际可用列表 |

## 尚未完成 / 不能宣称

1. **CI 未运行**：只有本地 YAML，无远端执行证据。
2. **npm 未发布**：包保持 `private: true`；npm 名称 `pi-pstack` 的可用性未核实，发布需要单独授权。
3. **安装方式是 Pi 包布局模拟**：用 tarball 解压到 `.pi/npm/node_modules` 并注册 `packages`，没有执行 `pi install` 的真实命令路径；加载器与真实 Pi 一致，但不声称覆盖 Pi 安装器的所有边界。
4. **未验证外部 registry 安装**：没有从 npm registry 拉取、校验签名或代理环境。
5. **未验证 Pi 升级/降级**：只在固定 1.3.0 上跑过；升级后行为变化仍需复验。
6. **未验证 Windows/非原生 worktree 的安装行为。**

## 后续

- 有远端后运行 CI 并记录真实结果。
- 需要发布时先确认名称、作用域、发布授权与 registry 凭证。
- Pi 或 pi-subagents 升级后重跑 `check`、`check:p3`、`check:p4`，记录版本差异。
