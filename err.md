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
