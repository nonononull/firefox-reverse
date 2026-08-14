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

## 2026-08-14：异步存储边界仍允许失权写入与迟到资源泄漏

- 取证时间：`2026-08-14 01:59:12 +08:00`。
- 现象：独立 reviewer 对 `97252db1295e9209d8d2fa88d85c1d736214f227` 返回 `REQUEST_CHANGES`（P1=1、P2=4）。旧实现可在用户消息追加后、再次复核前失权并把同一文本恢复到输入框；迟到初始化/历史打开可能保留无心跳 reservation，创建失败可留下孤立 thread；模式写入也只在异步持久化后发现失权。关键生产交错仍主要由源码正则约束。
- 红测：三份自测直接执行生产 reservation、`ConversationStore` 与路由 helper，覆盖 claim 代际、迟到创建/读取、错误非空 acquire ID、提交前失权零写入、消息与启动的同步提交、模式/目录/删除 guard 和保存失败语义。
- 修复：实现 checkpoint `c9eca650fa0ce8a0ce40dbe09da39f78ce0d8e4d`、tree `f536dc22379ef2f7b9c7f2470a14d9bdf19fa611` 将 reservation 加固为 `owner + generation + monotonic claim`；`ConversationStore` 在实际修改前同步校验 ownership。用户消息追加与 `session.run()` 位于同一无 `await` 提交区间；迟到资源按精确 claim 清理或移交；模式、工作目录和删除均在存储修改前失败关闭。
- 验证：源码 checkpoint 后无重试执行 `npm ci` 和完整 PowerShell 门禁，sidebar bundle `218.5kb`、13/13 Node 自测文件、thread reservation 43 项断言、ConversationStore 26/26、multi-window routing 动态合同、branding 22 文件及 `git diff --check` 全部通过。该证据仍需绑定后续治理提交并接受 fresh exact-head reviewer。
- 边界：`AgentSession.run()`、`callTool()`、每 thread sessions map 与 raw-tool 全局锁未修改；没有启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。仓库没有 PR workflow，不能把本地门禁写成 CI 通过。

## 2026-08-14：claim 只在单 thread 比较且配置保存失败未回滚

- 取证时间：`2026-08-14 03:21:47 +08:00`。
- 现象：fresh exact-head reviewer 对 `d16f88cea639895a4a60f773fd7d21986e6f95f7`、tree `8c6abf42ac8e27538ad8d4fa3410228478287aa8` 返回 `REQUEST_CHANGES`（P1=2、P2=1）。旧 claim 在更新 claim 跨 thread 发布或释放后仍可重新认领空目标；`setThreadMode()` / `setThreadWorkspace()` 在 `_save()` 失败后把失败值留在内存。reviewer 同时指出缺少这两类 mutation 以及 `session.run()` 抛错/未 running 的动态覆盖。
- 红测：reservation 生产方法动态测试新增跨 thread 发布、附属目标、当前 claim 释放后旧 claim 复活用例，旧实现 3 条失败；ConversationStore 新增 mode/workspace 保存失败回滚，旧实现 4 条失败；路由动态测试新增 `session.run()` 抛错和未进入 running 的消息回滚，两条在既有生产实现上直接通过并补足证据。
- 修复：checkpoint `96a71dfb97f1ba272df01747d6ff94aa2b2640bc`、tree `3dcba8538116d63e7c2b4e1e56cdf3b24e7d67e5` 为每个 owner+generation 记录最高已发布 claim；低 claim 永久禁止新认领，仍可续约/释放自己原有 reservation。当前最高 claim 可认领附属删除目标，避免历史操作使当前 thread 失权。mode/workspace 保存异常只在字段与 `updatedAt` 仍属于本次 mutation 时回滚。
- 验证：该源码 checkpoint 无重试通过 `npm ci` 与完整 PowerShell 门禁：bundle `218.5kb`、13/13 Node 自测文件、reservation 52 项断言、ConversationStore 32/32、multi-window routing 动态合同、branding 22 文件和 `git diff --check`。
- 边界：只修改原 6 个源码/测试文件；`AgentSession.run()`、`callTool()`、sessions map 与 raw-tool 锁未修改。未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端；仍需 fresh final exact-head 复审。

