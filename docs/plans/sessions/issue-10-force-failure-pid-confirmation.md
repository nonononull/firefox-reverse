# Issue #10 强制停止失败后的 PID 终态确认 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-10-force-failure-pid-confirmation
work_class: standard
task_summary: 强制停止命令返回失败后继续有界观察 PID，只在明确 dead 时完成 env_close
project_root: D:\Android_source\firefox-reverse-worktrees\issue-10-force-failure-pid-confirmation
trigger_source: GitHub Issue #10、Paseo Reverse Lab Attempt 9 失败 receipt 与牢大直接继续授权
task_authority_kind: project-local
decision_status: approved
approval_source: inherited-user-instruction
approved_decision_ref: session-plan:issue-10-force-failure-pid-confirmation#decision
mutation_intent: source
execution_profile: project-native-v1
brainstorming_method: executor-native
execution_contract: agos.execution-contract.v1
command_source: project-build-docs
implicit_tool_preconditions: forbidden
scope_hash: sha256:7e8fd042d084346170ac068b4b9d82e0577fcb416c9d9522547259efdf2939c3
owner_scope_ref: docs/plans/sessions/issue-10-force-failure-pid-confirmation.owner-scope.yml
owner_scope_hash: sha256:7e8fd042d084346170ac068b4b9d82e0577fcb416c9d9522547259efdf2939c3
selected_business_path: github-issue-pr-merge
verification_commands:
  - node additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
  - git diff --no-index EnvironmentBackend.sys.mjs EnvironmentBackendCurrent.sys.mjs
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - powershell fixed 14-selftest list from build.md
  - node scripts/check-branding-assets.mjs
  - npm audit --prefix additions/browser/components/agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
  - git diff --check
delivery_contract: agos.issue-pr-merge.v1
tracking_issue_ref: https://github.com/nonononull/firefox-reverse/issues/10
base_ref: main@c0008f98dfd3a4a9d57c29e156c89e90c7734504
pr_branch: codex/issue-10-force-failure-pid-confirmation
review_ref: pending-final-exact-head-review
pr_ref: pending
ci_ref: no-pull-request-ci
merge_ref: pending-owner-authorized-squash
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
  - start-or-modify-browser-runtime
  - kill-or-modify-existing-process
  - mutate-reverse-lab-runtime-state
  - mutate-lease-assignment-quarantine-or-runtime-json
  - replace-installed-or-sideloaded-omni-ja
  - add-public-tool-protocol-error-code-config-format-timeout-or-lifecycle-state

## Approved Decision

- 在 `_terminatePid()` 已进入 force 分支后，不再把强制命令退出码当成终态；无论强制命令返回 true 或 false，都复用既有 20 次、每次 250ms 的有界 PID 观察窗口。
- 只有 `_pidState(pid) === dead` 才返回成功；窗口内持续 alive 或 unknown 都继续失败关闭。强制命令返回 false 而 PID 随后 dead 时保留 `forced:false`，避免伪称强制命令成功。
- 不增加新超时、配置、状态、错误码或公共 API；只修改两份逐字镜像的 EnvironmentBackend 和现有环境自测。
- Attempt 9 receipt、a8/a9 quarantine、control Firefox、手工 Firefox、runtime JSON、assignment 和 lease 永久只读；源码批次不启动或处置真实进程。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - Firefox-Reverse EnvironmentBackend force taskkill false delayed PID dead env_close closing
  vault_refs:
    - none-found-for-force-command-false-delayed-death
  rules_refs:
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-auto-application.md
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-brainstorming-gate.md
    - D:\Android_source\ai-growth-os\components\rules\rules\domain\agent-generated-code.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\comments.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\complexity-file-size.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\testing.md
    - C:\Users\dashuai\.codex\skills\karpathy-guidelines\SKILL.md
  project_refs:
    - GitHub Issue #10
    - GitHub Issue #8 and PR #9
    - build.md
    - err.md
    - additions/browser/components/agent-sidebar/modules/EnvironmentBackend.sys.mjs
    - additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
    - private Attempt 9 receipt sha256:c2769c0f757022ff94cd2ea8daa43b7023804a515aec43e6adfab6b34655bae8
  missing_coverage:
    - 本地 GBrain 无本缺陷专用记录，以冻结 main 源码、Issue #8 历史合同、Attempt 9 只读证据和确定性 RED 为事实依据
