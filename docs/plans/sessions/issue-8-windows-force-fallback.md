# Issue #8 Windows 强制关闭回退 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-8-windows-force-fallback
work_class: standard
task_summary: Windows 温和 taskkill 失败且 PID 明确存活时进入既有强制关闭与退出确认
project_root: D:\Android_source\firefox-reverse-worktrees\issue-8-windows-force-fallback
trigger_source: GitHub Issue #8、Reverse Lab Attempt 7b 根因证据与牢大直接授权
task_authority_kind: project-local
decision_status: approved
approval_source: direct-user
approved_decision_ref: session-plan:issue-8-windows-force-fallback#decision
mutation_intent: source
execution_profile: project-native-v1
brainstorming_method: executor-native
execution_contract: agos.execution-contract.v1
command_source: project-build-docs
implicit_tool_preconditions: forbidden
scope_hash: sha256:ca5ff5b31137aed5edcddf9189b712c131dbbe05f934b0049d6308146dd00702
owner_scope_ref: docs/plans/sessions/issue-8-windows-force-fallback.owner-scope.yml
owner_scope_hash: sha256:ca5ff5b31137aed5edcddf9189b712c131dbbe05f934b0049d6308146dd00702
selected_business_path: github-issue-pr-merge
verification_commands:
  - node additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - powershell fixed 14-selftest list from build.md
  - node scripts/check-branding-assets.mjs
  - npm audit --prefix additions/browser/components/agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
  - git diff --check
  - git diff --no-index EnvironmentBackend.sys.mjs EnvironmentBackendCurrent.sys.mjs
delivery_contract: agos.issue-pr-merge.v1
tracking_issue_ref: https://github.com/nonononull/firefox-reverse/issues/8
review_ref: pending-final-exact-head-review
pr_ref: pending
ci_ref: no-pull-request-ci
review_strategy: one fresh exact-head readonly reviewer after the last mutation
ci_expectation: no pull-request CI; record repository capability and local complete gate
merge_policy: owner-authorized-after-fresh-zero-finding-review
allowed_operations:
  - source-edit
  - write-code
  - write-test
  - project-doc-write
  - build
  - verification
  - git-commit
  - git-push
  - create-pr
  - squash-merge
forbidden_operations:
  - commit-without-owner-authorization
  - push-without-owner-authorization
  - create-pr-without-owner-authorization
  - merge-without-owner-authorization
  - start-or-modify-browser-runtime
  - kill-or-modify-existing-process
  - mutate-reverse-lab-runtime-state
  - mutate-lease-assignment-quarantine-or-runtime-json
  - add-public-tool-protocol-error-code-config-format-or-lifecycle-state

## Approved Decision

- 决策：先以确定性 fake 证明旧 `_terminatePid()` 在温和 `_killPid(..., { force:false })` 返回失败、PID 仍为 `alive` 时没有进入已有的 `force:true` 分支，再做最小控制流修复。
- 成功边界：温和命令失败后，PID 已 `dead` 可返回成功；PID 为 `alive` 才允许进入既有强制终止与死亡确认；PID 为 `unknown` 必须失败关闭且不得强制终止未确认对象。
- 终态边界：强制调用失败或强制后 PID 未确认死亡时继续保留 `closing` 与原 PID；只有确认死亡后才允许 `close()` 写入 `stopped/pid=null`。
- 范围：两份逐字同步的环境后端、现有 `selftest-environment.mjs`、`build.md`、`err.md` 与三份 Issue #8 控制文档；不改超时、公共工具、协议、配置、错误码或生命周期状态。
- 现场边界：Attempt 7b、control Firefox、手工 Firefox、lane Firefox、lease、assignment、quarantine 与 runtime JSON 在 Firefox 源码批次中均只读，不作为测试夹具。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - Firefox-Reverse Windows EnvironmentBackend env_close taskkill graceful failure alive force fallback fail closed
  vault_refs:
    - none-found-for-windows-taskkill-force-fallback
  rules_refs:
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-auto-application.md
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-brainstorming-gate.md
    - D:\Android_source\ai-growth-os\components\rules\rules\domain\agent-generated-code.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\comments.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\complexity-file-size.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\testing.md
    - C:\Users\dashuai\.codex\skills\karpathy-guidelines\SKILL.md
  project_refs:
    - GitHub Issue #8
    - build.md
    - err.md
    - additions/browser/components/agent-sidebar/modules/EnvironmentBackend.sys.mjs
    - additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
  missing_coverage:
    - 本地 GBrain 无本缺陷专用记录，以冻结 main 源码、Attempt 7b 只读 receipt 和确定性 RED 为事实依据