## 2026-08-14：历史删除必须发布最新 claim

- 取证时间：`2026-08-14 03:31:02 +08:00`。
- 现象：owner+generation 最高 claim 已跨 thread 生效后，非当前历史删除若继续复用当前 thread 的旧 claim，会被跨目标单调 fence 拒绝，无法完成受控删除。
- 修复：实现 checkpoint `8ef8ce328dc587e048ba75c2ee9e979b47af38de`、tree `70735af06e995f44f5199fb2dd43453474cb556a` 为非当前历史删除创建最新 claim；该 claim 只临时认领并释放删除目标，当前 thread 的旧 reservation 仍可精确续约自身。
- 验证：在该 SHA 上无重试执行 `npm ci` 与完整 PowerShell 门禁，sidebar bundle `218.5kb`、13/13 Node 自测文件、reservation 52 项断言、ConversationStore 32/32、multi-window routing 动态合同、branding 22 文件和 `git diff --check` 全部通过。
- 边界：未修改 `AgentSession.run()`、`callTool()`、sessions map 或 raw-tool 锁；未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。仓库没有 PR workflow，以上仅为本地门禁证据。

## 2026-08-14：附属删除后当前 thread 不能重新认领旧 claim

- 取证时间：`2026-08-14 04:32:02 +08:00`。
- 现象：当前 thread A 持有 claim 1；删除非当前历史 B 发布并释放 claim 2 后，A 的 claim 1 仍可精确续约，但旧实现删除 A 时再次调用 `acquireThread(A, claim 1)`，被 owner+generation 的最高 claim 2 拒绝并误报其它窗口占用。
- 红测：组合动态用例先以 claim 2 删除 B，再尝试以既有 claim 1 删除 A；旧实现稳定抛出“该会话已在另一个浏览器窗口打开”，证明问题不在 reservation 续约而在重复认领。
- 修复：实现 checkpoint `4074d00ceb4606e3d22ae1294ba53cb8302cdf68`、tree `47b165892ee4db71c3e61801efd32fd6359c1d09` 为内部删除 helper 增加 `alreadyOwned` 路径。当前删除以 `renewThread()` 验证精确 reservation，非当前删除继续以最新 claim 调用 `acquireThread()`；成功后均释放目标，当前删除失败仍保留既有 reservation。
- 验证：该 SHA 上无重试执行 `npm ci` 与完整 PowerShell 门禁，sidebar bundle `218.6kb`、13/13 Node 自测文件、reservation 52/52、ConversationStore 32/32、multi-window routing 动态合同、branding 22 文件和 `git diff --check` 全部通过。
- 边界：该批仅修改 `AgentPanel.jsx` 与 `selftest-multi-window-routing.mjs`；当时没有继续修改 reservation 协议。完整 PR 已将 reservation 从旧两参数签名升级为 `owner + generation + claim` 并新增 `beginThreadReservation()`，旧调用失败关闭。未修改 `AgentSession.run()`、`callTool()`、sessions map 或 raw-tool 锁。

## 2026-08-14：失败的高 claim 也必须推进 owner 水位