```

## Brainstorming

```yaml
level: standard
proposal_mode: delegated-agents
brainstorming_method: executor-native
actual_agent_count: 2
agent_result_refs:
  - firefox_force_contract_review:contract-approve
  - firefox_force_test_review:mutation-matrix-approve
agent_budget_guard:
  initial_review_agents: 2
  escalation_agents: 0
  divergence: low
  idle_agent_cleanup: checked
  timeout_policy: blocked-main-thread-rereview
  model_downgrade: forbidden
agent_lifecycle:
  budget:
    max_total_agents: 2
    max_new_agents_per_round: 2
    actual_agent_count: 2
  spawn_preconditions:
    dispatch_plan_ref: owner-approved-firefox-issue-10-bounded-readonly-review
    reclaim_before_spawn: checked
    open_agent_count_before_dispatch: 0
  active_agent_refs:
    - none
  completion_status:
    completed:
      - firefox_force_contract_review
      - firefox_force_test_review
    idle:
      - none
    timeout:
      - none
    failed:
      - none
  closed_agent_refs:
    - firefox_force_contract_review
    - firefox_force_test_review
  timeout_handling: blocked-main-thread-rereview
  closeout_rule: all-completed-before-source-edit
  owner_exception_ref: none
user_decision: approved-new-issue-worktree-red-minimal-fix-full-gate-review-pr-merge-then-return-to-paseo-issue-10
agent_proposals:
  - role: architecture-reviewer
    recommendation: force true 或 false 都复用既有 20 次 PID 观察窗口，明确 dead 才成功
    risks: force false 被误当成功或 unknown 被误当 dead
    required_changes: 删除 force false 立即返回，仅保留有界状态确认
    reject_if: 修改 close、pidState、kill 参数、公共合同或超时配置
  - role: verification-reviewer
    recommendation: 用 force false delayed-dead 正例和 persistent alive/unknown 负例杀死旧流与错误修法
    risks: 只写正例会放过无确认直接成功的突变
    required_changes: 保留 force true 负例并精确消费全部状态和 kill 调用
    reject_if: helper 不能证明最后一次 dead 探测发生
  - role: operator-experience-reviewer
    recommendation: Attempt 9 保持失败和 quarantine，只从新 Firefox commit 生成新 side-load 后另开 generation
    risks: 用补偿终态覆盖首次失败会伪造 3/3 正常 stop
    required_changes: 源码批次零真实运行态写入，历史 receipt 按哈希保留
    reject_if: 需要 kill、手改 JSON、删 lease 或复用 a9 作为 PASS
