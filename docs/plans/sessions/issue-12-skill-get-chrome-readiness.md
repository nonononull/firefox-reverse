# Issue #12 skill_get chrome 资源就绪 Session Plan

schema_version: agos.session-plan.v1
architecture_contract_version: agos.brainstorming-gate.v1
task_id: issue-12-skill-get-chrome-readiness
work_class: standard
task_summary: 修复 Firefox 内置 Agent 首次读取 skill 正文时因 chrome 资源读取不终结而超时
project_root: D:\Android_source\firefox-reverse-worktrees\issue-12-skill-get-chrome-readiness
trigger_source: GitHub Issue #12、Firefox-only 真实验收失败证据与牢大直接授权
task_authority_kind: project-local
decision_status: approved
approval_source: inherited-user-instruction
approved_decision_ref: session-plan:issue-12-skill-get-chrome-readiness#decision
owner_authorization_ref: owner-direct:2026-08-18-firefox-first-no-stepwise-approval
mutation_intent: source
execution_profile: project-native-v1
brainstorming_method: executor-native
execution_contract: agos.execution-contract.v1
command_source: project-build-docs
implicit_tool_preconditions: forbidden
scope_hash: sha256:01f6e6c0e66ada17b146e129794ce207e8beb0876fdfbabdd102a984322027f5
owner_scope_ref: docs/plans/sessions/issue-12-skill-get-chrome-readiness.owner-scope.yml
owner_scope_hash: sha256:01f6e6c0e66ada17b146e129794ce207e8beb0876fdfbabdd102a984322027f5
selected_business_path: github-issue-pr-merge-then-exact-sideload
user_decision: approved-firefox-first-run-through-delivery-without-stepwise-authorization
verification_commands:
  - node additions/browser/components/agent-sidebar/dev/selftest-skill-backend.mjs
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - powershell fixed 15-selftest list from build.md
  - node scripts/check-branding-assets.mjs
  - npm audit --prefix additions/browser/components/agent-sidebar --audit-level=high --registry=https://registry.npmjs.org
  - git diff --check
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
  - generate-exact-sideload
  - firefox-only-runtime-verification
forbidden_operations:
  - mutate-paseo-reverse-lab-source-or-config
  - mutate-camoufox-source-config-runtime-or-failed-state
  - replace-existing-sideload
  - kill-or-modify-existing-process
  - mutate-lease-assignment-quarantine-or-runtime-json
delivery_contract: agos.issue-pr-merge.v1
tracking_issue_ref: https://github.com/nonononull/firefox-reverse/issues/12
base_ref: main@fe7a39f6a3ec9abe6943b77f261254ea30711233
pr_branch: codex/issue-12-skill-get-chrome-readiness
review_strategy: main-thread-exact-head-diff-audit
ci_expectation: no-pull-request-ci; use one fresh local complete lightweight gate
merge_policy: owner-authorized-squash-after-zero-finding-audit
review_ref: pending-main-thread-exact-head-review
pr_ref: pending
ci_ref: no-pull-request-ci
merge_ref: pending-owner-authorized-squash

## Approved Decision

- 先以 fake `NetUtil.asyncFetch()` 永不回调构造有界反例，确认旧 `_readChrome()` 不终结。
- 仅把 `SkillBackend._readChrome()` 改为 Firefox 系统模块已采用的 `fetch(chrome://...)`、`response.ok` 与 `response.text()` 路径。
- 保持 `skill_get` 返回协议、工具数量、模板名称、缓存语义、`AgentSession`、JSVMP 和 Paseo Reverse Lab 不变。
- focused GREEN 后只执行一次完整轻量门禁；生产或测试再变化则原完整证据失效。
- 合并后生成新的 exact side-load，不覆盖旧 side-load；只做 Firefox-only `skill_get`、受管 Agent 调用、页面语义与公开 stop 验收。
- Camoufox 源码、配置、运行态与失败现场全程冻结。

## Local Knowledge Lookup

```yaml
local_knowledge_lookup:
  gbrain_queries:
    - Firefox-Reverse skill_get SkillBackend NetUtil asyncFetch Marionette timeout
  vault_refs:
    - none-found-for-skillbackend-chrome-fetch-timeout
  rules_refs:
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-auto-application.md
    - D:\Android_source\ai-growth-os\components\rules\rules\workflows\ai-growth-os-brainstorming-gate.md
    - D:\Android_source\ai-growth-os\components\rules\rules\domain\agent-generated-code.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\comments.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\complexity-file-size.md
    - D:\Android_source\ai-growth-os\components\rules\rules\quality\testing.md
    - C:\Users\dashuai\.codex\skills\karpathy-guidelines\SKILL.md
  project_refs:
    - GitHub Issue #12
    - build.md
    - err.md
    - additions/browser/components/agent-sidebar/modules/SkillBackend.sys.mjs
    - additions/browser/components/agent-sidebar/modules/Tools.sys.mjs
    - exact side-load fe7a39f6 byte locks and Firefox-only timeout receipt
  missing_coverage:
    - 本地知识库无本缺陷专用记录，以冻结源码、side-load 字节锁和确定性 RED 为准
```

