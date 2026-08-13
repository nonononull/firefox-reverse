# 排错记录

## 2026-08-13：Windows Bash 在 CRLF 脚本入口失败

- 取证时间：`2026-08-13 19:00:14 +08:00`。
- 现象：直接执行 `bash scripts/selftest-agent-tools.sh` 时，Bash 在测试开始前解析失败。
- 根因：本仓 `core.autocrlf=true`，工作树中的现有 `.sh` 为 CRLF；失败发生在入口，不代表任一 Node 自测或侧栏构建失败。
- 处理：使用 Git 索引/提交中的规范化 LF 内容建立临时 runner，或按 `build.md` 逐项执行同一 build、自测和 branding 列表。
- 禁止：不得为本任务批量改写全仓换行，也不得把入口失败记成产品回归。

## 2026-08-13：PowerShell 路径和 stash 引用需要显式保护

- 取证时间：`2026-08-13 19:00:14 +08:00`。
- 现象一：一次由编排层构造的 Windows 路径被转义错误，测试没有启动。
- 现象二：`git stash pop stash@{0}` 被 PowerShell 解释，Git 收到错误参数并报告 `unknown switch 'e'`。
- 处理：外部 Bash 命令使用正斜杠绝对路径；stash 引用写为 `git stash pop 'stash@{0}'`。
- 验证：恢复后不能直接比较工作树 SHA-256，因为 checkout 会做 LF/CRLF 转换；使用 `git hash-object --path=<path> <path>` 与 stash blob 对比规范化内容。

## 2026-08-13：新 fork 缺少本仓 Git 作者身份

- 取证时间：`2026-08-13 19:00:14 +08:00`。
- 现象：首次提交报告 `Author identity unknown`。
- 根因：新 fork 没有 local `user.name`/`user.email`，全局配置也为空。
- 处理：从已验证的 `paseo-reverse-lab-mcp` 本仓配置读取 owner 身份，只在本 fork 设置 `nonononull <wangliuliu0214@gmail.com>`；不修改全局 Git 配置。
- 验证：治理提交 `3196d7f` 成功，且只包含两份 bootstrap 文件。

## 2026-08-13：项目本地 runtime workflow 需要干净批准快照

- 取证时间：`2026-08-13 19:00:14 +08:00`。
- 现象：AGOS `start-project-workflow.ps1` 报 `project-local approved snapshot must be clean before runtime or source admission`。
- 根因：中断前已存在三个未提交功能文件，治理 bootstrap 虽已提交，但工作树不干净。
- 处理：对精确三个功能文件建立带路径 Git stash，生成并提交 runtime workflow 后再恢复；恢复后以 stash blob 对比确认规范化内容一致。
- 边界：不得用 reset/checkout 丢弃现有实现，也不得把功能文件夹带进治理 bootstrap 提交。

## 2026-08-13：Windows 上的两个 Bash 聚合入口均不适用

- 取证时间：`2026-08-13 19:04:55 +08:00`。
- WSL 入口：正确挂载路径为 `/mnt/d/...`，但 WSL Node 需要 `@esbuild/linux-x64`，当前 `node_modules` 是 Windows `@esbuild/win32-x64`；构建在 esbuild 平台检查处终止，未运行 13 个 Node 自测。
- Git Bash 入口：能识别 Windows Node 22，但 NVM4W 的 npm shell shim 调用 Windows npm CLI 时报告 `"node" is not recognized`；同样在 bundle 构建处终止。
- 处理：Windows 正式门禁使用 `build.md` 的 PowerShell 固定列表；它已在同一工作树完成 bundle、13/13 自测文件和 branding 检查。
- 清理：两次临时 runner 均由 `finally` 删除，工作树没有遗留临时脚本。
- 禁止：不得为让 WSL 通过而在同一工作树重装 Linux `node_modules`，这会破坏 Windows 验证依赖；不得把入口兼容错误记为产品断言失败。

## 2026-08-13：新 thread 在持久化与认领之间可被其它窗口抢占

- 取证时间：`2026-08-13 19:50:40 +08:00`。
- 现象：exact-head reviewer 在 `ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e` 上返回 `REQUEST_CHANGES`。`ConversationStore.createThread()` 先把 thread 放入共享内存列表，创建窗口随后才调用 `AgentSession.acquireThread()`；另一窗口可在两步之间抢先认领，而创建窗口仍会忽略失败并绑定同一 thread。心跳返回 `false` 时也被忽略。
- 红测：扩展 `selftest-multi-window-routing.mjs` 后，旧实现因缺少统一有界认领入口而失败；测试同时覆盖首个 thread 被抢后第二个成功、连续三次失败后停止、不删除被抢 thread，以及 `renewThread()` 返回 `false`/抛错后的失权通知。
- 修复：`AgentPanel.jsx` 的初始化、`ensureThread()` 和 `newChat()` 统一使用最多三次的 `createOwnedThread()`；只有认领返回精确目标 ID 才绑定。心跳失权后先解除旧选择，再创建独立 thread，并用选择代际防止迟到恢复覆盖用户的新选择；发送前同步发现失权时保留输入并要求重新发送。
- 验证：实现提交 `b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1`、tree `549fb36b1b27f52f6002951484c76b1a076a3625` 上，`npm ci`、sidebar bundle `211.4kb`、13/13 Node 自测文件、thread reservation 22 项断言、branding 22 文件和 `git diff --check` 均通过。
- 边界：未修改 `AgentSession.sys.mjs`、底层 owner token/TTL/raw-tool 锁、浏览器安装包、Reverse Lab、Pingbo、Bet365、账号或 live；仓库无 PR workflow，本地门禁不能写成 CI 通过。