```

## Change Contract

```yaml
change_contract:
  mutation_intent: source
  target_contract:
    owner: EnvironmentBackend-_terminatePid
    expected_behavior: force 命令失败后仍有界确认 PID；dead 成功，alive 或 unknown 失败关闭
    evidence_refs:
      - GitHub Issue #10
      - private Attempt 9 receipt sha256:c2769c0f757022ff94cd2ea8daa43b7023804a515aec43e6adfab6b34655bae8
      - selftest-environment.mjs force-failure interleavings
  preserved_invariants:
    - name: confirmed-terminal-state-only
      owner: EnvironmentBackend-close
      baseline_ref: git:c0008f98dfd3a4a9d57c29e156c89e90c7734504
      regression_ref: selftest-environment.mjs close positive and survivor/unknown negatives
    - name: pid-three-state-fail-closed
      owner: EnvironmentBackend-_pidState
      baseline_ref: GitHub Issue #4 and Issue #8
      regression_ref: deterministic dead-alive-unknown matrix
    - name: force-result-attribution
      owner: EnvironmentBackend-_terminatePid
      baseline_ref: git:c0008f98
      regression_ref: force false plus delayed dead returns ok true forced false
    - name: mirrored-build-module
      owner: Firefox-Reverse-build-input
      baseline_ref: EnvironmentBackend.sys.mjs equals EnvironmentBackendCurrent.sys.mjs
      regression_ref: git diff --no-index mirror comparison
  adjacent_surfaces:
    - name: force-false-and-pid-survives
      why_adjacent: 命令失败不能被误升为成功
      risk: 发布假 stopped 终态
      owner: EnvironmentBackend-_terminatePid
    - name: force-false-and-pid-unknown
      why_adjacent: PID 身份无法确认
      risk: 把探测故障解释为退出
      owner: EnvironmentBackend-_pidState
    - name: force-true-but-pid-survives
      why_adjacent: 命令成功不等于进程死亡
      risk: 复发 Issue #4 的假终态
      owner: EnvironmentBackend-close
    - name: non-windows-terminate-path
      why_adjacent: 同一函数服务 Unix TERM/KILL
      risk: 意外改变平台分支或 forced 语义
      owner: EnvironmentBackend-_terminatePid
  historical_state_refs:
    - Paseo Attempts 8 and 9 remain failed, quarantined, and immutable
    - Firefox Issue #8 verdict proves graceful-failure escalation but not post-force-failure PID observation
  stale_verdict_invalidation_refs:
    - PR #9 review and complete gate predate this route and cannot prove Issue #10
    - any review before the last production, test or governance mutation is stale
  regression_checks:
    - surface: force-failure-state-matrix
      command_or_evidence_ref: node additions/browser/components/agent-sidebar/dev/selftest-environment.mjs
      expected_result: old implementation fails force false plus delayed dead; fixed implementation passes delayed dead and rejects persistent alive/unknown
    - surface: environment-tooling
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: fresh install, build, fixed 14 selftests and branding pass once
    - surface: mirrored-module
      command_or_evidence_ref: git diff --no-index EnvironmentBackend.sys.mjs EnvironmentBackendCurrent.sys.mjs
      expected_result: no difference
  sibling_regression_guard:
    status: pending
    closeout_rule: passed-or-blocked-before-done
    exception_ref: none
  protected_feature_replay:
    status: planned
    known_good_features:
      - feature: environment-create-open-close-status-delete-and-pid-three-state
        owner: EnvironmentBackend
        baseline_evidence_ref: git:c0008f98 and existing selftest-environment.mjs
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: pending
        expected_result: 环境 CRUD、PID dead/alive/unknown、graceful/force 路径与全部 14 项自测保持通过
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
  same_question_ref: session-plan:issue-10-force-failure-pid-confirmation#final-head-review
  verification_lineage_ref: issue-10-force-failure-pid-confirmation-final-head
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
    command_ref: build.md#Issue-10-focused-gate
    result_ref: deterministic RED actual-ok-false expected-ok-true; focused EnvironmentBackend selftest and mirror GREEN
  build:
    command_ref: build.md#完整轻量门禁
    result_ref: pending-final-tree
  review:
    command_ref: build.md#Issue-10-independent-review
    result_ref: pending-final-exact-head-review
  verification:
    command_ref: build.md#Issue-10-delivery-boundary
    result_ref: pending-audit-mirror-diff-and-scope
  closeout:
    command_ref: err.md#Issue-10
    result_ref: pending-pr-merge-and-return-to-paseo-issue-10
```

## 启动冻结

- 隔离 worktree 基线：commit `c0008f98dfd3a4a9d57c29e156c89e90c7734504`，tree `e1b48e02b4877a8c235a9a7a82359c4ea9b51023`，创建后 clean，branch `codex/issue-10-force-failure-pid-confirmation`。
- GitHub 跟踪：`https://github.com/nonononull/firefox-reverse/issues/10`，状态 OPEN。
- 原 `D:\Android_source\firefox-reverse` 的 dirty Issue #1 worktree禁止触碰；Reverse Lab a8/a9、control Firefox 与全部 quarantine 只读。
- 牢大已授权完成 Firefox 专门 Issue、focused/full 门禁、独立审查、PR/合并，然后重新生成 exact side-load 并返回 Paseo Issue #10。
