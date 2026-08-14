# 排错记录

## 2026-08-14：多窗口修复被外围并发审查带偏

- 取证时间：`2026-08-14 18:29:10 +08:00`。
- 现象：旧分支累计 70 个提交、6403 行新增，范围从 UI 路由扩展到 reservation 代际、run epoch、ConversationStore journal 和恢复协议。
- 根因：每轮 reviewer 可把相邻并发或持久化观察项升级为当前阻塞项，没有固定 changed-surface 停止规则。
- 纠正：旧分支及 PR #2 原样保留；本 worktree 从 `7a77a66` 重建，只允许修改 `AgentPanel.jsx`、一个聚焦合同自测和聚合入口。
- 禁止：不得复制旧分支的 generation、claim、runEpoch、mutation queue、recovery sidecar 或 schema 校验实现。
- 复审：超出四条固定验收的观察项只能进入后续 Issue，不能扩大当前 PR。
