# Issue #4 env_close 实际退出确认 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-4-env-close-exit-confirmation
work_class: standard
task_summary: 仅在环境 Firefox 已明确退出后，env_close 才能发布 stopped 与 pid=null
project_root: D:\Android_source\firefox-reverse-worktrees\issue-4-env-close-exit-confirmation
trigger_source: GitHub Issue #4、Reverse Lab Attempt 6 假终态证据与牢大直接授权
task_authority_kind: project-local
decision_status: approved
approval_source: direct-user
approved_decision_ref: session-plan:issue-4-env-close-exit-confirmation#decision
mutation_intent: source
execution_profile: project-native-v1
brainstorming_method: executor-native
execution_contract: agos.execution-contract.v1
command_source: project-build-docs
implicit_tool_preconditions: forbidden
scope_hash: sha256:f093f588a5dc02df6a2f018fee265690f0891549ab13a4a18bf896cb4dc19b53
owner_scope_ref: docs/plans/sessions/issue-4-env-close-exit-confirmation.owner-scope.yml
owner_scope_hash: sha256:f093f588a5dc02df6a2f018fee265690f0891549ab13a4a18bf896cb4dc19b53
selected_business_path: github-issue-pr-merge
verification_commands:
  - node additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - powershell fixed 13-selftest list from build.md
  - node scripts/check-branding-assets.mjs
  - npm audit --prefix additions/browser/components/agent-sidebar --audit-level=high
  - git diff --check
  - git diff --no-index EnvironmentBackend.sys.mjs EnvironmentBackendCurrent.sys.mjs
delivery_contract: agos.issue-pr-merge.v1
tracking_issue_ref: https://github.com/nonononull/firefox-reverse/issues/4
review_strategy: one fresh exact-head readonly reviewer after the last mutation
ci_expectation: no pull-request CI; record the repository capability and local complete gate
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
  - add-public-tool-protocol-error-code-or-config-format

## Approved Decision

- 决策：先用确定性自测证明旧 `close()` 会在终止未确认时伪造成功，再做最小修复。只有目标 PID 明确为 dead，或无 PID 的本地进程句柄已明确给出退出码，才能清理 `_procs` 并写 `stopped/pid=null`。
- 失败策略：温和终止、强制终止或 PID 探测未能确认死亡时抛错；已落盘的 `closing` 与原 PID 保持不变，所有权记录继续保留，允许受管重试。
- 范围：两份必须同步的环境后端、现有 `selftest-environment.mjs`、`build.md`、`err.md` 与三份任务控制文档。禁止新增公共协议、错误码、配置格式、生命周期状态或跨仓抽象。
- 现场边界：Attempt 6、手工 Firefox、control Firefox、lane Firefox、lease、assignment、quarantine 与 runtime JSON 本批只读且不作为测试夹具。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - firefox reverse env_close EnvironmentBackend pid unknown process exit confirmation
  vault_refs:
    - none-found-for-firefox-env-close
  rules_refs:
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-auto-application.md
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-brainstorming-gate.md
    - D:\Android_source\ai-growth-os\components\rules\rules\domain\agent-generated-code.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\testing.md
    - C:\Users\dashuai\.codex\skills\karpathy-guidelines\SKILL.md
  project_refs:
    - GitHub Issue #4
    - build.md
    - err.md
    - additions/browser/components/agent-sidebar/modules/EnvironmentBackend.sys.mjs
    - additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
  missing_coverage:
    - 本地 vault 无本缺陷专用结论，以远端 main exact source、Attempt 6 只读证据和确定性红测为事实依据
```

## Brainstorming

```yaml
level: standard
proposal_mode: delegated-agents
brainstorming_method: executor-native
actual_agent_count: 2
agent_result_refs:
  - none-provider-unavailable
agent_budget_guard:
  initial_review_agents: 2
  escalation_agents: 0
  divergence: not-checked
  idle_agent_cleanup: checked
  timeout_policy: blocked-main-thread-rereview
  model_downgrade: forbidden
agent_lifecycle:
  budget:
    max_total_agents: 2
    max_new_agents_per_round: 2
    actual_agent_count: 2
  spawn_preconditions:
    dispatch_plan_ref: inherited-owner-request-for-bounded-review
    reclaim_before_spawn: not-needed-zero-open
    open_agent_count_before_dispatch: 0
  active_agent_refs:
    - none
  completion_status:
    completed:
      - issue4_exact_head_reviewer:git-ebfa1717-request-changes-p1-2-p2-1
    idle:
      - none
    timeout:
      - none
    failed:
      - backlog_reviewer:gpt-5.6-sol-provider-503
      - contract_reviewer:gpt-5.6-sol-provider-503
  closed_agent_refs:
    - backlog_reviewer:gpt-5.6-sol-provider-503
    - contract_reviewer:gpt-5.6-sol-provider-503
  timeout_handling: parent-reviews-plan-but-cannot-substitute-final-independent-review
  closeout_rule: fresh-fixed-model-review-required-before-delivery-closeout
  owner_exception_ref: none