- 取证时间：`2026-08-14 05:50:15 +08:00`。
- 现象：fresh reviewer `3f372874-23a5-4d38-966f-3d157f7c25a5` 对 `e84e4b18ac250614979876b68e810a6fc2845d16`、tree `5affad19645ed32eafbaee52ad271785a22e5a32` 返回 `REQUEST_CHANGES`（P1=1、P2=2）。高 claim 只有认领成功才推进 owner+generation 水位，因此“claim 1 持有 A -> claim 2 认领被其它 owner 占用的 B 失败 -> 迟到 claim 1 认领空 C”仍会成功；reviewer 同时要求生产删除路由具备动态语义证据，并指出最终审查台账遗漏两次 shutdown/no-verdict 尝试。
- 红测：`selftest-thread-reservation.mjs` 新增“高 claim 认领被占目标失败后，旧 claim 不得认领空目标、但仍可续约自己原有 reservation”的确定性交错；`selftest-multi-window-routing.mjs` 直接提取并执行生产 `deleteThreadForSelection()`，覆盖当前与非当前删除的成功、失败、释放和保留语义，React 入口只保留对该 helper 的单一调用。
- 修复：实现提交 `4f52a4fdf45481da908e2c467a80ec16c68d32f2`、tree `d12dd5bc6829ac7172bb6644c5558caba8e7c7cb` 在 `acquireThread()` 校验 generation/claim 后、扫描候选前推进 owner 水位；认领失败不再允许低 claim 跨目标复活。生产删除逻辑收敛到 `deleteThreadForSelection()`；没有修改 `AgentSession.run()`、`callTool()`、sessions map 或 raw-tool 锁。
- 验证：该 SHA 上无重试执行 `npm ci` 与完整 PowerShell 门禁，sidebar bundle `218.6kb`、13/13 Node 自测文件、thread reservation 57/57、ConversationStore 32/32、multi-window routing 生产删除 helper 动态合同、branding 22 文件和 `git diff --check` 全部通过。
- 审查台账：`f92d93752aecbec3edf33bce5486fe8d95935371` 的 reviewer 因 provider 503 结束，无 findings/verdict；reviewer `019ffcda-2437-7791-a95a-54cab6ca68a8` 与 `019ffcee-5f0d-7892-977e-eced1beb2c71` 均因长期无输出被 shutdown，无 findings/verdict。三次无 verdict 均不是批准，也不得覆盖任何 `REQUEST_CHANGES`。
- 边界：没有启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端；仓库无 pull-request workflow，上述证据是实现快照本地门禁，不是 CI。治理提交后仍需 fresh exact-head reviewer 返回 `APPROVE P0=0 P1=0 P2=0` 才可合并。

## 2026-08-14：Store 兼容入口与发送配置仍有并发缺口

- 取证时间：`2026-08-14 07:31:10 +08:00`。
- 现象：fresh reviewer `019ffd25-55db-7473-aab5-a42ac5c9b963` 对 `bc639e34389331ebc950989e4b431160992b7f06`、tree `30452ce51ddea0474665c745ea3bd386f0b6c405` 返回 `REQUEST_CHANGES`（P1=3、P2=1）。旧实现把 `ConversationStore.createThread()`、mode/workspace 和 user append 强制改成必须提供 UI guard，破坏 `frx-director-mcp` 的既有旧签名；首次并发 `_load()` 可互相覆盖 `_mem`；`notes.digest()` 等待期间的 mode/workspace 变化不会淘汰旧发送；并发保存失败还可能把失败字段夹带进后续成功快照。
- 红测：ConversationStore 自测复现 director 三参数 create 与无 guard mode/workspace/message 调用、共享冷启动读取和并发保存失败隔离；multi-window routing 动态执行权威配置读取、digest 等待竞态、默认 mode 与用户 mode 的配置 intent 竞争、线性化点 mode/workspace guard、缺失 thread 和漏传 guard mutation。
- 修复：实现提交 `c7672eb319c81fb06f605e9a4ec1ef642be59e7a` 增加共享 `_loadPromise` 与串行 mutation queue，在显式 guard 存在时保持 UI 失败关闭、未提供时兼容 director 旧签名；发送改为 digest 后读取权威 thread 配置，并在最终消息提交点复核配置 intent 与 mode/workspace。最终测试加固提交 `69a514e76550adc8d563f739c0c9f132bb3aeb88`、tree `9c0396e2d7d6fa100b7fea8b6ad58b4f1920d541` 让 React mode/workspace 统一走显式 guard helper，并证明旧默认 `auto` 不能覆盖后来发布的用户模式。
- 验证：在 `69a514e76550adc8d563f739c0c9f132bb3aeb88` 内容上无重试执行 `npm ci` 与完整 PowerShell 门禁，sidebar bundle `220.4kb`、13/13 Node 自测文件、thread reservation 57/57、ConversationStore 42/42、multi-window routing 合同、branding 22 文件和 `git diff --check` 全部通过。
- 边界：该批未继续修改 reservation 协议，也未修改 `AgentSession.run()`、`callTool()`、sessions map 或 raw-tool 锁；未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。该本地证据不是 final approval，治理提交后仍需 fresh exact-head reviewer。

