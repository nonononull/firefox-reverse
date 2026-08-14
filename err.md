# 排错记录

## 2026-08-14：多窗口修复被外围并发审查带偏

- 取证时间：`2026-08-14 18:29:10 +08:00`。
- 现象：旧分支累计 70 个提交、6403 行新增，范围从 UI 路由扩展到 reservation 代际、run epoch、ConversationStore journal 和恢复协议。
- 根因：每轮 reviewer 可把相邻并发或持久化观察项升级为当前阻塞项，没有固定 changed-surface 停止规则。
- 纠正：旧分支及 PR #2 原样保留；本 worktree 从 `7a77a66` 重建，只允许修改 `AgentPanel.jsx`、一个聚焦合同自测和聚合入口。
- 禁止：不得复制旧分支的 generation、claim、runEpoch、mutation queue、recovery sidecar 或 schema 校验实现。
- 复审：超出四条固定验收的观察项只能进入后续 Issue，不能扩大当前 PR。

## 2026-08-14：最小路由实现验证

- 取证时间：`2026-08-14 18:42:22 +08:00`。
- 红测：60 行路由合同在基线首先因初始化未排除 running thread 而失败。
- 修复：`AgentPanel.jsx` 生产差异 `+33/-69`；删除自动跟随和重挂载自愈，只增加初始化、发送、历史打开和新建认领的失败关闭。
- 验证：实现提交 `426193d211255bf2e6c3e45ab796f3481554705a` 通过 bundle、13/13 自测、branding 22、lockfile 和最小范围检查。
- 审计：官方 registry 无 high/critical；既有 dev-only esbuild moderate 需要 breaking upgrade，本任务不升级依赖。
- 边界：`AgentSession.sys.mjs`、`ConversationStore.sys.mjs`、Firefox 运行态和其它仓库均未修改。
