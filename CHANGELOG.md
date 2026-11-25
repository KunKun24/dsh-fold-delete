# Changelog

## Unreleased

- 文档：统一 README 模板（中英双语、assets/demo.gif 演示、功能 / 安装 / 配置 / 限制 / 隐私 / 版本作者）。

## 1.2.1 — 2026-11-24

行内删除按钮的 hover 样式与官方图标按钮统一。

### 修复

- 悬停时不再变成红色图标 + 红色底（与侧边栏官方的收纳 / 图钉按钮不一致，显得突兀）；
  现在和官方 `Rows.module.css .iconButton` 完全一致：hover 只做 `--dsw-alias-label-tertiary`
  → `--dsw-alias-label-primary` 的文字色过渡，无背景色
- 补齐官方同款 `focus-visible` 内缩焦点环（`outline-offset: -2px`）与 `box-sizing: border-box`

## 1.2.0 — 2026-11-24

适配 DSH 0.2.3 的新侧边栏，并修掉「删了刷新又回来」。

### 新增

- 会话行 hover 时行尾出现「删除会话」图标按钮，注册到
  `sidebar.workspaces.session.row.action`（0.2.3+ 的侧边栏没有 ⋮ 菜单了）
- `engines.dsh: >=0.2.0`，让插件管理器用版本范围而不是 peer 规则判断兼容性

### 修复

- **删除后刷新会话又回来**：旧实现只删磁盘文件，会话仍留在 host 的内存 store 里，
  而会话列表优先列 live 会话。现在先 detach（移出 store 并派发 `session/disposed`，
  官方 session-controller 会广播 `api-session/removed`），再删磁盘
- 删除前先取消正在运行的 agent 并 flush，避免删除过程中又有事件写盘
- 持久化 writer 是异步关闭的：删目录前等文件安静下来，writer 若是把尾部写回来再补删一次
- `workspace.json` 的清理只遍历了一层，`tables.workspaces` 下的 `sessionIds` 从来没被清过
- 删除后顺手清掉被清空的父级目录（工作区 slug 目录不再残留空壳）

### 改进

- 弹窗、行内按钮、设置面板改用 DSH 主题 token（`--dsw-alias-bg-layer-2`、
  `--dsw-alias-label-*`、`--dsw-alias-border-l`、`--dsw-alias-bg-mask-1`、
  `--dsw-mask-blur`、`--dsw-elevation-prominent`、`--dsw-radius-*`），
  跟随浅色 / 深色 / 跟随系统，不再按背景亮度猜两套写死的色板
- 之前写错的 token 名（`--dsw-alias-text-secondary`、`--dsw-alias-border-secondary`）
  改成真实存在的 `--dsw-alias-label-secondary`、`--dsw-alias-border-l`
- 插槽注册失败不再影响其它插槽（旧版本 DSH 上缺少 `session.row.action` 也能正常加载）

### 兼容

- 删除入口两套并存：0.2.3+ 用行内按钮，0.2.0–0.2.2 仍走右键菜单，缺失的插槽会被跳过

## 1.1.0 — 2026-11-12

- 设置页底部增加「觉得好用点个 Star」入口

## 1.0.0 — 2026-11-11

- 首个开源版本：折叠较早消息（默认 20 条，5–200）、彻底删除会话、二次确认弹窗
