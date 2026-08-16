# Issue #6 多窗口工作目录隔离 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-6-window-workspace-isolation
work_class: standard
task_summary: 会话捕获的工作目录与浏览器窗口必须在异步和组合工具链中保持不漂移
project_root: D:\Android_source\firefox-reverse-worktrees\issue-6-window-workspace-isolation
trigger_source: GitHub Issue #6、三位只读 reviewer 的确定性交错证据与牢大直接开始授权
task_authority_kind: project-local
decision_status: approved
approval_source: direct-user
approved_decision_ref: session-plan:issue-6-window-workspace-isolation#decision
mutation_intent: source
execution_profile: project-native-v1
brainstorming_method: executor-native
execution_contract: agos.execution-contract.v1
command_source: project-build-docs
implicit_tool_preconditions: forbidden
scope_hash: sha256:a7886ea00b9b192280cf64c6d5f7bd5ab3b1ac179a5944b5616787be2621c2a4
owner_scope_ref: docs/plans/sessions/issue-6-window-workspace-isolation.owner-scope.yml
owner_scope_hash: sha256:a7886ea00b9b192280cf64c6d5f7bd5ab3b1ac179a5944b5616787be2621c2a4
selected_business_path: github-issue-pr-merge
verification_commands:
  - node additions/browser/components/agent-sidebar/dev/selftest-workspace-isolation.mjs
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - powershell fixed selftest list from build.md
  - node scripts/check-branding-assets.mjs
  - npm audit --prefix additions/browser/components/agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
  - git diff --check
delivery_contract: agos.issue-pr-merge.v1
tracking_issue_ref: https://github.com/nonononull/firefox-reverse/issues/6
review_ref: agent:issue6_final_tree_review-approve-p0-0-p1-0-p2-0
pr_ref: pending-create-after-exact-head
ci_ref: no-pull-request-ci
review_strategy: one fresh exact-head readonly reviewer after the last mutation
ci_expectation: no pull-request CI; record local complete gate without calling it hosted CI
merge_policy: owner-authorized-after-fresh-zero-finding-exact-head-review
allowed_operations:
  - source-edit
  - write-code
  - write-test
  - project-doc-write
  - build
  - verification
  - git-add
  - commit
  - push
  - create-pr
  - merge
forbidden_operations:
  - delete-branch
  - replay-or-merge-closed-pr-2
  - start-or-modify-browser-runtime
  - mutate-other-project-or-live-origin
  - add-public-tool-protocol-storage-format-or-reservation-semantics

## Approved Decision

- 决策：同一 Agent 回合先捕获不可漂移的 `{ workspaceRoot, win }`，notes 与 `session.run` 复用它；组合后端和内部子调用逐层透传同一 ctx。
- 失败策略：ctx 明确携带 `workspaceRoot:null` 时不得回退其它窗口最后写入的全局根；需要文件根的操作按现有错误路径失败关闭。完全省略 ctx 的旧直驱调用继续使用全局后备。
- 修复范围：七份生产模块、一份新的纯 Node 确定性交错自测、Unix 聚合测试入口、`AGENTS.md`、`build.md`、`err.md` 与三份任务控制文档；`AgentSession` 仅修改 raw `callTool()` 的 ctx 构造。
- 保持不变：共享 profile 脚本语料库、公共工具/参数/结果、ConversationStore、thread reservation 和 Firefox 运行态。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - firefox reverse multi window workspaceRoot notes scripts jsvmp context isolation
  vault_refs:
    - none-found-for-firefox-window-workspace-isolation
  rules_refs:
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-auto-application.md
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-brainstorming-gate.md
    - D:\Android_source\ai-growth-os\components\rules\rules\domain\agent-generated-code.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\comments.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\complexity-file-size.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\testing.md
    - C:\Users\dashuai\.codex\skills\karpathy-guidelines\SKILL.md
  project_refs:
    - GitHub Issue #6
    - AGENTS.md
    - build.md
    - err.md
    - AgentPanel.jsx send path
    - WorkspaceBackend, CodeBackend, Backends, NotesBackend, ScriptsBackend and JsvmpBackend
  missing_coverage:
    - 本地 vault 无本缺陷专用结论，以 origin/main exact source、三位 reviewer 的纯内存交错和 mutation-killing 自测为依据
    - AGOS default entry 的 legacy route 因外部项目无 registry task registration 返回 blocked；project-local task authority 为 ready，GitHub Issue #6 与主线程 owner 授权提供正式任务入口
