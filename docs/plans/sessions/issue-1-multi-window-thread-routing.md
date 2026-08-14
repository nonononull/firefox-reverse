# Issue #1 多窗口 thread 路由修复 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-1-multi-window-thread-routing
work_class: standard
task_summary: 删除外部运行 thread 的自动接管，并让提示条在当前窗口新建独立 thread
project_root: D:\Android_source\firefox-reverse-worktrees\issue-1-minimal-thread-routing
trigger_source: GitHub Issue #1 与牢大批准方案
task_authority_kind: project-local
decision_status: approved
approval_source: direct-user
approved_decision_ref: session-plan:issue-1-multi-window-thread-routing#decision
mutation_intent: source
execution_profile: project-native-v1
brainstorming_method: executor-native
execution_contract: agos.execution-contract.v1
command_source: project-build-docs
implicit_tool_preconditions: forbidden
scope_hash: sha256:1898b6c6f8a0b6d0f4037b887fa9ed56b18676d72dfb55f13b59bc5e7e34eb93
owner_scope_ref: docs/plans/sessions/issue-1-multi-window-thread-routing.owner-scope.yml
owner_scope_hash: sha256:1898b6c6f8a0b6d0f4037b887fa9ed56b18676d72dfb55f13b59bc5e7e34eb93
selected_business_path: github-issue-pr-merge
verification_commands:
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - node additions/browser/components/agent-sidebar/dev/selftest-multi-window-routing.mjs
  - node additions/browser/components/agent-sidebar/dev/selftest-thread-reservation.mjs
  - powershell fixed 13-selftest list from build.md
  - git diff --check
delivery_contract: agos.issue-pr-merge.v1
tracking_issue_ref: https://github.com/nonononull/firefox-reverse/issues/1
review_strategy: one fresh exact-head readonly reviewer
ci_expectation: no pull-request CI; record local complete gate and repository capability
merge_policy: squash-merge-fork-only
allowed_operations:
  - source-edit
  - write-code
  - write-test
  - project-doc-write
  - git-add
  - commit
  - push
  - pr
  - merge
  - delivery-closeout
forbidden_operations:
  - create-upstream-pr
  - publish-binary
  - replace-installed-omni-ja
  - start-or-modify-browser-runtime
  - mutate-reverse-lab
  - mutate-pingbo-or-bet365
  - access-account-or-live-origin
  - modify-agent-session-reservation-or-raw-tool-lock
  - modify-conversation-store-or-persistence-format
  - add-generation-claim-run-epoch-or-recovery-journal
  - add-tests-outside-fixed-four-contracts
  - reopen-current-scope-from-reviewer-observation

## Approved Decision

- 决策：保留 `AgentSession` 现有 owner、心跳、TTL、同 thread 独占和多 thread 并行；只在 `AgentPanel` 删除运行 thread 的自动接管。提示条调用 `newChat()`，初始化和历史打开跳过运行 thread，发送前同步拒绝当前 external run。
- 理由：面板无法用现有 API 证明重挂载后的运行任务仍属于自己；最小且失败关闭的策略是把重挂载运行任务视为 external，而不是引入 run epoch、generation、claim 或持久化 journal。
- 范围：一个生产文件、一个不超过 100 行的路由合同测试、聚合入口及必要控制文档。生产差异目标小于 100 行，删除优先于新增。
- 拒绝方案：不恢复运行 thread 的跨重挂载实时跟随，不实现双窗口编辑或只读跟随，不修改 `AgentSession`/`ConversationStore`，不增加公共 API，不向公开上游提 PR，不发布或安装浏览器。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - firefox reverse multi window thread reservation owner token
  vault_refs:
    - none-found-for-firefox-multi-window-routing
  rules_refs:
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-auto-application.md
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-brainstorming-gate.md
    - C:\Users\dashuai\.codex\skills\karpathy-guidelines\SKILL.md
  project_refs:
    - GitHub Issue #1
    - additions/browser/components/agent-sidebar/content/AgentPanel.jsx
    - additions/browser/components/agent-sidebar/modules/AgentSession.sys.mjs
    - additions/browser/components/agent-sidebar/dev/selftest-thread-reservation.mjs
  missing_coverage:
    - 本地知识库没有本缺陷专用结论，以 v0.22.4 exact source、红测和现有 reservation 自测为事实依据
```

## Brainstorming

```yaml
level: standard
proposal_mode: simulated-roles
brainstorming_method: executor-native
actual_agent_count: 0
agent_result_refs:
  - owner-correction:current-thread:minimal-code-no-overdesign
agent_budget_guard:
  initial_review_agents: 0
  escalation_agents: 0
  divergence: not-checked
  idle_agent_cleanup: not-available
  timeout_policy: blocked-main-thread-rereview
  model_downgrade: forbidden
