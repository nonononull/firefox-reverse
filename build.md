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
```

第一项验证其它窗口的运行 thread 不会被自动或点击接管，并执行以下创建/失权交错：

- 首个新 thread 被其它窗口抢先认领时，只绑定随后成功认领的 thread。
- 连续三次认领失败后停止并报错，不删除已被其它窗口认领的空 thread。
- `renewThread()` 返回 `false` 或抛错时立即进入失权恢复；旧 heartbeat 不得覆盖用户随后选择的新 thread。
- 缺少 `acquireThread`、`renewThread` 或 `releaseThread` 任一 reservation API 时失败关闭，不创建或打开未受保护的 thread。
- 初始化、新对话和历史打开在第一个异步读取前登记选择 intent；相同 thread ID/revision 下的更新 intent 也会淘汰旧异步结果。
- 发送链在每个异步准备阶段后同时核验 selection intent 与 `renewThread()`；失权时不启动任务并保留输入。
- 选择事务的 pending 标记只由匹配 intent 清除；旧事务结束不得清除更新事务。
- 初始化、发送前建会话和“新对话”统一经过有界精确认领入口。

第二项验证 owner token、心跳、TTL 与同 thread 独占保持不变。

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
- 发送从落用户消息到 `session.run()` 的每个 `await` 后都必须重新续约并验证 intent；最后一次验证与 `session.run()` 之间不得再有 `await`。
- 迟到的新建 thread 必须释放；同 owner 的迟到历史认领不能释放更新操作的 reservation，只能等待既有 TTL 回收。
- `AgentSession.sys.mjs` 未修改，同 thread 独占和 raw-tool 全局保护保持原状。
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