```

## Brainstorming

```yaml
level: standard
proposal_mode: delegated-agents
brainstorming_method: executor-native
actual_agent_count: 3
agent_result_refs:
  - agent:workspace_ctx_matrix
  - agent:workspace_interleaving_tests
  - agent:workspace_window_ownership
agent_budget_guard:
  initial_review_agents: 3
  escalation_agents: 0
  divergence: low
  idle_agent_cleanup: checked
  timeout_policy: blocked-main-thread-rereview
  model_downgrade: forbidden
agent_lifecycle:
  budget:
    max_total_agents: 3
    max_new_agents_per_round: 3
    actual_agent_count: 3
  spawn_preconditions:
    dispatch_plan_ref: owner-request:multi-agent-follow-up-audit
    reclaim_before_spawn: not-needed-zero-open
    open_agent_count_before_dispatch: 0
  active_agent_refs:
    - none
  completion_status:
    completed:
      - agent:workspace_ctx_matrix
      - agent:workspace_interleaving_tests
      - agent:workspace_window_ownership
    idle:
      - none
    timeout:
      - none
    failed:
      - none
  closed_agent_refs:
    - agent:workspace_ctx_matrix
    - agent:workspace_interleaving_tests
    - agent:workspace_window_ownership
  timeout_handling: blocked-main-thread-rereview
  closeout_rule: all-completed-idle-timeout-agents-closed-or-owner-exception
  owner_exception_ref: none
user_decision: approved-create-issue-worktree-red-minimal-fix-and-verification
```

三位 reviewer 对 notes、find、scripts 与 JSVMP 的 ctx 丢失结论一致。关于显式 `workspaceRoot:null`，采用兼容性最小边界：只禁止明确会话 ctx 回退，完全省略 ctx 的旧直驱行为不变。lease 失权、迟到文件列表和 ConversationStore 并发属于邻接观察，不在本 Issue 新增机制。

## Scope Change Gate

- 最终工作树 reviewer 发现 `AgentSession.callTool()` 会把调用者省略的 `workspaceRoot` 压成 own `null`，导致当前 Workspace fail-closed 修复无法区分“省略”与“显式未绑定”，违反本计划保留的 raw 调用兼容合同。
- 正确最小扩展：允许修改 `AgentSession.sys.mjs`，仅在调用者省略 `opts.workspaceRoot` 时让 tool ctx 也省略该属性；显式 null 继续保留。隔离自测必须经过真实 `AgentSession.callTool()` 杀死该回归，并增加 runCtx 位于首个 `await ensureThread()` 之前的顺序断言。
- 牢大已明确批准该两路径扩展；先用真实 `AgentSession.callTool()` 与 runCtx 时序 mutation 确认 RED，再做最小修复并重新执行 focused、完整门禁和独立审查。第一次完整门禁仅保留为历史证据，不能代表最终树。

## Change Contract

```yaml
change_contract:
  mutation_intent: source
  target_contract:
    owner: Agent-session-tool-context
    expected_behavior: A 回合捕获的 workspaceRoot 与 win 在 B 改写共享 fallback 后仍贯穿 notes、find、scripts、JSVMP 与文件工具
    evidence_refs:
      - GitHub Issue #6
      - selftest-workspace-isolation.mjs deterministic A-block-B-switch-A-resume interleaving
  preserved_invariants:
    - name: direct-bound-workspace-tools
      owner: WorkspaceBackend
      baseline_ref: git:20a942590ad833116042c28c09723d18b10020a2
      regression_ref: selftest-workspace-isolation direct fs/run control
    - name: legacy-no-ctx-global-fallback
      owner: WorkspaceBackend
      baseline_ref: git:20a942590ad833116042c28c09723d18b10020a2
      regression_ref: selftest-workspace-isolation omitted-ctx compatibility
    - name: shared-profile-script-corpus
      owner: CodeBackend-and-ScriptsBackend
      baseline_ref: git:20a942590ad833116042c28c09723d18b10020a2
      regression_ref: unchanged corpusDir and toWorkspace-false behavior
    - name: public-tool-contract
      owner: Tools-and-ToolRouter
      baseline_ref: git:20a942590ad833116042c28c09723d18b10020a2
      regression_ref: complete selftest-toolrouter gate
    - name: issue-1-thread-routing
      owner: AgentPanel-and-AgentSession
      baseline_ref: git:20a942590ad833116042c28c09723d18b10020a2
      regression_ref: selftest-multi-window-routing and selftest-thread-reservation
  adjacent_surfaces:
    - name: explicit-unbound-session
      why_adjacent: session.run always supplies workspaceRoot including null
      risk: A 未绑定目录时使用 B 的全局根
      owner: WorkspaceBackend-and-CodeBackend
    - name: scripts-page-source
      why_adjacent: 保存目标和页面来源分别由 workspaceRoot 与 win 决定
      risk: B 页面源码被写入 A 目录
      owner: ScriptsBackend
    - name: jsvmp-trace-mirror
      why_adjacent: query 和 trace-stop 在成功后异步复制 trace
      risk: 未声明 ctx 被吞后静默不落盘
      owner: JsvmpBackend
  historical_state_refs:
    - closed PR #2 long branch is preserved read-only and forbidden as implementation source
    - dirty Issue #1 root worktree is outside this task
  stale_verdict_invalidation_refs:
    - any review before the last production or test mutation is stale
    - existing green gates do not cover A/B workspace interleaving
  regression_checks:
    - surface: deterministic-context-isolation
      command_or_evidence_ref: node additions/browser/components/agent-sidebar/dev/selftest-workspace-isolation.mjs
      expected_result: baseline mutations fail and fixed source passes
    - surface: sidebar-and-tools
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: build, all listed selftests and branding pass once
    - surface: dependency-security
      command_or_evidence_ref: npm audit against official registry
      expected_result: no high or critical advisory
  sibling_regression_guard:
    status: passed
    closeout_rule: passed-or-blocked-before-done
    exception_ref: none
  protected_feature_replay:
    status: passed
    known_good_features:
      - feature: direct-bound-workspace-tools-and-issue-1-thread-routing
        owner: WorkspaceBackend-and-AgentPanel
        baseline_evidence_ref: git:20a942590ad833116042c28c09723d18b10020a2 and existing workspace/multi-window/thread-reservation selftests
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: working-tree:issue-6-frozen-source-test-hash-set-2026-08-16
        expected_result: 显式 A ctx 的直接文件与执行工具继续命中 A，Issue #1 路由与 reservation 自测保持通过
        owner_visible_status: passed
        regression_status: passed
    forbidden_ops_until_replay:
      - claim-done
      - push
      - create-pr
      - merge