## 2026-08-14：初始化仍可接管外部运行 thread，user 保存失败仍会夹带

- 取证时间：`2026-08-14 08:19:44 +08:00`。
- 现象：fresh reviewer `8d29ce1a-c8c3-47de-ae8f-b3c9eb30dca5` 对 `98e080540b823327f3e52ceed2b821784d3fc7b6`、tree `6f8eab856a10030cc66eb2ec442c5225fb5e214c` 返回 `REQUEST_CHANGES`（P1=2、P2=1）。初始化会认领最新且无 reservation 的外部运行 thread；user append 在同步启动任务后若 `_save()` 失败，会把失败消息留在 `_mem` 并由后续成功保存夹带。旧文档还错误声称公共 reservation API 未修改。
- 红测：路由自测直接执行生产初始化候选 helper，覆盖“外部 thread 调用前已运行”“认领后才进入运行态”“同 owner 重挂载续看自己运行任务”三种交错；ConversationStore 自测模拟 user append 启动后保存失败，再执行成功 workspace 保存并检查持久化快照。
- 修复：`f5f632978f4764a62c1bc1ae2ba6ff591a165783` 为初始化增加运行态候选门禁并让 `appendMessage()` 条件回滚本次消息、自动标题和更新时间；`228c00b4aec7702748711de91d3927cc46656aa4`、tree `864c11a6e5faac2afc4621de21f4ab16cc9c7973` 将运行态门禁收敛到 reservation 认领线性化点：只有已有同 owner reservation 的运行 thread 可由原窗口重挂载，外部无 reservation 或其它 owner 均失败关闭。
- 验证：在 `228c00b4aec7702748711de91d3927cc46656aa4` 上无重试执行 `npm ci` 和完整 PowerShell 门禁，sidebar bundle `220.9kb`、13/13 Node 自测文件、thread reservation `60/60`、ConversationStore `48/48`、multi-window routing、branding 22 文件和 `git diff --check` 全部通过。
- 兼容性：`ConversationStore` 的 director 三参数 create 及无 guard mode/workspace/message 旧签名继续兼容；UI reservation API 已升级为 `beginThreadReservation()` 加 `owner + generation + claim`，旧两参数调用故意失败关闭。`AgentSession.run()`、`callTool()`、sessions map 与 raw-tool 锁未修改。

## 2026-08-14：运行任务卸载后无法重挂载，metadata 保存失败仍会夹带

- 取证时间：`2026-08-14 08:57:28 +08:00`。
- 现象：fresh reviewer `d5261c5b-1250-4855-99e4-e29f1185d0c0` 对 `78464614385e6599dbdbafe3945938c5d2341c54`、tree `70bf4311419e30c21852bc989e45fe3509f649be` 返回 `REQUEST_CHANGES`（P1=2、P2=1）。运行中的 thread 在 pagehide/unmount 时会清空 reservation，原稳定 owner 重挂载也被运行态门禁拒绝；`setThreadEnvironment()`、`setThreadModelStrategy()` 与 `renameThread()` 保存失败后未回滚 `_mem`；结构化 reviewer 台账还漏记了 `ac55b198... REQUEST_CHANGES`。另一次 reviewer `51befd7e-f709-449c-b919-72614292f4be` 未显式指定 fork，错误查询 upstream PR #2 后按身份闸门停止且未读源码，其流程性拒绝不作为实现 finding。
- 红测：生产 reservation 方法动态用例在旧实现稳定失败 3 项，覆盖运行中精确 release、同 owner 重挂载、其他 owner 在任务结束前及 TTL 内不得接管；Store 故障注入在旧实现稳定失败 9 项，逐一证明 environment/model/title 值、`updatedAt` 与后续成功快照都会被污染。
- 修复：实现提交 `f19d8cbe123cdb0698a00fdaa47ac0836cf5bf0a`、tree `f68a14b1831444f2e163fdaa216b54f48a76806e` 让运行中的精确 release 保留不续时 owner 锚点，空闲 thread 仍立即释放；同 owner 新 generation 可重挂载，其他 owner 需等任务结束且既有 8 秒 TTL 过期。三类 Store setter 复用 mode/workspace 的 `previous + mutationUpdatedAt + 条件回滚` 语义。
- 验证：无重试执行 `npm ci` 与完整 PowerShell 门禁，sidebar bundle `220.9kb`、13/13 Node 自测文件、thread reservation `67/67`、ConversationStore `60/60`、multi-window routing 合同、branding 22 文件和 `git diff --check` 全部通过。
- 边界：未修改 `AgentSession.run()`、`callTool()`、sessions map、raw-tool 锁或 director 兼容签名；未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。仓库无 PR workflow，本地门禁不是 CI，治理提交后仍需 fresh exact-head reviewer 返回 0/0/0。

