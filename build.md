# 构建与验证

## 环境

- Node.js 与 npm 使用本机已安装版本。
- 轻量验证只构建 Agent 侧栏并运行 Node 自测，不启动 Firefox、不访问账号或 live origin。
- 完整 Firefox 构建仍使用 `scripts/build.sh`，本任务不执行、不发布二进制。

## 安装侧栏依赖

```powershell
npm ci --prefix .\additions\browser\components\agent-sidebar
```

必须使用已提交的 `package-lock.json`。命令完成后 lockfile 不应变化。

## 侧栏构建

```powershell
npm --prefix .\additions\browser\components\agent-sidebar run build
```

产物 `content/agent-sidebar.bundle.js` 被 `.gitignore` 排除，只用于语法与 bundle 验证。

## 聚焦回归

```powershell
node .\additions\browser\components\agent-sidebar\dev\selftest-multi-window-routing.mjs
node .\additions\browser\components\agent-sidebar\dev\selftest-thread-reservation.mjs
node .\additions\browser\components\agent-sidebar\dev\selftest-conversations.mjs
```

第一项验证其它窗口的运行 thread 不会被自动或点击接管，并执行以下创建/失权交错：

- 首个新 thread 被其它窗口抢先认领时，只绑定随后成功认领的 thread。
- 连续三次认领失败后停止并报错，不删除已被其它窗口认领的空 thread。
- `renewThread()` 返回 `false` 或抛错时立即进入失权恢复；旧 heartbeat 不得覆盖用户随后选择的新 thread。
- 缺少 `beginThreadReservation`、`acquireThread`、`renewThread` 或 `releaseThread` 任一 API 时失败关闭，不创建或打开未受保护的 thread。
- 同 owner 新挂载取得新 generation 后，旧挂载的 acquire、renew、release 和 unsubscribe 都不能影响新 reservation。
- 每个 owner+generation 记录最高已发布 claim；有效的新 claim 在扫描候选目标前即发布，即使目标被其它 owner 占用且认领失败，低 claim 也不得再跨目标复活。低 claim 仍可续约或释放它自己尚存的旧 reservation；当前最高 claim 可临时认领并释放历史删除等附属目标，不使当前 thread 失权。
- React 删除入口必须统一调用生产 `deleteThreadForSelection()`；自测直接执行该 helper，覆盖当前/非当前删除的认领或续约、失败保留、成功释放与参数路由。非当前历史删除必须发布最新 claim 后临时认领；当前 thread 删除必须续约验证自己已持有的精确 reservation，不得用可能低于最高值的旧 claim 重新认领。
- 初始化、新对话和历史打开在第一个异步读取前登记选择 intent；相同 thread ID/revision 下的更新 intent 也会淘汰旧异步结果。
- 初始化只认领空闲历史，或由同一稳定 owner 预留且正在运行的 thread；无 reservation 的外部运行 thread 和其它 owner 的运行 thread 必须失败关闭。认领期间才进入运行态的候选必须释放并新建当前窗口 thread。
- 运行 thread 在正常 unmount/pagehide 时保留不续时的 owner 锚点：同 owner 新 generation 可立即重挂载，其他 owner 在运行期间继续失败关闭；任务结束且 TTL 过期后才允许回收。
- `releaseThread()` 的正常释放与临时放弃必须区分：正常卸载继续保留运行中 owner 锚点；初始化、历史读取或非当前删除尚未绑定的临时 claim 若在竞态窗口进入 running，必须以 `abandonRunning=true` 清除锚点。同 owner 不能借该临时 claim 重挂载外部任务，任务结束后也无需等待不存在的锚点 TTL。
- 新 generation 已发布但尚未接管 reservation 时，旧 generation 仍必须能以 `abandonRunning=true` 精确清理自己持有的 `owner + generation + claim`；新 generation 已接管后，旧清理必须失败关闭且不能影响新 reservation。
- 历史点击必须在认领前、异步读取内和 React 绑定前复核运行态；读取期间由外部 director 启动的 thread 必须失败关闭并放弃临时 claim，不能进入 busy 续看。
- 发送链的异步准备阶段使用 selection intent 与精确 claim 复核；`ConversationStore` 在修改前校验 ownership，用户消息必须先成功持久化，保存返回后再执行最终同步 ownership guard，并在无 `await` 的同一提交区间调用 `session.run()`。保存失败必须零启动；保存期间失权必须持久化回滚消息后零启动。
- 发送在等待 `notes.digest()` 后必须重新读取权威 thread 的 mode/workspace；配置 intent、pending 标记或权威配置任一变化都淘汰旧发送。默认 `auto` 只能在线性化点确认 thread mode 仍为空时写入，不能覆盖后来发布的用户模式。
- React 的 mode/workspace 写入统一经过显式 ownership guard helper；动态自测必须证明 helper 把权威 thread 交给 guard，且缺失 thread、拒绝 guard 和参数漏传均失败关闭。`frx-director-mcp` 的三参数 `createThread()`、无 guard mode/workspace/message 旧签名仍保持兼容。
- `session.run()` 抛错或调用后未进入 running 时必须回滚并重新持久化本次用户消息；user append 保存失败必须在启动前回滚消息、自动标题和 `updatedAt`，后续成功保存不得夹带失败 mutation。mode/workspace 保存失败同样必须条件回滚。
- 历史删除先拒绝运行态，再取得独占 reservation 并复核运行态；`ConversationStore` 在实际修改线程列表前再次执行同步所有权 guard，加载期间失权、其它窗口占用或运行中的 thread 均不得删除。
- 历史删除还必须固定 `AgentSession` 的单调 `runEpoch`；保存期间 external run 即使启动后快速失败并恢复 idle，最终 guard 也必须拒绝删除并恢复历史。
- append/deletion 的 canonical 回滚保存失败时，恢复快照必须先写入同目录 `.recovery` sidecar；fresh `ConversationStore` 必须先恢复 canonical 并清理 sidecar，恢复完成前不得接受新 mutation。
- 选择事务的 pending 标记只由匹配 intent 清除；旧事务结束不得清除更新事务。
- 初始化、发送前建会话和“新对话”统一经过有界精确认领入口。

