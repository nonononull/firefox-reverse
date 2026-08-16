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

路由合同只验证外部任务不接管、提示条新建 thread、初始化/历史/发送失败关闭。现有 reservation 自测验证 owner、TTL 和同 thread 独占；Issue #6 对 `AgentSession.sys.mjs` 只允许修改 raw `callTool()` 的 ctx 构造。

## Issue #6 多窗口工作目录隔离聚焦门禁

```powershell
$tests = @(
  'selftest-workspace-isolation.mjs',
  'selftest-workspace.mjs',
  'selftest-toolrouter.mjs',
  'selftest-multi-window-routing.mjs',
  'selftest-thread-reservation.mjs'
)
foreach ($test in $tests) {
  node (Join-Path '.\additions\browser\components\agent-sidebar\dev' $test)
  if ($LASTEXITCODE -ne 0) { throw "focused selftest failed: $test" }
}
```

`selftest-workspace-isolation.mjs` 使用生产后端与内存 IO 固定以下交错：窗口 A 捕获 `{ workspaceRoot, win }`，窗口 B 改写共享 fallback，随后恢复 A。它必须同时证明：

- notes 自动注入与 `session.run` 复用同一冻结 ctx；
- 显式 `workspaceRoot:null` 失败关闭，完全省略 ctx 以及 raw `AgentSession.callTool()` 省略 `workspaceRoot` 的旧 fallback 保持兼容；
- `runCtx` 必须位于首个 `await ensureThread()` 之前，顺序断言必须杀死延后冻结的内存 mutation；
- `find_param_entry` 正确等待 network list，network/code 子调用均收到 A ctx；
- scripts 列表、短名保存和批量抓取只从 A 页面取源，工作目录写入 A；
- JSVMP query、trace stop 与默认 status 透传 A ctx，trace 镜像落 A；
- 直接文件路径与 `run_node` cwd 仍固定为 A，Issue #1 路由与 reservation 合同不回归。

治理基线 `20a942590ad833116042c28c09723d18b10020a2` 的首个 RED 为 `7 passed, 18 failed`；失败原因必须是上述 ctx 丢失、异步 network 未等待和未声明 JSVMP ctx，不接受语法、mock 或环境失败冒充。Reviewer 扩展反例在修复前得到 `27 passed, 1 failed`，唯一失败必须是 raw `callTool()` 把省略字段制造为 own `workspaceRoot:null`；runCtx 顺序 mutation 必须同轮被杀死。

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

## Issue #8 Windows force fallback 聚焦门禁

```powershell
node .\additions\browser\components\agent-sidebar\dev\selftest-environment.mjs
if ($LASTEXITCODE -ne 0) { throw 'environment selftest failed' }

git diff --no-index -- `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackend.sys.mjs `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackendCurrent.sys.mjs
if ($LASTEXITCODE -ne 0) { throw 'environment backend mirrors differ' }
```

参数级 fake 必须固定以下状态机，不启动或终止真实进程：

- Windows graceful 失败后复查为 `dead` 时成功且不 force，`unknown` 时失败且不 force；
- Windows graceful 失败后复查为 `alive` 时恰好按 `force:false`、`force:true` 顺序调用，并在确认 `dead` 后返回 forced success；
- force 命令失败时不再用迟到 PID 探测伪造成功；force 成功但 PID 持续 `alive` 或变为 `unknown` 时仍失败关闭；
- 非 Windows graceful 失败不自动升级 force；Windows 命令参数分别为 `/PID <pid> /T` 与 `/PID <pid> /T /F`；
- `close()` 只有收到明确成功才发布 `stopped/pid=null`，force success 对应 `forced-kill-after-timeout`。

冻结旧流 `cb23809f3c5b97f6dcb91f401ab149d3f2b109a3` 的首个 RED 必须精确返回 `actual={ok:false,forced:false}`、`expected={ok:true,forced:true}`，失败原因是 graceful false + alive 没有进入 force，而非语法、mock 或环境错误。focused GREEN 后，生产与测试冻结，再从 fresh `npm ci` 开始只运行一次“完整轻量门禁”；若三份生产/测试路径随后改变，该完整证据失效。

## Issue #10 强制命令失败后的 PID 终态确认聚焦门禁

```powershell
node .\additions\browser\components\agent-sidebar\dev\selftest-environment.mjs
if ($LASTEXITCODE -ne 0) { throw 'environment selftest failed' }

git diff --no-index -- `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackend.sys.mjs `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackendCurrent.sys.mjs
if ($LASTEXITCODE -ne 0) { throw 'environment backend mirrors differ' }
```

参数级 fake 必须固定以下状态机，不启动或终止真实进程：

- Windows graceful 失败、复查 alive、force 命令返回 false、下一次 PID 探测 dead 时成功，且结果保持 `forced:false`；
- force 命令返回 false 后持续 alive，或后续探测为 unknown 时，完整走完既有有界窗口并继续失败关闭；
- force 命令返回 true 后仍须明确 dead 才成功，持续 alive 或 unknown 不得伪造终态；
- graceful 后 dead/unknown/alive、非 Windows no-force 与 `/T`、`/T /F` 参数矩阵继续通过；
- `close()` 只有收到明确成功才发布 `stopped/pid=null`，两份 EnvironmentBackend 必须逐字一致。

