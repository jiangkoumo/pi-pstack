# authoring-a-skill 移植验证

固定上游：`f713f14203cd6420cec13cd7c55c32d598dbab68`（pstack 0.15.25）。分支基线：`2dbf49b`。Node `v22.22.2`，npm `10.9.7`。

## 改动

- `adapters/pi/overrides/skills/poteto-mode/playbooks/authoring-a-skill.md.template` → `skills/poteto-mode/playbooks/authoring-a-skill.md`（`npm run generate` 生成）。
- 上游 4 个步骤、写作取舍和 reply 保留。替换项：
  - Cursor 内置 `create-skill` → Pi 安装包的 `docs/skills.md` 作者契约。
  - 引用的技能/原则路径改为 Pi 包内相对路径。
- 文末 `Pi adaptation` 增加：`.pi/skills/` 与 `~/.pi/agent/skills/` 的发现位置、frontmatter 字段与长度限制、`read`/`edit`/`write`、`node scripts/skill-authoring.mjs <skill-dir>` 结构校验、`/reload`、PR 授权门。

## 实际运行

结构校验器对已生成技能：

```text
$ node scripts/skill-authoring.mjs skills/recall
{
  "ok": true,
  "name": "recall",
  "errors": [],
  "links": [
    ".../adapters/pi/harness.md",
    ".../skills/poteto-mode/SKILL.md"
  ]
}
[exit 0]

$ node scripts/skill-authoring.mjs skills/automate-me
{
  "ok": true,
  "name": "automate-me",
  "errors": [],
  "links": []
}
[exit 0]
```

反向用例（来自 `node --test scripts/session-skills.test.mjs` 的 fixture）：目录名与 `name` 不一致、缺失相对链接、`../outside.md` 缺失，全部被拒绝；缺失 `SKILL.md` 也被拒绝。

```text
ok 6 - authoring validation accepts a portable skill and rejects broken structure
# tests 6
# pass 6
# fail 0
```

`npm run check:generate` 返回 `{"status":"passed","checked":116,"unmanaged":0}`。完整 `npm run check` 退出码 0，`check-package` 输出 `{"status":"passed","mapped":82,...,"dispositions":{"substitute":5,"ported":77},...}`。

## 保真度

去 `#### Pi adaptation` 后逐行 LCS：上游 8 个非空行，命中 7，**87.5%**。唯一未命中的行是第 1 步“Use the **create-skill** skill (Cursor's built-in for authoring SKILL.md files)”，按要求替换为 Pi 的 `docs/skills.md` 作者契约。

## 未验证

- 没有在真实仓库里走完“写一个新技能 → 验证 → 开 PR”的端到端流程；本轮验证的是契约可执行化后的结构校验与生成检查。
- 没有发布或推送，也没有修改操作者的全局 Pi 技能目录。