第二项验证 owner token、generation、跨 thread 单调 claim、运行态 owner 门禁、卸载锚点、心跳、TTL 与同 thread 独占。第三项验证首次持久化只发布一个共享 load Promise、全部写操作串行化、director 旧签名兼容、user append/mode/workspace/environment/model/title 保存失败回滚，以及删除缺少 guard 或在线性化前失权时失败关闭并保留原线程。

## 完整轻量门禁

Windows 使用 PowerShell 执行与 `scripts/selftest-agent-tools.sh` 相同的固定列表：

```powershell
npm --prefix .\additions\browser\components\agent-sidebar run build
$tests = @(
  'selftest-config.mjs',
  'selftest-mozbuild.mjs',
  'selftest-providers.mjs',
  'selftest-conversations.mjs',
  'selftest-stream.mjs',
  'selftest-retry.mjs',
  'selftest-anthropic.mjs',
  'selftest-toolrouter.mjs',
  'selftest-thread-reservation.mjs',
  'selftest-multi-window-routing.mjs',
  'selftest-workspace.mjs',
  'selftest-environment.mjs',
  'selftest-e2e.mjs'
)
foreach ($test in $tests) {
  node (Join-Path '.\additions\browser\components\agent-sidebar\dev' $test)
  if ($LASTEXITCODE -ne 0) { throw "selftest failed: $test" }
}
node .\scripts\check-branding-assets.mjs
if ($LASTEXITCODE -ne 0) { throw 'branding check failed' }
```

Unix/release 环境可继续执行 `bash scripts/selftest-agent-tools.sh`。本机 WSL 与 Windows `node_modules` 平台不同，Git Bash 的 npm shim 也不兼容当前 NVM4W，因此 Windows 验收不得用这两个入口替代上面的 PowerShell 链。

## 独立审查

提交最终实现后，对 exact HEAD 执行只读审查，至少核验：

