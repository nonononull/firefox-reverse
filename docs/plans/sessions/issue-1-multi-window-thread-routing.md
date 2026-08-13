# Issue #1 多窗口 thread 路由修复 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-1-multi-window-thread-routing
work_class: standard
task_summary: 删除外部运行 thread 的自动接管，并让提示条在当前窗口新建独立 thread
project_root: D:\Android_source\firefox-reverse
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
scope_hash: sha256:4147bdeba7cc8a5c2d3c06e9178b1804ecf81c85917490d0c8b1607d2b0d5500
owner_scope_ref: docs/plans/sessions/issue-1-multi-window-thread-routing.owner-scope.yml
owner_scope_hash: sha256:4147bdeba7cc8a5c2d3c06e9178b1804ecf81c85917490d0c8b1607d2b0d5500
selected_business_path: github-issue-pr-merge
verification_commands:
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - node additions/browser/components/agent-sidebar/dev/selftest-multi-window-routing.mjs
  - node additions/browser/components/agent-sidebar/dev/selftest-thread-reservation.mjs
  - bash scripts/selftest-agent-tools.sh
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

## Approved Decision

- 决策：保留 `AgentSession` 的 owner token、心跳、同 thread 独占和多 thread 并行；只删除 `AgentPanel` 对其它窗口运行 thread 的自动 `openThread()` 接管，提示条点击改为 `newChat()`。
- 理由：现有多窗口底层能力有效，单任务观感来自 UI 路由错误；最小修复无需修改线程预留或全局 raw-tool 安全锁。
- 范围：fork 内三个源码/测试文件及本任务控制文档，完成 fork 内 Issue、PR、独立审查和 squash merge。
- 拒绝方案：不实现双窗口编辑同一 thread，不实现只读跟随，不增加 window/thread 公共 API，不向公开上游提 PR，不发布或安装浏览器。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - firefox reverse multi window thread reservation owner token
  vault_refs:
    - D:\Android_source\ai-growth-os\components\vault\07-Workflows\Bindings\Codex-Desktop-Knowledge-Automation.md
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
proposal_mode: delegated-agents
brainstorming_method: executor-native
actual_agent_count: 4
agent_result_refs:
  - prior-session:multi-window-architecture-review
  - prior-session:operator-experience-review
  - prior-session:verification-review
  - prior-session:safety-review
agent_budget_guard:
  initial_review_agents: 2
  escalation_agents: 2
  divergence: low
  idle_agent_cleanup: checked
  timeout_policy: blocked-main-thread-rereview
  model_downgrade: forbidden
agent_lifecycle:
  budget:
    max_total_agents: 4
    max_new_agents_per_round: 2
    actual_agent_count: 4
  spawn_preconditions:
    dispatch_plan_ref: prior-session-approved-plan
    reclaim_before_spawn: checked
    open_agent_count_before_dispatch: 0
  active_agent_refs:
    - none
  completion_status:
    completed:
      - prior-session:multi-window-architecture-review
      - prior-session:operator-experience-review
      - prior-session:verification-review
      - prior-session:safety-review
    idle:
      - none
    timeout:
      - none
    failed:
      - none
  closed_agent_refs:
    - prior-session:multi-window-architecture-review
    - prior-session:operator-experience-review
    - prior-session:verification-review
    - prior-session:safety-review
  timeout_handling: blocked-main-thread-rereview
  closeout_rule: all-completed-idle-timeout-agents-closed-or-owner-exception
  owner_exception_ref: none
user_decision: approved-minimal-ui-routing-fix
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
    - name: current-thread-stream-recovery
      why_adjacent: 外部运行探测 effect 也负责当前 thread 的续看恢复
      risk: 删除自动跟随时误删当前 thread busy 恢复
      owner: AgentPanel-external-running-effect
    - name: history-thread-open
      why_adjacent: 历史列表仍需调用 openThread 并经过 acquireThread
      risk: 全面禁用 openThread 导致历史不可用
      owner: AgentPanel-history
  historical_state_refs:
    - v0.22.4 old route calls openThreadRef.current(target.id)
    - red contract test fails on the old route and passes on the current worktree
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
    status: passed
    closeout_rule: passed-or-blocked-before-done
    exception_ref: none
  protected_feature_replay:
    status: passed
    known_good_features:
      - feature: thread reservation and current-thread recovery
        owner: AgentSession-and-AgentPanel
        baseline_evidence_ref: v0.22.4 source and red-test replay
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: git:b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1
        expected_result: reservation suite and aggregate selftests pass
        actual_result: PowerShell 完整链通过 sidebar bundle、13/13 Node 自测文件和 branding 22 文件检查；reservation 22 项断言与 multi-window routing 合同通过
        owner_visible_status: passed
        regression_status: passed
    forbidden_ops_until_replay: []
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
    result_ref: git:b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1-sidebar-and-13-selftests-pass
  build:
    command_ref: build.md#侧栏构建
    result_ref: git:b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1-bundle-211.4kb
  review:
    command_ref: build.md#独立审查
    result_ref: git:ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e-request-changes-p1-new-thread-claim-race; final exact-head rereview pending
  verification:
    command_ref: build.md#交付边界检查
    result_ref: git:b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1-lockfile-agent-session-and-diff-boundaries-pass
  closeout:
    command_ref: err.md#issue-1
    result_ref: pending-pr-and-squash-merge
```

## 现场记录

- 取证时间：`2026-08-13 18:52:34 +08:00`。
- fork 基线与上游 v0.22.4 源码提交均为 `7a77a66ed8361f858cfa0b19fd8239b63b4535f0`；tag object 为 `95def86131787fd0945bea1d951623828d1a2987`。
- 本任务不修改或启动本机已安装浏览器；fork 合并不等于安装包已更新。
- `2026-08-13 19:02:06 +08:00`：Windows PowerShell 完整轻量门禁通过，侧栏 bundle 为 209.8kb；13/13 Node 自测文件、thread reservation 22 项断言、新 multi-window routing 合同与 branding 22 文件检查全部通过。WSL/Git Bash 聚合入口的两次失败均发生在 bundle 工具链启动阶段，未形成产品测试失败，详情见 `err.md`。
- `2026-08-13 19:10:06 +08:00`：实现提交 `dfd91c6751feeeab48aeffd6ddac6dd42af3612f`、tree `1009baeba729b9969f39fa2b26e9ab5e1799c40a` 上重新执行 `npm ci` 与完整 PowerShell 门禁，结果再次全部通过。`origin/main` 与 `upstream/main` 均仍为 `7a77a66ed8361f858cfa0b19fd8239b63b4535f0`；GitHub Actions workflow 数为 0，因此后续 PR 使用明确 no-PR-CI 记录，不触发 release。
- `2026-08-13 19:50:40 +08:00`：独立 reviewer 对 `ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e` 返回 `REQUEST_CHANGES`，确认新 thread 在 `createThread()` 与 `acquireThread()` 之间可被其它窗口抢占，且创建者与 heartbeat 都会忽略失权。旧结论保留，不记为通过。
- `2026-08-13 19:50:40 +08:00`：修复提交 `b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1`、tree `549fb36b1b27f52f6002951484c76b1a076a3625` 统一了三条创建路径的有界精确认领，并让 heartbeat 失权后按选择代际恢复。`npm ci` 与最终 PowerShell 完整门禁通过：bundle `211.4kb`、13/13 Node 自测文件、reservation 22 项断言和 branding 22 文件；最终 exact-head 独立复审仍待执行。