```

## Independent Verification Policy

```yaml
independent_verification_policy:
  schema: agos.independent-verification-policy.v1
  activation: after-last-mutation-before-closeout
  work_class: standard
  same_question_ref: session-plan:issue-6-window-workspace-isolation#final-head-review
  verification_lineage_ref: issue-6-window-workspace-isolation-final-head
  primary_verifier_count: 1
  reserve_slot_count: 1
  reserve_use_reasons:
    - platform-failure-replacement
    - fresh-verification-after-bounded-fix
  lane_freshness_rule: affected-lanes-only
  report_authority: advisory-only
  mainline_action_source: parent-task-object
```

## Execution Evidence

```yaml
execution_evidence:
  test:
    command_ref: build.md#Issue-6-focused-gate
    result_ref: baseline 7-pass-18-fail exact RED; reviewer raw-callTool RED 27-pass-1-fail and runCtx-order mutation killed; fixed isolation 28/28, workspace 25/25, toolrouter 37/37, routing and reservation PASS
  build:
    command_ref: build.md#侧栏构建
    result_ref: frozen working tree bundle 210.1kb
  review:
    command_ref: build.md#Issue-6-independent-review
    result_ref: fresh exact-working-tree reviewer APPROVE P0/P1/P2=0/0/0; independent five focused gates and diff check PASS; exact-head delivery review remains gated on commit
  verification:
    command_ref: build.md#完整轻量门禁
    result_ref: Windows Node v22.23.1 npm 10.9.8 fresh npm ci, bundle 210.1kb, fixed 14/14 selftest files, branding 22, official high audit and diff check passed once; lockfile and frozen source/test hashes unchanged
  closeout:
    command_ref: err.md#Issue-6
    result_ref: owner-authorized-git-delivery-in-progress
```

## 启动冻结

- 远端 `main` 与隔离 worktree 基线：commit `20a942590ad833116042c28c09723d18b10020a2`，tree `e97b070943b86ff90429612dc35fbd13b86e83a9`。
- GitHub 跟踪：`https://github.com/nonononull/firefox-reverse/issues/6`，创建时状态 OPEN。
- 主 worktree `D:\Android_source\firefox-reverse` 的 Issue #1 分支及其用户未提交 workflow 不属于本任务，禁止改写、清理或作为实现来源。
- 牢大在 `2026-08-16` 明确授权开始 Issue #6，在 reviewer 阻断后批准 `AgentSession.sys.mjs` 范围扩展，并最终授权一次性完成 commit、snapshot 绑定、exact-head 审查、push、PR 与 squash merge；分支禁止删除。
