# dsh-fold-delete

[English](README.en.md) · DeepSeek Harness 插件 · MIT

两件小事：**折叠较早的消息**和**彻底删除一个会话**。

## 折叠

打开长对话时只显示最近 N 条（默认 20，可改 5–200），更早的收起来；
对话顶部会出现一个浮动按钮，点一次多显示一批，也可以「全部展开」。

- 思考过程和工具调用**不计入条数**
- 只隐藏、不删除：折叠是靠给 DOM 加一个我们自己定义的属性
  （`data-dsh-fold-delete`）实现的，消息节点仍在，随时可以展开
- 切换会话、新消息到达后会自动重新计算

## 删除

删除入口按 DSH 版本自动切换，同一份代码两种界面都能用：

- **新版（0.2.3+）**：鼠标移到侧边栏的会话行上，行尾出现垃圾桶按钮（新版侧边栏已经没有 ⋮ 菜单）
- **旧版（0.2.2 及更早）**：会话右键菜单 →「删除会话」

点按钮 → 弹窗里勾选「我已了解」→「确认删除」。删除会做这些事：

1. 停掉正在运行的 agent，把缓冲的消息 flush 到磁盘
2. 把会话从 host 的内存 store 里摘掉，触发 `session/disposed`，
   官方 session-controller 据此广播 `api-session/removed` —— **少了这一步，刷新后会话会回来**
3. 删掉会话目录（兼容 `session-<uuid>` 和裸 `<uuid>` 两种命名）；
   持久化 writer 是异步关闭的，所以等它安静下来再删，必要时补删第二遍
4. 删掉投影缓存 `storages/session_projcache/sessions/<id>.json`
5. 从 `workspace.json` 的 archived / pinned / 每个工作区的 `sessionIds` 里摘掉
6. 顺手删掉被清空的父级目录

**不可恢复**，所以要求二次确认。

## 主题适配

弹窗、行内按钮和设置面板全部使用 DSH 主题 token
（`--dsw-alias-bg-layer-2`、`--dsw-alias-label-primary/secondary/tertiary`、
`--dsw-alias-border-l`、`--dsw-alias-bg-mask-1`、`--dsw-mask-blur`、
`--dsw-elevation-prominent`、`--dsw-radius-*`、`--dsw-alias-state-error-primary`），
浅色 / 深色 / 跟随系统切换时自动同步，不再写死两套色板。

## 兼容性

| DSH 版本 | 删除入口 | 用到的插槽 |
| --- | --- | --- |
| 0.2.3+ | 会话行 hover 的垃圾桶按钮 | `sidebar.workspaces.session.row.action` |
| 0.2.0 – 0.2.2 | 会话右键菜单 | `sidebar.workspaces.session.menu.item` |

两个插槽同时注册，当前版本没有的那个会被安全跳过（`engines.dsh: >=0.2.0`）。

## 安装

### 方式一：插件市场（推荐）

在 dsh 的「插件市场」里搜索包名直接安装。

### 方式二：Release 压缩包

```bash
dsh plugin --profile web add ./dsh-fold-delete-1.2.0.tgz
```

### 方式三：手动装到 profile

```bash
# 1. 复制到 profile 的 vendor 目录
cp -r dsh-fold-delete ~/.dsh/profiles/web/vendor/dsh-fold-delete

# 2. 在 profile 的 package.json 里加一条依赖（file: 指向 vendor）
#    "dependencies": { "dsh-fold-delete": "file:./vendor/dsh-fold-delete" }

# 3. 装依赖并重启
cd ~/.dsh/profiles/web && pnpm install && dsh web
```

## 卸载

从 `package.json` 的 `dependencies` 和 `dsh.profile.bundles` 里删掉 `dsh-fold-delete`，
再 `pnpm install` 重启即可；插件本身不写任何业务数据。

## 许可证

MIT

---

## 关于 AIGC

> 项目包含 AIGC 内容，AI 减少了开发时间；我们也认真审核了每一条代码。