```

## Brainstorming

```yaml
level: standard
proposal_mode: delegated-agents
brainstorming_method: executor-native
actual_agent_count: 3
agent_result_refs:
  - governance_closeout_review:cb23809-request-changes-p1-1-p2-1
  - issue8_contract_review:approve-minimal-contract-windows-only-force-fallback
  - issue8_test_review:request-changes-p1-2-p2-1-mutation-matrix
agent_budget_guard:
  initial_review_agents: 2
  escalation_agents: 0
  divergence: low
  idle_agent_cleanup: checked
  timeout_policy: blocked-main-thread-rereview
  model_downgrade: forbidden
agent_lifecycle:
  budget:
    max_total_agents: 3
    max_new_agents_per_round: 2
    actual_agent_count: 3
  spawn_preconditions:
    dispatch_plan_ref: owner-approved-issue-8-plan-and-bounded-readonly-review
    reclaim_before_spawn: completed-agents-not-active
    open_agent_count_before_dispatch: 0
  active_agent_refs:
    - none
  completion_status:
    completed:
      - governance_closeout_review:cb23809-request-changes-p1-1-p2-1
      - issue8_contract_review:approve-minimal-contract
      - issue8_test_review:request-changes-test-gaps
    idle:
      - none
    timeout:
      - none
    failed:
      - none
  closed_agent_refs:
    - governance_closeout_review
    - issue8_contract_review
    - issue8_test_review
  timeout_handling: blocked-main-thread-rereview
  closeout_rule: all-completed-before-source-edit
  owner_exception_ref: none