user_decision: approved-issue-worktree-red-minimal-fix-and-verification
```

初始两个 reviewer 均在返回设计意见前因固定 `gpt-5.6-sol` 供应端 503 退出，失败记录保留且没有降级或换模。后续同模型 Reviewer 在 `ebfa171757e1c43187059e4af3eb37de0d1bc466` 完成审查并给出 P1=2、P2=1；`3f8e2eb07a385ed132a5722a1395036ce59040a7` 已按三条确定性交错修复，最终独立审查仍须绑定最后文档提交。

## Change Contract

```yaml
change_contract:
  mutation_intent: source
  target_contract:
    owner: EnvironmentBackend-close-lifecycle
    expected_behavior: 只有目标运行时已明确退出，env_close 才返回成功并发布 stopped 与 pid=null
    evidence_refs:
      - GitHub Issue #4
      - selftest-environment.mjs termination-confirmation negatives
  preserved_invariants:
    - name: close-success-shape
      owner: EnvironmentBackend-close
      baseline_ref: git:ddd9b620188804fc23636c057c827d6ed9746ee5
      regression_ref: selftest-environment.mjs confirmed-stop positive
    - name: pid-three-state-fail-closed
      owner: EnvironmentBackend-_pidState
      baseline_ref: err.md#v0.22.1-pid-three-state
      regression_ref: selftest-environment.mjs alive-dead-unknown checks
    - name: environment-open-create-delete-contracts
      owner: EnvironmentBackend
      baseline_ref: git:ddd9b620188804fc23636c057c827d6ed9746ee5
      regression_ref: complete 13-selftest gate
    - name: mirrored-build-module
      owner: Firefox-Reverse-build-input
      baseline_ref: EnvironmentBackend.sys.mjs equals EnvironmentBackendCurrent.sys.mjs
      regression_ref: git diff --no-index mirror comparison
  adjacent_surfaces:
    - name: locally-owned-subprocess-close
      why_adjacent: 已启动 Firefox 由 _procs 持有句柄
      risk: 未确认退出时过早删除进程所有权和输出记录
      owner: EnvironmentBackend-_procs
    - name: persisted-pid-close-after-restart
      why_adjacent: 后端重启后只有 runtime PID
      risk: _terminatePid 返回 ok false 后仍伪造 stopped
      owner: EnvironmentBackend-_terminatePid
    - name: delete-after-close
      why_adjacent: delete 以 stopped/closing 状态为安全门
      risk: 假 stopped 会允许删除仍在运行的环境目录
      owner: EnvironmentBackend-delete
  historical_state_refs:
    - D:\reverse-lab\runtime-generations\5029f449\evidence\attempt-6-three-lane-harness-postcheck.json is readonly defect evidence
  stale_verdict_invalidation_refs:
    - Attempt 6 stopped/pid-null JSON is known false terminal state and cannot prove cleanup
    - any review before the last production or test mutation is stale
  regression_checks:
    - surface: termination-failure-retains-closing
      command_or_evidence_ref: node additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
      expected_result: old implementation fails; fixed implementation passes
    - surface: environment-tooling
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: build, 13 selftests and branding pass once without retry
    - surface: mirrored-module
      command_or_evidence_ref: git diff --no-index EnvironmentBackend.sys.mjs EnvironmentBackendCurrent.sys.mjs
      expected_result: no difference
  sibling_regression_guard:
    status: passed
    closeout_rule: passed-or-blocked-before-done
    exception_ref: none
  protected_feature_replay:
    status: planned
    known_good_features:
      - feature: environment-create-open-status-delete-and-pid-three-state
        owner: EnvironmentBackend
        baseline_evidence_ref: git:ddd9b620188804fc23636c057c827d6ed9746ee5 and existing selftest-environment.mjs
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: git:3f8e2eb07a385ed132a5722a1395036ce59040a7
        expected_result: 环境 create/open/status/delete、PID alive/dead/unknown 与全部 13 项自测保持通过
        actual_result: bundle、固定 13/13 Node 自测与 branding 22 通过
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
  same_question_ref: session-plan:issue-4-env-close-exit-confirmation#final-head-review
  verification_lineage_ref: issue-4-env-close-exit-confirmation-final-head
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
    command_ref: build.md#Issue-4-focused-gate
    result_ref: git:3f8e2eb07a385ed132a5722a1395036ce59040a7; three-reviewer-mutations-red; focused-green
  build:
    command_ref: build.md#侧栏构建
    result_ref: git:3f8e2eb07a385ed132a5722a1395036ce59040a7; bundle-210.1kb
  review:
    command_ref: build.md#独立审查
    result_ref: git:ebfa171757e1c43187059e4af3eb37de0d1bc466-request-changes-corrected; final-head-review-pending
  verification:
    command_ref: build.md#完整轻量门禁
    result_ref: git:3f8e2eb07a385ed132a5722a1395036ce59040a7; npm-ci-build-13-selftests-branding22-audit-high-mirror-diff-clean-passed
  closeout:
    command_ref: err.md#Issue-4
    result_ref: owner-authorized-delivery-pending-final-review
```

## 启动冻结

- 远端 `main` 与隔离 worktree 基线：commit `ddd9b620188804fc23636c057c827d6ed9746ee5`，tree `d1bf351bf478a10f8605f2bef818c0d8a9476958`。
- GitHub 跟踪：`https://github.com/nonononull/firefox-reverse/issues/4`，状态 OPEN。
- 主 worktree `D:\Android_source\firefox-reverse` 的 Issue #1 分支与用户修改不属于本任务，禁止读取后写回或清理。
- 牢大在 `2026-08-16` 明确授权完成本批并尽快交付生产；该授权覆盖门禁通过后的 commit、push、PR 与 squash merge，不扩大到发布二进制、替换本机 `omni.ja`、启动或处置真实 Firefox/Reverse Lab 运行态。