## 2026-08-14：AGOS 默认入口拒绝未登记的中央 task

- 取证时间：`2026-08-14 09:13:36 +08:00`。
- 现象：`invoke-agos-default-entry.ps1 -ReportOnly` 识别本仓 task authority 为 `project-local ready`，但因 AGOS 中央 task registration 不存在而返回 `AGOS_DEFAULT_ENTRY_STATUS=blocked`；该命令没有修改文件。
- 处理：不创建、不消费、不修改 `ai-growth-os` 中央 backlog。继续使用已获牢大批准的 GitHub Issue #1、project-local session plan、owner-scope 与 task-local runtime workflow；`verify-session-plan.ps1` 和 `verify-runtime-workflow.ps1` 分别独立通过。
- 边界：这是中央登记缺失下的 report-only 路由门，不是 Firefox 源码、测试或本地门禁失败；不得把它写成 AGOS default entry 已通过，也不得为收口本外部项目而修改 AGOS 中央仓。

## 2026-08-14：临时 claim 被误当作正常运行中 owner 锚点

- 取证时间：`2026-08-14 09:50:04 +08:00`。
- 现象：fresh reviewer `7a7dc2f6-5372-444b-b9d2-0945acf807c5` 对 `ee665652da982dc40c8dd8b71a692d48cb5aa8fd`、tree `420cebc1a467a63ff188d0708ab99af7935e307b` 返回 `REQUEST_CHANGES`（P1=2、P2=1）。历史点击在认领后的异步读取期间若由外部 director 启动，仍会绑定该 running thread；初始化和非当前删除虽然调用 release，但生产 `releaseThread()` 会为所有 running thread 保留 owner 锚点，导致临时 claim 被同 owner 后续挂载复用。测试 fake 又无条件清 reservation，掩盖了组合缺陷。
- 红测：先把 routing fake 改成生产 running-anchor 语义，旧实现稳定在“运行态竞态必须释放临时预留”失败；reservation 新增显式 abandon 交错，旧实现稳定失败 2 项，分别证明同 owner 可错误重挂载、任务结束后仍受错误 TTL 阻塞。另加正常同 owner running remount 取消/重试用例，阻止修复误清正常锚点。
- 修复：实现提交 `ce6bf30c585dede0ce76c56ba8d1bab6f0b0fe29`、tree `556e9e801ec2afab35e888073005f01e9370a4a8` 为内部 reservation release 增加默认关闭的 `abandonRunning` 参数。正常 pagehide/unmount 仍保留运行中 owner 锚点；尚未绑定的初始化、历史读取、创建和非当前删除临时 claim 可精确清除锚点。历史点击在认领前、读取内及绑定前复核运行态；同 owner 已有 running remount 的取消路径继续使用正常 release。
- 验证：无重试完整 PowerShell 门禁通过 `npm ci`、sidebar bundle `221.5kb`、13/13 Node 自测文件、thread reservation `70/70`、ConversationStore `60/60`、multi-window routing `PASS`、branding 22 文件与 `git diff --check`；`package-lock.json` 未变化，bundle 未被 Git 跟踪。
- 边界：未修改 `AgentSession.run()`、`callTool()`、sessions map、raw-tool 锁或 director 兼容签名；未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。仓库无 PR workflow，本地门禁不是 CI，治理提交后仍需 fresh final exact-head reviewer 返回 0/0/0。

