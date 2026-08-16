# 项目执行边界

- 全程使用中文；构建与验证以 `build.md` 为准，排错先查 `err.md`。

## 当前任务：Issue #6 多窗口工作目录隔离

- 只修复会话已捕获的 `{ workspaceRoot, win }` 在异步与组合后端中丢失的问题，不发布或安装 Firefox。
- 生产代码只允许修改 `AgentPanel.jsx`、`AgentSession.sys.mjs`、`WorkspaceBackend.sys.mjs`、`CodeBackend.sys.mjs`、`Backends.sys.mjs`、`ScriptsBackend.sys.mjs` 与 `JsvmpBackend.sys.mjs`。
- 显式携带 `workspaceRoot` 的会话必须始终使用该值；显式值为 `null` 时文件操作失败关闭。完全未提供 ctx 的旧直驱调用保留全局后备兼容行为。
- 固定验收覆盖 notes 自动注入、`find_param_entry`、scripts 列举/短名保存/批量抓取、JSVMP 自动镜像，以及直接 fs/run 对照组；新自测必须接入 Windows 与 Unix 聚合列表。
- `AgentSession.callTool()` 只允许修正省略 `workspaceRoot` 与显式 `null` 的 ctx 所有权；不修改 `ConversationStore.sys.mjs`、ToolRouter 公共合同、thread reservation、存储格式或公共 API；共享 profile 脚本语料库保持现状。
- 先以 A 阻塞、B 切换 fallback、再恢复 A 的确定性交错证明旧实现 RED；修复后跑 focused gate 和一次完整 Windows 轻量门禁。
- 不恢复、重放或合并已关闭 PR #2 的长分支；Issue #1 的路由合同继续由现有回归保护。
- 不修改 Reverse Lab、Pingbo、Bet365、账号、live origin、已安装浏览器或公开上游。

## 历史任务

- Issue #1 与 Issue #4 已关闭；其任务控制文档只作为历史证据，不能覆盖 Issue #6。