冻结旧流 `c0008f98dfd3a4a9d57c29e156c89e90c7734504` 的 RED 必须精确命中“force 命令返回 false 后没有执行下一次 PID 探测”，不能以语法、mock 或环境失败冒充。focused GREEN 后冻结三份生产/测试字节，再从 fresh `npm ci` 开始只运行一次完整轻量门禁；若三份路径随后变化，完整证据失效。

## 完整轻量门禁

```powershell
npm --prefix .\additions\browser\components\agent-sidebar run build
$tests = @(
  'selftest-config.mjs', 'selftest-mozbuild.mjs', 'selftest-providers.mjs',
  'selftest-conversations.mjs', 'selftest-stream.mjs', 'selftest-retry.mjs',
  'selftest-anthropic.mjs', 'selftest-toolrouter.mjs',
  'selftest-thread-reservation.mjs', 'selftest-multi-window-routing.mjs',
  'selftest-workspace.mjs', 'selftest-workspace-isolation.mjs',
  'selftest-environment.mjs', 'selftest-e2e.mjs'
)
foreach ($test in $tests) {
  node (Join-Path '.\additions\browser\components\agent-sidebar\dev' $test)
  if ($LASTEXITCODE -ne 0) { throw "selftest failed: $test" }
}
node .\scripts\check-branding-assets.mjs
if ($LASTEXITCODE -ne 0) { throw 'branding check failed' }
```

Windows 不使用 Bash 聚合入口，避免 CRLF、NVM4W shim 和 WSL 平台依赖干扰。

## Issue #6 交付边界

```powershell
npm audit --prefix .\additions\browser\components\agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
git diff --check
git diff --name-only 20a942590ad833116042c28c09723d18b10020a2...HEAD
git diff --exit-code 20a942590ad833116042c28c09723d18b10020a2...HEAD -- `
  .\additions\browser\components\agent-sidebar\modules\ConversationStore.sys.mjs
git status --short
```

Issue #6 只允许 owner scope 中的七份生产模块、一个隔离自测、Unix 聚合测试入口、`AGENTS.md`、`build.md`、`err.md` 与三份任务控制文档变化。完整门禁从 fresh `npm ci` 开始执行；生产代码、测试或聚合接线若随后改变，旧证据保留但最终树必须重新验证。仓库没有 pull-request CI，不得把本地结果表述为 hosted CI。

## Issue #8 交付边界

```powershell
npm ci --prefix .\additions\browser\components\agent-sidebar
npm --prefix .\additions\browser\components\agent-sidebar run build
# 随后执行“完整轻量门禁”的固定 14 项自测与 branding 检查
npm audit --prefix .\additions\browser\components\agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
git diff --check
git diff --name-only cb23809f3c5b97f6dcb91f401ab149d3f2b109a3...HEAD
git status --short
```

Issue #8 只允许 owner scope 中的两份环境后端、一个环境自测、`build.md`、`err.md` 与三份任务控制文档变化。不得启动 Firefox、处置真实 PID、修改 Reverse Lab 状态或把本地验证表述为 hosted CI。仓库没有 pull-request CI；production/test hash 在唯一一次完整门禁前后必须一致。

## Issue #10 交付边界

```powershell
npm ci --prefix .\additions\browser\components\agent-sidebar
npm --prefix .\additions\browser\components\agent-sidebar run build
# 随后执行“完整轻量门禁”的固定 14 项自测与 branding 检查
npm audit --prefix .\additions\browser\components\agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
git diff --no-index -- `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackend.sys.mjs `
  .\additions\browser\components\agent-sidebar\modules\EnvironmentBackendCurrent.sys.mjs
