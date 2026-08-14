# 构建与验证

## 环境

仅构建 Agent 侧栏并运行本地 Node 自测；不启动 Firefox、不访问账号或 live origin。

```powershell
npm ci --prefix .\additions\browser\components\agent-sidebar
npm --prefix .\additions\browser\components\agent-sidebar run build
```

## 聚焦验证

```powershell
node .\additions\browser\components\agent-sidebar\dev\selftest-multi-window-routing.mjs
node .\additions\browser\components\agent-sidebar\dev\selftest-thread-reservation.mjs
```

路由合同只验证外部任务不接管、提示条新建 thread、初始化/历史/发送失败关闭。现有 reservation 自测验证 owner、TTL 和同 thread 独占；`AgentSession.sys.mjs` 必须保持零差异。

## 完整轻量门禁

```powershell
npm --prefix .\additions\browser\components\agent-sidebar run build
$tests = @(
  'selftest-config.mjs', 'selftest-mozbuild.mjs', 'selftest-providers.mjs',
  'selftest-conversations.mjs', 'selftest-stream.mjs', 'selftest-retry.mjs',
  'selftest-anthropic.mjs', 'selftest-toolrouter.mjs',
  'selftest-thread-reservation.mjs', 'selftest-multi-window-routing.mjs',
  'selftest-workspace.mjs', 'selftest-environment.mjs', 'selftest-e2e.mjs'
)
foreach ($test in $tests) {
  node (Join-Path '.\additions\browser\components\agent-sidebar\dev' $test)
  if ($LASTEXITCODE -ne 0) { throw "selftest failed: $test" }
}
node .\scripts\check-branding-assets.mjs
if ($LASTEXITCODE -ne 0) { throw 'branding check failed' }
```

Windows 不使用 Bash 聚合入口，避免 CRLF、NVM4W shim 和 WSL 平台依赖干扰。

## 交付边界

```powershell
git diff --check
git diff --name-only 7a77a66ed8361f858cfa0b19fd8239b63b4535f0...HEAD
git diff --exit-code 7a77a66ed8361f858cfa0b19fd8239b63b4535f0...HEAD -- .\additions\browser\components\agent-sidebar\modules\AgentSession.sys.mjs .\additions\browser\components\agent-sidebar\modules\ConversationStore.sys.mjs
git status --short
```

独立审查只允许判断固定四条合同及本次差异是否回归；外围存储或协议改造只能登记后续 Issue。仓库没有 pull-request CI，不得把空 checks 表述为 CI 通过。
