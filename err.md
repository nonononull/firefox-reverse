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