user_decision: approved-new-issue-worktree-red-minimal-fix-full-gate-review-pr-merge
```

## Change Contract

```yaml
change_contract:
  mutation_intent: source
  target_contract:
    owner: EnvironmentBackend-_terminatePid
    expected_behavior: Windows graceful 失败且 PID 明确 alive 时进入既有 force 与死亡确认；dead 成功，unknown 失败关闭
    evidence_refs:
      - GitHub Issue #8
      - selftest-environment.mjs graceful-failure interleavings
  preserved_invariants:
    - name: confirmed-terminal-state-only
      owner: EnvironmentBackend-close
      baseline_ref: git:cb23809f3c5b97f6dcb91f401ab149d3f2b109a3
      regression_ref: selftest-environment.mjs close forced-stop positive and force-failure negative
    - name: pid-three-state-fail-closed
      owner: EnvironmentBackend-_pidState
      baseline_ref: err.md#v0.22.1-pid-three-state
      regression_ref: selftest-environment.mjs dead-alive-unknown checks
    - name: environment-create-open-status-delete-contracts
      owner: EnvironmentBackend
      baseline_ref: git:cb23809f3c5b97f6dcb91f401ab149d3f2b109a3
      regression_ref: complete 14-selftest gate
    - name: mirrored-build-module
      owner: Firefox-Reverse-build-input
      baseline_ref: EnvironmentBackend.sys.mjs equals EnvironmentBackendCurrent.sys.mjs
      regression_ref: git diff --no-index mirror comparison
  adjacent_surfaces:
    - name: graceful-command-reported-failure-but-process-died
      why_adjacent: Windows command exit status can disagree with post-command PID state
      risk: unnecessary force against an already dead PID
      owner: EnvironmentBackend-_terminatePid
    - name: pid-probe-unknown-after-graceful-failure
      why_adjacent: identity cannot be confirmed
      risk: force an unverified or reused PID
      owner: EnvironmentBackend-_pidState
    - name: force-command-failure-or-survivor
      why_adjacent: force attempt is not equivalent to confirmed death
      risk: publish false stopped terminal state
      owner: EnvironmentBackend-close
    - name: non-windows-graceful-failure
      why_adjacent: _terminatePid 同时服务 Unix TERM/KILL 路径
      risk: 将本次 Windows 修复扩大为 Unix 自动强制终止
      owner: EnvironmentBackend-_terminatePid
  historical_state_refs:
    - D:\reverse-lab\runtime-generations\5029f449-a7 evidence is readonly failure evidence
  stale_verdict_invalidation_refs:
    - Attempt 7b remains failed acceptance and cannot prove cleanup readiness
    - any review before the last production, test or governance mutation is stale
  regression_checks:
    - surface: graceful-failure-state-matrix
      command_or_evidence_ref: node additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
      expected_result: old implementation fails alive escalation; fixed implementation passes Windows dead/alive/unknown/force-failure and non-Windows no-force matrix
    - surface: environment-tooling
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: fresh install, build, 14 selftests and branding pass once
    - surface: mirrored-module
      command_or_evidence_ref: git diff --no-index EnvironmentBackend.sys.mjs EnvironmentBackendCurrent.sys.mjs
      expected_result: no difference
  sibling_regression_guard:
    status: blocked
    closeout_rule: passed-or-blocked-before-done
    exception_ref: none
  protected_feature_replay:
    status: planned
    known_good_features:
      - feature: environment-create-open-close-status-delete-and-pid-three-state
        owner: EnvironmentBackend
        baseline_evidence_ref: git:cb23809f3c5b97f6dcb91f401ab149d3f2b109a3 and existing selftest-environment.mjs
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: pending
        expected_result: 环境 create/open/close/status/delete、PID alive/dead/unknown 与全部 14 项自测保持通过
        actual_result: pending
        owner_visible_status: pending
        regression_status: pending
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
  same_question_ref: session-plan:issue-8-windows-force-fallback#final-head-review
  verification_lineage_ref: issue-8-windows-force-fallback-final-head
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
    command_ref: build.md#Issue-8-focused-gate
    result_ref: pending-deterministic-red-and-focused-green
  build:
    command_ref: build.md#侧栏构建
    result_ref: pending-complete-light-gate
  review:
    command_ref: build.md#独立审查
    result_ref: pending-final-exact-head-review
  verification:
    command_ref: build.md#完整轻量门禁
    result_ref: pending-complete-light-gate-audit-mirror-and-diff-check
  closeout:
    command_ref: err.md#Issue-8
    result_ref: pending-pr-and-squash-merge
```

## 启动冻结

- 远端 `main` 与隔离 worktree 基线：commit `cb23809f3c5b97f6dcb91f401ab149d3f2b109a3`，tree `2ce2e7a4599248a795c9c7397c686be892e8cf99`，ahead/behind `0/0`，创建后 clean。
- GitHub 跟踪：`https://github.com/nonononull/firefox-reverse/issues/8`，状态 OPEN。
- AGOS default-entry ReportOnly 在项目本地 task authority `READY` 后，因本仓没有中央 issue-state-v1 注册而返回 legacy intake `BLOCKED`；保留该失败，不把它表述为通过。GitHub Issue #8、project-local owner scope 与当前主线程授权是本任务的正式 authority。
- 原 worktree `D:\Android_source\firefox-reverse` 的 Issue #1 分支和用户已有 runtime workflow 修改禁止触碰。
- 牢大明确授权本任务完成 focused/full 门禁、独立审查、commit、push、PR 与 squash merge；该授权不覆盖发布二进制、替换现有 side-load、启动或处置任何真实 Firefox/Reverse Lab 进程。Firefox 合并后的新 side-load 与 Attempt 8 属于后续单独运行态 gate。
