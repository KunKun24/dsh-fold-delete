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

会话右键菜单 → 「删除会话」→ 勾选确认 → 永久删除。

删除会做四件事：

1. 停掉可能还在跑的会话（flush + dispose）
2. 删掉会话目录（兼容 `session-<uuid>` 和裸 `<uuid>` 两种命名）
3. 从 workspace 索引里摘掉
4. 通知前端刷新列表

**不可恢复**，所以要求二次确认。

## 主题适配

弹窗按页面真实背景亮度判断亮/暗配色，浅色下是白卡片、深色下是深卡片。
（dsh 没有 `--dsw-alias-bg-primary` 这个变量，直接写它会永远落到深色兜底。）

## 安装

### 方式一：插件市场（推荐）

在 dsh 的「插件市场」里搜索包名直接安装。

### 方式二：Release 压缩包

```bash
dsh plugin --profile web add ./dsh-fold-delete-1.0.0.tgz
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