## 2026-08-14：旧 generation 无法收回临时 claim，消息保存失败后任务仍启动

- 取证时间：`2026-08-14 10:27:35 +08:00`。
- 现象：fresh reviewer `d5fe1b3b-56d1-4e8c-b338-6d790631e32b` 对 `4e0e246c9f7728b1ed366602b55d3c90daff2a02`、tree `b270a11e77982c8c52efc3236b714457d5d8c163` 返回 `REQUEST_CHANGES`（P1=2、P2=0）。同宿主发布新 generation 后，旧历史读取的 finally 无法 abandon 自己仍精确持有的临时 claim；`appendMessage()` 又在 `_save()` 前调用启动回调，保存失败时任务已运行但用户消息未持久化。
- 红测：reservation 动态用例覆盖“新 generation 仅发布未接管时旧 claim 必须清理”和“新 generation 已接管时旧 claim 不得误清”；routing 用例在历史读取返回前发布新 generation；ConversationStore 用例证明保存失败零启动，以及保存等待期间失权后必须写入无消息的回滚快照。
- 修复：实现提交 `c718298bfa315a188ab6b5e010110a387a234688`、tree `aae7962d791897adb0cac6925f5986c23edb9ab9` 仅对显式 `abandonRunning=true` 放宽当前 generation 前置，并继续要求 reservation 精确匹配 `owner + generation + claim`。user append 先保存，再在最终同步 ownership guard 后无 `await` 调用 `session.run()`；最终 guard 或启动失败时回滚并重新持久化。
- 验证：无重试完整 PowerShell 门禁通过 `npm ci`、sidebar bundle `221.6kb`、13/13 Node 自测文件、thread reservation `75/75`、ConversationStore `65/65`、multi-window routing `PASS`、branding 22 文件与 `git diff --check`；`package-lock.json` 未变化，bundle 未被 Git 跟踪。
- 边界：未修改 `AgentSession.run()`、`callTool()`、sessions map、raw-tool 锁或 director 兼容签名；未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端。仓库无 PR workflow，本地门禁不是 CI，治理提交后仍需 fresh final exact-head reviewer 返回 0/0/0。

## 2026-08-14：初始化遗漏本 owner 运行线程，删除与回滚保存仍有竞态

- 取证时间：`2026-08-14 11:21:40 +08:00`。
- 现象：fresh reviewer `ab60f7a9-7975-4375-a030-134f8fee95af` 对治理 HEAD `1a7b0511a74b7739ae258b59e9f907151365637b`、tree `bc6efaf652926a417349effc63cdde7c1345f7ad` 返回 `REQUEST_CHANGES`（P1=2、P2=1）。初始化只尝试最近的 `list[0]`，可能因其它窗口较新的任务而漏掉本 owner 的 running anchor；历史点击也无条件拒绝 running thread。删除只在持久化前复核 guard，保存期间启动的 external run 可留下无历史任务；append 回滚的第二次保存失败后没有隔离恢复状态。
- 红测：routing 动态构造 `[其它 owner 较新 running, 本 owner 较旧 running]`，并让 external run 在删除 `_save()` 阻塞期间启动；ConversationStore 故障注入让 append 与 deletion 的回滚保存失败，再让恢复保存连续失败，证明恢复完成前必须阻断新 mutation。旧实现分别因缺少 preferred helper、删除未拒绝以及恢复写晚于新 mutation 而稳定失败。
- 修复：实现提交 `42846c64f6cada240ce53c7c86a0d20430806261`、tree `a014757038fbdb3ad975fb78d189e8a9bc2d9988` 新增内部 `acquirePreferredExistingThread()`，先尝试 running 候选并由既有 owner fence 只允许本 owner 重挂载，再按列表顺序认领空闲历史；历史打开复用同一 helper 并区分合法 remount 与临时 claim。`ConversationStore.deleteThread()` 在保存后同步复核 guard，失权时恢复并再次保存；append/deletion 的回滚保存失败设置恢复门，后续 mutation 必须先成功写回恢复快照。
- 验证：无重试完整 PowerShell 门禁通过 `npm ci`、sidebar bundle `222.1kb`、13/13 Node 自测文件、thread reservation `75/75`、ConversationStore `78/78`、multi-window routing `PASS`、branding 22 文件与 `git diff --check`；`package-lock.json` 未变化，bundle 未被 Git 跟踪。
- 边界：该批只修改 `AgentPanel.jsx`、`ConversationStore.sys.mjs` 与两份自测；未修改 `AgentSession.run()`、`callTool()`、sessions map、raw-tool 锁或 director 兼容签名。未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端；仓库无 PR workflow，仍需治理提交后的 fresh exact-head reviewer 返回 0/0/0。