- 外部运行探测不再调用 `openThread()`。
- 提示条调用 `newChat()`。
- 历史列表仍调用 `openThread()` 并经过 `acquireThread()`。
- 新建 thread 只有在 `acquireThread()` 返回精确目标 ID 后才能绑定；失败重试有固定上限。
- `renewThread()` 返回 `false` 或抛错后不得继续使用旧 thread。
- 初始化、新对话、历史打开、流式回载和外部运行探测的异步结果必须同时匹配 thread ID 与选择代际；选择型操作还必须匹配 intent。
- 初始化不得认领无 reservation 的外部运行 thread；运行 thread 只有已有同 owner reservation 时才允许重挂载续看。运行态在认领期间变化时必须释放临时 reservation。
- 运行中的正常精确 release 只能停止续时并保留 owner 锚点；同 owner 重挂载后旧 generation 仍不得影响新 reservation，其他 owner 只能在任务结束且 TTL 过期后回收。尚未绑定的临时 claim 必须使用显式 abandon 语义清除运行中锚点，且动态测试的 fake 必须与生产语义一致。
- 历史点击在读取期间或读取返回后的微任务窗口进入 running 时必须拒绝绑定；初始化、历史读取和非当前删除的组合测试都要证明临时 claim 已真正清除，而正常同 owner running remount 取消后仍保留可重挂载锚点。
- 发送的异步准备阶段必须持续验证 intent 与精确 claim；用户消息先持久化，保存返回后必须再次同步验证 ownership，并在该最终 guard 与 `session.run()` 之间保持无 `await`。保存失败或保存期间失权均不得启动任务。
- 迟到的新建 thread 必须按精确 claim 清理或移交；同 owner 的旧 generation/claim 不能 acquire、renew 或 release 更新挂载的 reservation。
- 最高已发布 claim 必须属于 owner+generation，而非单个 thread；更高 claim 的有效认领尝试必须在候选扫描前推进水位，即使目标被占而失败，旧 claim 也不能在其它目标或当前 claim 释放后复活，但可清理自己原先持有的旧 reservation。
- React 删除入口必须只调用生产 `deleteThreadForSelection()`；动态自测直接执行该 helper 并证明非当前历史删除发布更高 claim 后，当前 thread 的旧 claim 仍能续约并删除自身，且该当前删除路径不得再次调用 `acquireThread()`。
- React mode/workspace 入口必须只调用显式 guard helper；默认模式、用户模式、目录修改和发送配置必须共享单调配置 intent，`notes.digest()` 等待期间的配置变化必须阻止旧发送落消息或启动任务。
- `ConversationStore` 必须保留 director 旧签名，同时用共享 load Promise 和写队列避免冷启动覆盖及并发失败值夹带；UI 不能借旧签名兼容绕过 ownership guard。
- user append/mode/workspace/environment/model/title 保存失败必须条件回滚本次内存修改；后续成功快照不得夹带失败值。user append 只有保存成功且最终 guard 通过后才能启动；`session.run()` 抛错或未进入 running 必须回滚并持久化用户消息，且不能标记已启动。
- 历史删除必须把同步所有权 guard 传到 `ConversationStore.deleteThread()`；guard 必须在 `_load()` 后、过滤线程列表前执行，失权时不能产生删除写入。
- `AgentSession.sys.mjs` 的 reservation 协议已由旧两参数签名升级为 `owner + generation + claim` 并新增 `beginThreadReservation()`；旧式调用故意失败关闭。`run()` 只允许新增 accepted-run 单调 epoch，不改变执行、重入或持久化流程；`callTool()`、多 thread sessions map 和 raw-tool 全局保护保持原状。
- reviewer 结论必须绑定 exact HEAD/tree；最后一次源码变更后旧结论失效。

## 交付边界检查

```powershell
git diff --check
git status --short
git diff --name-only main...HEAD
git diff --name-only
git ls-files --error-unmatch -- build.md err.md
```

GitHub 仓库当前只有 `release.yml`，没有 pull request workflow。本任务不得触发发布构建；PR 描述和审查评论必须明确记录 `no-PR-CI`，不能把无 checks 说成 CI 通过。

## 当前实现快照

- 取证时间：`2026-08-14 12:04:31 +08:00`。
- 实现提交：`62caad744ec56ab9b20ad2dbb13661afb65a5dca`，tree `886f4e360a73d2c2f272a3d8d0779a432e952821`。
- 无重试执行 `npm ci`、侧栏构建、13/13 Node 自测文件、branding 和 `git diff --check`，全部通过；bundle 为 `222.4kb`，thread reservation 为 `77/77`，ConversationStore 为 `82/82`，multi-window routing 合同为 `PASS`，branding 为 22 文件。
- 组合动态测试证明初始化会跳过其它 owner 的较新任务并优先重挂载本 owner 的 running thread；历史点击只允许同 owner 精确重挂载；删除保存期间持续或快速结束的 external run 均由单调 epoch 触发持久化回滚；append/deletion 回滚保存失败会留下 durable recovery sidecar，fresh Store 恢复 canonical 后才开放读写。
- 该证据只绑定实现快照；治理提交后的 fresh exact-head 独立审查仍是合并硬门，仓库无 pull-request CI。