## Change Contract

```yaml
change_contract:
  target_contract:
    owner: SkillBackend-_readChrome
    expected_behavior: chrome skill 与模板资源读取必须成功终结或以错误终结，不能无限等待回调
    evidence_refs:
      - GitHub Issue #12
      - Firefox-only BACKEND_TIMEOUT receipt
  preserved_invariants:
    - name: skill-get-envelope-and-cache
      owner: SkillBackend-get-and-read
      baseline_ref: git:fe7a39f6
      regression_ref: selftest-skill-backend body-cache-envelope matrix
    - name: six-template-release
      owner: SkillBackend-releaseTemplates
      baseline_ref: git:fe7a39f6
      regression_ref: selftest-skill-backend six-template matrix
    - name: public-tool-contract
      owner: Tools-and-AgentSession
      baseline_ref: git:fe7a39f6
      regression_ref: fixed complete lightweight gate
  adjacent_surfaces:
    - name: non-success-response
      why_adjacent: fetch 返回非成功状态时必须终结为既有错误信封
      risk: 静默缓存错误正文或再次无限等待
      owner: SkillBackend-_readChrome
    - name: template-release-isolation
      why_adjacent: 正文成功后仍需释放六模板且保持逐个失败隔离
      risk: skill_get 成功但 Agent 缺少脚手架
      owner: SkillBackend-_releaseTemplates
    - name: sibling-browser-routing
      why_adjacent: Firefox 内部读取修复不能改变 Paseo 的双 suite 发布与路由
      risk: Camoufox 变化污染 Firefox 修复证据
      owner: preserved-outside-this-repository-change
  historical_state_refs:
    - Issue #24 Firefox 工具目录 PASS 只证明目录发布，不证明 skill 正文读取
    - Camoufox lifecycle 失败现场保持冻结，不作为 Issue #12 验收输入
  stale_verdict_invalidation_refs:
    - Issue #24 Firefox 工具目录验收不证明 skill 正文读取
    - 任何生产或测试变更都会使旧完整门禁与旧 review 失效
  regression_checks:
    - surface: skill-body-cache-templates-error-envelope
      command_or_evidence_ref: node additions/browser/components/agent-sidebar/dev/selftest-skill-backend.mjs
      expected_result: 旧 asyncFetch 流有界 RED，fetch 修复后全部 GREEN
    - surface: agent-sidebar-sibling-regression
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: build、固定 15 项自测与 branding 全部通过
    - surface: installed-firefox-semantic-chain
      command_or_evidence_ref: Firefox-only exact side-load semantic verification
      expected_result: skill_get、受管 page_info、页面四字段、公开 stop 与 inactive 通过
  sibling_regression_guard:
    status: passed
    closeout_rule: passed-or-blocked-before-done
  protected_feature_replay:
    status: passed
    known_good_features:
      - feature: Agent 工具目录、工具路由、工作区隔离与环境生命周期
        owner: agent-sidebar-complete-lightweight-suite
        baseline_evidence_ref: git:fe7a39f6 and existing fourteen selftests
        post_change_replay_plan_ref: build.md#完整轻量门禁
        post_change_replay_ref: git:815eaf389c6164ea5e9928e8b4ae48080c719dfa
        expected_result: 既有 14 项加新增 skill backend 自测全部通过
        actual_result: bundle 210.1kb、固定 15/15 自测、branding 22、官方 high audit、保护模块与 scope 全部通过
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
  same_question_ref: session-plan:issue-12-skill-get-chrome-readiness#final-head-review
  verification_lineage_ref: issue-12-skill-get-chrome-readiness-final-head
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
    command_ref: build.md#Issue-12-skill_get-chrome-资源聚焦门禁
    result_ref: deterministic-red-old-flow-timeout-and-focused-green
  build:
    command_ref: build.md#完整轻量门禁
    result_ref: git:815eaf389c6164ea5e9928e8b4ae48080c719dfa; fixed-15-selftests-and-branding22-passed
  review:
    command_ref: build.md#Issue-12-exact-head-review
    result_ref: pending
  verification:
    command_ref: build.md#Issue-12-交付边界
    result_ref: official-high-audit-scope-protected-modules-diff-clean-passed; production-test-script-lockfile-hashes-unchanged
  closeout:
    command_ref: build.md#Issue-12-Firefox-only-exact-side-load
    result_ref: pending
```

## 启动冻结

- worktree 基线：branch `codex/issue-12-skill-get-chrome-readiness`，commit/base `fe7a39f6a3ec9abe6943b77f261254ea30711233`，tree `011a5d83959031c37b693908cebb46916f8a31a0`，创建时 clean。
- GitHub Issue #12 为 OPEN；原 `D:\Android_source\firefox-reverse` 脏 worktree 禁止触碰。
- Paseo Reverse Lab 主仓、私有配置、现有 side-load、Firefox/Camoufox 运行态、lease、assignment 与 quarantine 均不在源码写入范围。
