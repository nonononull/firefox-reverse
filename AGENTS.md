# 项目执行边界

- 全程使用中文；构建与验证以 `build.md` 为准，排错先查 `err.md`。
- Issue #1 只修复 Agent 侧栏的多窗口 thread 路由，不发布或安装 Firefox。
- 生产代码只允许修改 `AgentPanel.jsx`；不得修改 `AgentSession.sys.mjs`、`ConversationStore.sys.mjs`、工具路由、存储格式或公共 API。
- 固定验收：外部运行 thread 不自动/点击接管；提示条新建 thread；同 thread 仍单窗口独占；不同 thread 仍可并行。
- 失去面板内存状态或重挂载后，对运行中的 thread 失败关闭并显示外部任务提示，不新增 run epoch、generation、claim 或恢复 journal。
- 测试只覆盖上述合同并复用现有 reservation 自测；不得为外围竞态增加生产机制。
- 独立审查只检查本次 changed surface。超出固定合同的观察项登记为后续 Issue，不得扩张当前 PR。
- 不修改 Reverse Lab、Pingbo、Bet365、账号、live origin、已安装浏览器或公开上游。
