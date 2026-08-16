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

## 2026-08-16：env_close 在未确认退出时伪造 stopped

- 取证时间：`2026-08-16 17:53:13 +08:00`。
- 现象：`close()` 在 `_terminatePid()` 返回 `ok:false` 后仍无条件写入 `stopped/pid=null`；本地 `_procs` 分支在进程仍 alive 或探测 unknown 时也会删除句柄、drain 与输出尾部并返回成功。
- RED：最终 `selftest-environment.mjs` 通过内存加载治理提交 `96ad3526cc201f49512661fa83e4df8ca54d3793` 的旧生产模块，稳定得到 `AssertionError: Missing expected rejection` 与 `BASELINE_MUTATION_RED_CONFIRMED`。命中的是本地 Firefox 已启动、终止未确认却未抛错的旧控制流。
- 修复：`close()` 先落盘 `closing` 与可用 PID；只有本地句柄或 `_terminatePid()` 明确确认死亡后才清理所有权记录并发布 stopped。失败时抛错且保留原 PID 与三张进程表。`_terminatePid()` 在发信号前先接受已 dead，发信号失败后再复核一次；alive/unknown 均失败关闭。两份构建引用模块保持逐字一致。
- focused：最终环境自测通过；本地失败、持久化 PID 失败、dead/alive/unknown 和确认成功清理均为确定性 fake，不启动或终止真实进程。
- 测试纠错：首个 GREEN fake 提供了立即完成的 `wait()`，但 `Promise.race` 的 15 秒计时器仍保持 Node 事件循环，导致命令约 15.9 秒才退出。改为同义的“本地句柄无 wait、PID 仍 alive”交错后，最终 focused 约 0.7 秒通过，旧生产仍保持相同 RED。
- 命令纠错：一次 Windows `rg` 使用未展开的 `EnvironmentBackend*.sys.mjs` 参数，报告路径语法错误；随后改为两个显式文件路径并检查退出码，返回 `STATIC_FOCUSED_OK`。这不是产品断言失败。
- 待验证：完整轻量门禁、官方 audit、exact-head 独立审查、实现提交、push、PR 与 merge 均未完成，不得提前表述为交付完成。
- 边界：没有启动或修改 Firefox、Reverse Lab、lease、assignment、quarantine、runtime JSON、账号、live origin 或其它项目。