agent_lifecycle:
  budget:
    max_total_agents: 1
    max_new_agents_per_round: 1
    actual_agent_count: 0
  spawn_preconditions:
    dispatch_plan_ref: none-before-final-review
    reclaim_before_spawn: not-needed-zero-open
    open_agent_count_before_dispatch: 0
  active_agent_refs:
    - none
  completion_status:
    completed:
      - none
    idle:
      - none
    timeout:
      - none
    failed:
      - none
  closed_agent_refs:
    - none
  timeout_handling: blocked-main-thread-rereview
  closeout_rule: all-completed-idle-timeout-agents-closed-or-owner-exception
  owner_exception_ref: none
user_decision: approved-scope-correction-and-minimal-ui-routing-fix
```

## Change Contract

```yaml
change_contract:
  mutation_intent: source
  target_contract:
    owner: AgentPanel-external-running-visibility
    expected_behavior: 其它窗口运行的 thread 只显示提示；提示条在当前窗口新建独立 thread，不认领外部 thread
    evidence_refs:
      - GitHub Issue #1
      - selftest-multi-window-routing.mjs
  preserved_invariants:
    - name: same-thread-live-window-exclusive
      owner: AgentSession-reservation
      baseline_ref: git:7a77a66ed8361f858cfa0b19fd8239b63b4535f0
      regression_ref: selftest-thread-reservation.mjs
    - name: different-threads-may-run-in-parallel
      owner: AgentSession-sessions-map
      baseline_ref: git:7a77a66ed8361f858cfa0b19fd8239b63b4535f0
      regression_ref: AgentSession.sys.mjs remains unchanged
    - name: raw-tool-global-concurrency-guard
      owner: AgentSession-callTool
      baseline_ref: git:7a77a66ed8361f858cfa0b19fd8239b63b4535f0
      regression_ref: AgentSession.sys.mjs remains unchanged and aggregate selftests pass
  adjacent_surfaces:
    - name: mounted-current-thread-streaming
      why_adjacent: 当前面板发送后仍依赖 busy 流式轮询
      risk: 删除自动跟随时不得破坏同一挂载内已启动任务
      owner: AgentPanel-send-and-streaming
    - name: history-thread-open
      why_adjacent: 空闲历史仍需调用 openThread 并经过 acquireThread
      risk: 运行历史必须失败关闭，空闲历史仍可打开
      owner: AgentPanel-history
    - name: initial-thread-selection
      why_adjacent: 初始化原本直接选择最新历史
      risk: 最新历史正在运行时不得自动绑定
      owner: AgentPanel-initialization
  historical_state_refs:
    - v0.22.4 old route calls openThreadRef.current(target.id)
    - old branch codex/issue-1-multi-window-thread-routing is preserved as rejected overdesign evidence
  stale_verdict_invalidation_refs:
    - 工作树测试结果只属于未提交状态，提交后必须重新验证 final SHA
  regression_checks:
    - surface: external-running-routing
      command_or_evidence_ref: node selftest-multi-window-routing.mjs
      expected_result: no external openThread route; banner calls newChat
    - surface: reservation-and-heartbeat
      command_or_evidence_ref: node selftest-thread-reservation.mjs
      expected_result: all pass
    - surface: sidebar-and-agent-tooling
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: bundle, 13 selftests and branding all pass
  sibling_regression_guard:
    status: pending
    closeout_rule: passed-or-blocked-before-done
    exception_ref: none
  protected_feature_replay:
    status: pending
    known_good_features:
      - feature: thread reservation and current-thread recovery
        owner: AgentSession-and-mounted-AgentPanel
        baseline_evidence_ref: v0.22.4 source and red-test replay
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: pending-final-sha
        expected_result: reservation suite, mounted send/stream path and aggregate selftests pass; remount running thread fails closed
        actual_result: pending
        owner_visible_status: pending
        regression_status: pending
    forbidden_ops_until_replay:
      - merge
      - claim-done
```

## Independent Verification Policy

```yaml
independent_verification_policy:
  schema: agos.independent-verification-policy.v1
  activation: after-last-mutation-before-closeout
  work_class: standard
  same_question_ref: session-plan:issue-1-multi-window-thread-routing#final-head-review
  verification_lineage_ref: issue-1-multi-window-thread-routing-final-head
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
    command_ref: build.md#完整轻量门禁
    result_ref: pending-final-sha
  build:
    command_ref: build.md#侧栏构建
    result_ref: pending-final-sha
  review:
    command_ref: build.md#独立审查
    result_ref: pending
  verification:
    command_ref: build.md#交付边界检查
    result_ref: pending
  closeout:
    command_ref: err.md#issue-1
    result_ref: pending-pr-and-squash-merge
```

## 现场记录

- 范围纠正取证时间：`2026-08-14 18:29:10 +08:00`。
- fork 基线与上游 v0.22.4 源码提交均为 `7a77a66ed8361f858cfa0b19fd8239b63b4535f0`；tag object 为 `95def86131787fd0945bea1d951623828d1a2987`。
- 本任务不修改或启动本机已安装浏览器；fork 合并不等于安装包已更新。
- 旧 70 提交分支和 PR #2 不删除、不续改；本分支只交付固定四条合同。