## 2026-08-13：迟到初始化和发送链可在失权后继续使用旧 thread

- 取证时间：`2026-08-13 22:11:10 +08:00`。
- 现象：独立 reviewer 对 `42ff472263174d7cba38b38577d4a8312bd4a2d5` 返回 `REQUEST_CHANGES`（P1=2、P2=3）。初始化只防卸载，不能防用户随后开始新对话或打开历史；发送在一次续约后跨多个 `await`，失权后仍可能写旧 thread 并启动；缺 reservation API 时仍失败开放；测试和最终治理证据也不充分。
- 红测：`selftest-multi-window-routing.mjs` 动态执行 reservation、selection revision、selection intent、pending 事务和精确 ID helper；同时锁定初始化、新对话、历史打开、失权恢复和发送链的调用顺序。相同 ID/revision 但 intent 已更新、错误非空 ID、`renewThread=false`/异常、旧事务结束清新 pending 等 mutation 均会失败。
- 修复：实现提交 `3f9f961c1728a9f735222667b139458b32fc0ea3`、tree `c102564f779c727f44d00e2632124d7bebe1c4d1` 为选择型操作增加有界 intent 事务；异步结果提交前核验 ID/revision/intent；发送每个异步阶段后重新续约，失权时不启动并保留输入；reservation API 不完整时失败关闭。迟到的新建 thread 主动释放，迟到历史认领不清除同 owner 的更新 reservation。
- 验证：源码冻结工作树执行 `npm ci`、sidebar bundle `215.0kb`、13/13 Node 自测文件、thread reservation 22 项断言、multi-window routing 动态合同、branding 22 文件、`git diff --check` 均通过；`AgentSession.sys.mjs` 与 `package-lock.json` 零改动。
- 边界：没有启动 Firefox、账号、live、Reverse Lab、Pingbo 或 Bet365；fork 仓库只有 `release.yml`，没有 pull request workflow，故该结果为本地门禁而非 CI。

## 2026-08-14：同 owner 旧挂载与历史删除缺少完整代际隔离

- 取证时间：`2026-08-14 00:00:49 +08:00`。
- 现象：独立 reviewer 对 `0937c0f43b78b8babd510563eaf4c8d8ddc49a39` 返回 `REQUEST_CHANGES`（P1=3、P2=1）。旧挂载与新挂载复用稳定 owner 时，迟到 release 可清除新 reservation；发送 A 失权时用户随后输入 B 会覆盖 A；历史删除不认领 reservation，可删除其它窗口运行中的 thread；关键竞态主要依赖源码正则。
- 红测：`selftest-thread-reservation.mjs` 直接提取并执行生产 `begin/acquire/renew/release/subscribe`，覆盖旧 generation 的迟到 acquire、renew、release 和 unsubscribe；`selftest-multi-window-routing.mjs` 动态覆盖无损输入合并、删除前运行态、独占认领、删除线性化前失权及旧挂载创建前拒绝；`selftest-conversations.mjs` 验证缺 guard 或 `_load()` 后 guard 失败均保留原线程。
- 修复：`AgentSession` 为稳定 owner 维护权威 generation，reservation 精确绑定 `owner + generation`，旧 generation 全部失败关闭；订阅退订不再隐式清 reservation。`AgentPanel` 统一使用 generation-aware helper，发送失败以 `A\nB` 保留两段输入；历史删除先认领并复核运行态，随后把同步 ownership guard 传给 `ConversationStore.deleteThread()`，在实际过滤线程列表前再次验证。
- 验证：当前待提交工作树无重试执行 `npm ci` 和完整 PowerShell 门禁，sidebar bundle `216.4kb`、13/13 Node 自测文件、reservation 34 项断言、ConversationStore 15 项断言、multi-window routing 合同、branding 22 文件及 `git diff --check` 全部通过；`package-lock.json` 未变化，bundle 仍由 `.gitignore` 排除。该证据尚未替代 fresh exact-head reviewer。
- 边界：`AgentSession.run()`、`callTool()`、每 thread sessions map 与 raw-tool 全局锁未修改；未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。
