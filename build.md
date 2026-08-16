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

## Issue #4 env_close 退出确认聚焦门禁

```powershell
node .\additions\browser\components\agent-sidebar\dev\selftest-environment.mjs
if ($LASTEXITCODE -ne 0) { throw 'environment selftest failed' }

git diff --no-index -- `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackend.sys.mjs `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackendCurrent.sys.mjs
if ($LASTEXITCODE -ne 0) { throw 'environment backend mirrors differ' }
```

聚焦自测必须同时证明：

- 本地 `_procs` 已持有 Firefox 时，终止确认失败会抛错并保留 `closing`、原 PID、进程句柄、drain 与输出尾部。
- 只有持久化 PID 时，`_terminatePid()` 返回 `ok:false` 同样不得发布假终态。
- PID 已 dead 时无需再发信号；alive 或 unknown 且信号失败时继续失败关闭。
- 终止确认成功后才清理三张进程所有权表，并写入 `stopped/pid=null`。

最终测试必须对治理 snapshot `96ad3526cc201f49512661fa83e4df8ca54d3793` 中的旧生产模块保持 mutation-killing RED。Reviewer 补充的三条交错还必须分别杀死 PID 优先级、活动空 PID 成功关闭和迟到 drain 回写变体。实现 checkpoint 后先执行上述 focused gate，再从 `npm ci` 开始只运行一次完整轻量门禁；若代码或测试发生后续变化，原完整门禁证据失效。

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

## Issue #4 交付边界

```powershell
npm audit --prefix .\additions\browser\components\agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
git diff --check
git diff --name-only ddd9b620188804fc23636c057c827d6ed9746ee5...HEAD
git status --short
```

Issue #4 只允许 owner-scope 中的两份环境后端、一个环境自测、`build.md`、`err.md` 与三份任务控制文档发生变化。不得启动 Firefox、处置真实 PID、修改 Reverse Lab 状态或把本地验证表述为 hosted CI。

## Issue #4 当前验证快照

- 实现提交：`3f8e2eb07a385ed132a5722a1395036ce59040a7`，tree `37653593260fcd8c3298529dfff41c3cbe67479c`；源码镜像 blob 均为 `2d4dc51a4a67b64884a8637ec2abdfd6f626509a`，环境自测 blob 为 `8e7aa44badb0cdea0b332a3b9dcb1be544960c44`。
- Reviewer 在旧 HEAD `ebfa171757e1c43187059e4af3eb37de0d1bc466` 报告 P1=2、P2=1；当前实现分别用 `PID_PRIORITY`、`ACTIVE_WITHOUT_PID`、`LATE_DRAIN_FENCE` 三个内存 mutation 变体确认 RED，修复后的 focused 自测通过。
- 完整轻量门禁：从 fresh `npm ci` 开始仅运行一次，bundle `210.1kb`、固定 13/13 Node 自测文件与 branding 22 全部通过；未重跑产品全链。
- 官方 `https://registry.npmjs.org` high/critical audit 通过，仅报告既有 esbuild 开发依赖 1 个 moderate，其建议需要 breaking upgrade。
- `package-lock.json` SHA-256 在安装、构建、自测与 audit 前后均为 `86c6d7fa2c8a627cae50e417dd4e255390f5669e6c5c1a78bba65f92327300d7`；两份环境后端一致，`git diff --check` 通过，验证结束时工作树 clean。
- 本仓库没有 pull-request CI；上述均为 Windows / Node `v22.23.1` / npm `10.9.8` 的本地证据，不能表述为 hosted CI。