## 2026-08-14：快速 external run 穿过删除采样，回滚责任无法跨重载恢复

- 取证时间：`2026-08-14 12:04:31 +08:00`。
- 现象：fresh reviewer `b58ed78e-22bc-4aca-afd3-ec1ca8b9fb40` 对治理 HEAD `726aeaddb8c302fc75cc1e95d1fe10667b696d99`、tree `038386c6435a51e9377c8753eb0acad1737e504b` 返回 `REQUEST_CHANGES`（P1=2、P2=0）。删除只在保存前后采样 `isRunning()`，external run 可在 `_save()` 阻塞期间启动并快速失败回到 idle；回滚保存失败又只设置内存标志，fresh Store 会接受含幽灵消息或已删除 thread 的 provisional canonical。
- 红测：routing 在删除 `_save()` 阻塞期间执行 `run -> finish`，旧实现未拒绝删除；ConversationStore 使用持久化 fake IO，让 provisional save 成功、最终 guard 失权、canonical rollback 失败，再创建 fresh Store，旧实现分别重新读到未运行 user 消息和缺失 thread。生产 `AgentSession.run()` 还以 provider 初始化快速失败动态验证 accepted-run epoch。
- 修复：实现提交 `62caad744ec56ab9b20ad2dbb13661afb65a5dca`、tree `886f4e360a73d2c2f272a3d8d0779a432e952821` 为每个 session 增加只读 snapshot 可见的单调 `runEpoch`，删除 guard 固定并复核该 epoch。append/deletion 回滚前把恢复快照原子写入 canonical 同目录 `.recovery` sidecar；当前实例恢复完成前阻断 mutation，fresh Store 优先恢复 canonical 并清理 sidecar，畸形或不支持的恢复 schema 失败关闭。
- 验证：无重试完整 PowerShell 门禁通过 `npm ci`、sidebar bundle `222.4kb`、13/13 Node 自测文件、thread reservation `77/77`、ConversationStore `82/82`、multi-window routing `PASS`、branding 22 文件与 `git diff --check`；`package-lock.json` 未变化，bundle 未被 Git 跟踪。
- 边界：`AgentSession.run()` 只增加 accepted-run epoch，不改变执行、重入和持久化流程；未修改 `callTool()`、sessions map、raw-tool 锁或 director 兼容签名。未启动 Firefox、Reverse Lab、Pingbo、Bet365、账号、live 或第三方后端；仓库无 PR workflow，仍需治理提交后的 fresh exact-head reviewer 返回 0/0/0。

## 2026-08-14：runtime workflow validator 需要 PowerShell 7

- 取证时间：`2026-08-14 12:09:51 +08:00`。
- 现象：使用 Windows PowerShell 5.1 执行 AGOS `verify-runtime-workflow.ps1` 时，因其运行时没有 `System.IO.Path.GetRelativePath` 而失败。
- 处理：不修改 AGOS 脚本；改用本机 `pwsh -NoLogo -NoProfile -File ...verify-runtime-workflow.ps1` 和相同参数，返回 `RUNTIME_WORKFLOW_VERIFY_OK`。
- 边界：该错误属于验证执行器版本，不是 Firefox 源码、session plan 或 runtime workflow 内容失败。