git diff --check
git diff --name-only c0008f98dfd3a4a9d57c29e156c89e90c7734504...HEAD
git status --short
```

Issue #10 只允许 owner scope 中的两份环境后端、一个环境自测、`build.md`、`err.md` 与三份任务控制文档变化。不新增超时配置，不启动 Firefox，不处置真实 PID，不修改 Reverse Lab runtime、lease、assignment 或 quarantine。仓库没有 pull-request CI；production/test hash 在唯一一次完整门禁前后必须一致。

## Issue #8 当前验证快照

- 首个 RED：冻结旧生产 blob `2d4dc51a4a67b64884a8637ec2abdfd6f626509a` 返回 `actual={ok:false,forced:false}`、`expected={ok:true,forced:true}`，精确命中 Windows graceful false + alive 未升级 force。
- focused GREEN：环境自测和两份后端镜像检查通过；参数矩阵覆盖 graceful 后 dead/unknown/alive、force false、force 后 alive/unknown、非 Windows no-force，并精确断言 `/T` 与 `/T /F`。
- 实现提交：`435a9d97e71a6a7ff1d12b5bb9d20042801fbe14`，tree `ae428f229340c2097640429261ab2626a7f46049`；两份生产 blob 均为 `9a0ebbf039242ebfdb33c8707c73f3630ef18de0`，测试 blob 为 `7c00b4ad1bc162c53ec6eee5bf555519c0643901`。
- 唯一一次完整轻量门禁：Windows / Node `v22.23.1` / npm `10.9.8` 从 fresh `npm ci` 开始，安装 7 个包、bundle `210.1kb`、固定 14/14 Node 自测文件与 branding 22 全部通过。
- 官方 registry high/critical audit 通过，仅报告既有 esbuild 开发依赖 1 个 moderate；建议修复会升级到 breaking `esbuild@0.28.2`，不属于 Issue #8。
- 完整门禁前后工作树 SHA-256 一致：两份生产模块均为 `30fd79546057df6930591de965d660a3d7605191fa4d2e032e6e79e38ea659fc`，环境自测为 `8a6bad27cb8823ca79ddbbaf4b137194704e7aadf824d6ad9c5cfaf37a817e69`，lockfile 为 `86c6d7fa2c8a627cae50e417dd4e255390f5669e6c5c1a78bba65f92327300d7`。
- fresh exact-head reviewer 在 `a95b086cbc9fa5608c168995bd8975769fdf1665` 返回 `APPROVE`，P0/P1/P2 均为 0；独立 focused、镜像与 `git diff --check` 通过，完整 14 项门禁按约束未重复。交付 PR 为 `https://github.com/nonononull/firefox-reverse/pull/9`。
- 以上是本地完整证据，不是 hosted CI；仓库无 pull-request CI。治理证据写回不得触发第二次完整产品门禁，任何生产或测试变化则必须使本快照失效。

## Issue #6 当前验证快照

- 旧流 RED：治理基线测试得到 `7 passed, 18 failed`，18 项分别命中显式 null、Panel notes ctx、find async/ctx、scripts 页面来源与 JSVMP relay/status；reviewer 扩展反例在旧 `callTool()` 上得到 `27 passed, 1 failed`，唯一失败精确命中省略字段被压成 null。
- focused GREEN：隔离矩阵 `28/28`、workspace `25/25`、toolrouter `37/37`、multi-window routing 与 thread reservation 全部通过；runCtx 延后到首个 await 后的内存 mutation 被杀死。
- 最终完整轻量门禁：Windows / Node `v22.23.1` / npm `10.9.8` 从 fresh `npm ci` 开始仅执行一次，安装 7 个包、bundle `210.1kb`、固定 14/14 Node 自测文件与 branding 22 全部通过。
- 官方 registry high/critical audit 通过，仅报告既有 esbuild 开发依赖 1 个 moderate；建议修复会升级到 breaking `esbuild@0.28.2`，不属于 Issue #6。
- `package-lock.json` SHA-256 前后均为 `86c6d7fa2c8a627cae50e417dd4e255390f5669e6c5c1a78bba65f92327300d7`；`git diff --check` 通过。
- fresh 独立 exact-working-tree reviewer 返回 `APPROVE`，P0/P1/P2 均为 0，并独立重跑五项 focused 与 `git diff --check` 全部通过；这不是尚未形成的 exact-head delivery review。
- 实现快照为 `5972f0df56663cb5a5d8deed39627425d7106b7b`，tree `b935f81cc181a6b641d8ac08b302bc8c6fa4ec07`；第二证据提交只绑定该 `snapshot_ref` 并记录交付状态，不改变生产/测试哈希。
- 上述是 Windows / Node 本地证据，不是 hosted CI；生产/测试哈希在完整门禁前后保持一致。牢大已授权形成实现快照、绑定 `snapshot_ref`、完成 exact-head 审查并交付 PR/merge；文档写回不重复完整产品门禁。

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
- fresh 独立 Reviewer 在 exact HEAD `9398c9238395c4e1d9fbb3cb389ef58d39a24cdc` 返回 `APPROVE`，P0/P1/P2 均为 0，并独立执行 focused 自测通过；交付 PR 为 `https://github.com/nonononull/firefox-reverse/pull/5`。
- 完整轻量门禁：从 fresh `npm ci` 开始仅运行一次，bundle `210.1kb`、固定 13/13 Node 自测文件与 branding 22 全部通过；未重跑产品全链。
- 官方 `https://registry.npmjs.org` high/critical audit 通过，仅报告既有 esbuild 开发依赖 1 个 moderate，其建议需要 breaking upgrade。
- `package-lock.json` SHA-256 在安装、构建、自测与 audit 前后均为 `86c6d7fa2c8a627cae50e417dd4e255390f5669e6c5c1a78bba65f92327300d7`；两份环境后端一致，`git diff --check` 通过，验证结束时工作树 clean。
- 本仓库没有 pull-request CI；上述均为 Windows / Node `v22.23.1` / npm `10.9.8` 的本地证据，不能表述为 hosted CI。
