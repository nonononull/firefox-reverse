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
scope_hash: sha256:50166a6b059262375faafde39146f556732fb416313a8c11c950ee5bea404077
owner_scope_ref: docs/plans/sessions/issue-1-multi-window-thread-routing.owner-scope.yml
owner_scope_hash: sha256:50166a6b059262375faafde39146f556732fb416313a8c11c950ee5bea404077
selected_business_path: github-issue-pr-merge
verification_commands:
  - npm ci --prefix additions/browser/components/agent-sidebar
  - npm --prefix additions/browser/components/agent-sidebar run build
  - node additions/browser/components/agent-sidebar/dev/selftest-multi-window-routing.mjs
  - node additions/browser/components/agent-sidebar/dev/selftest-thread-reservation.mjs
  - node additions/browser/components/agent-sidebar/dev/selftest-conversations.mjs
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
  - modify-agent-session-outside-reservation-fence
  - modify-agent-session-run-beyond-accepted-run-epoch-reservation-binding
  - modify-agent-session-raw-tool-lock

## Approved Decision

- 决策：保留 `AgentSession` 的稳定 owner、心跳、TTL、同 thread 独占和多 thread 并行；删除 `AgentPanel` 对其它窗口运行 thread 的自动 `openThread()` 接管，提示条点击改为 `newChat()`，并为同 owner 重挂载增加 generation 与 owner+generation 级单调 claim fence。初始化优先扫描 running 候选，由 owner fence 只重挂载本 owner 且锚点仍在 TTL 内、并与 reservation 接受的精确 `runEpoch` 一致的任务，再按更新时间认领空闲历史；历史点击遵守同一规则。mount 续看、external visibility、流式显示与停止入口都必须复核精确 `owner + generation + claim + runEpoch`，当前 external run 只能显示提示，不能进入 busy 或获得 stop 权限。运行中正常卸载保留 owner 锚点；尚未绑定的临时 claim 以显式 abandon 清除，且新 generation 仅发布未接管时允许旧 generation 精确清理自己的 claim。`AgentSession.run()` 只允许在实际接受新 run 的同步线性化点递增并通过既有 snapshot 暴露 `runEpoch`；只有携带精确 `owner + generation + claim` 的 UI run 才能把该 epoch 绑定到 reservation，external run 不继承旧锚点身份；不得改变其它执行、重入、持久化或 raw-tool 锁。guarded append/deletion 在 provisional canonical 前持久化 rollback sidecar，在用户消息启动前持久化 committed snapshot；删除在 sidecar 清理后再次验权，迟到创建清理复用同一 runEpoch 删除闸门；首次 replay 完成前读取和 mutation 都失败关闭。Store 必须深拷贝消息输入，并只向 guard、commit 回调和 API 返回值暴露 detached snapshot。
- 理由：UI 路由修复解决单任务观感；exact-head reviewer 进一步证明同 owner 旧挂载/旧 claim 可迟到影响更新操作，单看最新历史会漏掉本 owner 的运行锚点，过期同 owner 锚点还会错误授权后来启动的 external run，故在既有 reservation helper 上增加候选优先级与 TTL 新鲜度。删除保存期间的 external run 可以启动后快速回到 idle，因此授权 `AgentSession.run()` 增加唯一的 accepted-run epoch 观测，不授权其它执行路径变更。有效的新 claim 尝试在候选扫描前即发布，认领失败也会淘汰旧 claim；低 claim 禁止新认领，但可精确清理自己原有 reservation。journal 必须先于 provisional canonical，并在 `session.run()` 前从 rollback 转为 committed；replay 与 mutation 必须串行化，避免无历史任务、已启动消息被旧 sidecar 抹除、失败值夹带或迟到旧快照覆盖。
- 删除组合：非当前历史使用最新 claim 临时认领；当前 thread 使用既有精确 claim 续约验证，不重新认领已低于 owner+generation 最高值的 claim。
- 范围：fork 内 `AgentPanel`、`AgentSession` reservation fence 与 accepted-run epoch reservation 绑定、`ConversationStore` 删除与 user append 线性化 guard、三份动态自测、聚合入口及本任务控制文档，完成 fork 内 Issue、PR、独立审查和 squash merge。
- 拒绝方案：不实现双窗口编辑同一 thread，不实现只读跟随，不增加对外 MCP/worker 工具；内部只新增 generation-aware reservation 方法和 accepted-run epoch，不向公开上游提 PR，不发布或安装浏览器。

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
    - additions/browser/components/agent-sidebar/modules/ConversationStore.sys.mjs
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
      regression_ref: AgentSession run and per-thread sessions map remain unchanged; aggregate selftests pass
    - name: raw-tool-global-concurrency-guard
      owner: AgentSession-callTool
      baseline_ref: git:7a77a66ed8361f858cfa0b19fd8239b63b4535f0
      regression_ref: AgentSession callTool region remains unchanged and aggregate selftests pass
  adjacent_surfaces:
    - name: current-thread-stream-recovery
      why_adjacent: 外部运行探测 effect 也负责当前 thread 的续看恢复
      risk: 删除自动跟随时误删当前 thread busy 恢复
      owner: AgentPanel-external-running-effect
    - name: history-thread-open
      why_adjacent: 历史列表仍需调用 openThread 并经过 acquireThread
      risk: 全面禁用 openThread 导致历史不可用
      owner: AgentPanel-history
    - name: asynchronous-selection-commit
      why_adjacent: 初始化、新对话、历史打开、流式回载和外部探测都可在 await 后回写选择相关状态
      risk: 迟到结果覆盖用户后来开始的选择，或旧事务释放同 owner 更新操作的 reservation
      owner: AgentPanel-selection-intent
    - name: send-ownership-chain
      why_adjacent: 发送在历史、模式、笔记和消息持久化之间跨越多个 await
      risk: 异步准备结束后到消息修改/任务启动之间失权，造成旧 thread 写入、重复输入或重复启动
      owner: AgentPanel-send
    - name: history-delete-linearization
      why_adjacent: 删除前的 reservation 复核与持久化修改之间存在异步 load 边界
      risk: 同 owner 新挂载在 load 期间接管后，旧挂载仍删除新挂载正在使用的 thread
      owner: AgentPanel-and-ConversationStore-delete
    - name: director-store-compatibility
      why_adjacent: frx-director-mcp 生产脚本仍使用三参数 createThread 与无 guard mode/workspace/message 旧签名
      risk: 把 UI ownership guard 直接升级为 Store 全局必填会破坏既有 MCP 协议
      owner: ConversationStore-compatibility
    - name: authoritative-run-config
      why_adjacent: notes digest、mode、workspace 与发送准备跨越多个异步边界
      risk: 旧发送按过期配置启动，或失败 mutation 被后续成功保存夹带
      owner: AgentPanel-config-intent-and-ConversationStore-mutation-queue
  historical_state_refs:
    - v0.22.4 old route calls openThreadRef.current(target.id)
    - red contract test fails on the old route and passes on the current worktree
    - reviewer git:ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e REQUEST_CHANGES
    - reviewer git:42ff472263174d7cba38b38577d4a8312bd4a2d5 REQUEST_CHANGES P1=2 P2=3
    - reviewer git:0937c0f43b78b8babd510563eaf4c8d8ddc49a39 REQUEST_CHANGES P1=3 P2=1
    - reviewer git:97252db1295e9209d8d2fa88d85c1d736214f227 REQUEST_CHANGES P1=1 P2=4
    - reviewer git:d16f88cea639895a4a60f773fd7d21986e6f95f7 REQUEST_CHANGES P1=2 P2=1
    - reviewer git:e84e4b18ac250614979876b68e810a6fc2845d16 REQUEST_CHANGES P1=1 P2=2
    - reviewer git:bc639e34389331ebc950989e4b431160992b7f06 REQUEST_CHANGES P1=3 P2=1
    - reviewer git:98e080540b823327f3e52ceed2b821784d3fc7b6 REQUEST_CHANGES P1=2 P2=1
    - reviewer git:78464614385e6599dbdbafe3945938c5d2341c54 REQUEST_CHANGES P1=2 P2=1
    - reviewer git:ee665652da982dc40c8dd8b71a692d48cb5aa8fd REQUEST_CHANGES P1=2 P2=1
    - reviewer git:4e0e246c9f7728b1ed366602b55d3c90daff2a02 REQUEST_CHANGES P1=2 P2=0
    - reviewer git:1a7b0511a74b7739ae258b59e9f907151365637b REQUEST_CHANGES P1=2 P2=1
    - reviewer git:726aeaddb8c302fc75cc1e95d1fe10667b696d99 REQUEST_CHANGES P1=2 P2=0
    - reviewer git:7176a7df871eaaafe4c0be4b9e4752fcb6201fc0 REQUEST_CHANGES P1=3 P2=1
    - reviewer git:c4bcf9ef1275b558db593a95530846eb3de53dce REQUEST_CHANGES P1=2 P2=1
    - reviewer git:606b94c5c0d80803acae5c3b56215eb4fd528667 REQUEST_CHANGES P1=3 P2=1
    - reviewer git:4b2ab8b88aa175528d08c246d6e35b8e39f62560 REQUEST_CHANGES P1=2 P2=1
    - reviewer git:095f1639b744625de74e91834de0f3a18a5cf4d6 REQUEST_CHANGES P1=3 P2=1
    - reviewer git:7e4c7c72584b48d22e8bb0af2ed872c8c23c5201 REQUEST_CHANGES P1=1 P2=2
  stale_verdict_invalidation_refs:
    - git:ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e reviewer verdict is failed historical evidence, not final approval
    - git:42ff472263174d7cba38b38577d4a8312bd4a2d5 reviewer verdict is failed historical evidence, not final approval
    - git:0937c0f43b78b8babd510563eaf4c8d8ddc49a39 reviewer verdict is failed historical evidence, not final approval
    - git:97252db1295e9209d8d2fa88d85c1d736214f227 reviewer verdict is failed historical evidence, not final approval
    - git:d16f88cea639895a4a60f773fd7d21986e6f95f7 reviewer verdict is failed historical evidence, not final approval
    - git:f92d93752aecbec3edf33bce5486fe8d95935371 reviewer attempt ended in provider 503 without findings or verdict
    - reviewer 019ffcda-2437-7791-a95a-54cab6ca68a8 was shutdown after prolonged no output without findings or verdict
    - reviewer 019ffcee-5f0d-7892-977e-eced1beb2c71 was shutdown after prolonged no output without findings or verdict
    - git:e84e4b18ac250614979876b68e810a6fc2845d16 reviewer verdict is failed historical evidence, not final approval
    - git:bc639e34389331ebc950989e4b431160992b7f06 reviewer verdict is failed historical evidence, not final approval
    - git:98e080540b823327f3e52ceed2b821784d3fc7b6 reviewer verdict is failed historical evidence, not final approval
    - git:78464614385e6599dbdbafe3945938c5d2341c54 reviewer verdict is failed historical evidence, not final approval
    - git:ee665652da982dc40c8dd8b71a692d48cb5aa8fd reviewer verdict is failed historical evidence, not final approval
    - git:4e0e246c9f7728b1ed366602b55d3c90daff2a02 reviewer verdict is failed historical evidence, not final approval
    - git:1a7b0511a74b7739ae258b59e9f907151365637b reviewer verdict is failed historical evidence, not final approval
    - git:726aeaddb8c302fc75cc1e95d1fe10667b696d99 reviewer verdict is failed historical evidence, not final approval
    - git:7176a7df871eaaafe4c0be4b9e4752fcb6201fc0 reviewer verdict is failed historical evidence, not final approval
    - git:c4bcf9ef1275b558db593a95530846eb3de53dce reviewer verdict is failed historical evidence, not final approval
    - git:606b94c5c0d80803acae5c3b56215eb4fd528667 reviewer verdict is failed historical evidence, not final approval
    - git:4b2ab8b88aa175528d08c246d6e35b8e39f62560 reviewer verdict is failed historical evidence, not final approval
    - git:095f1639b744625de74e91834de0f3a18a5cf4d6 reviewer verdict is failed historical evidence, not final approval
    - git:7e4c7c72584b48d22e8bb0af2ed872c8c23c5201 reviewer verdict is failed historical evidence, not final approval
    - reviewer 51befd7e-f709-449c-b919-72614292f4be resolved PR against upstream, failed the identity gate, and stopped before source review; its procedural REQUEST_CHANGES is not an implementation verdict
    - 2026-08-14 源码 checkpoint 门禁只属于 git:fb2db7835624d9ca5dadabebd6a68a30ca9b3113；治理提交后必须对 final exact HEAD/tree 重新审查
  regression_checks:
    - surface: external-running-routing
      command_or_evidence_ref: node selftest-multi-window-routing.mjs
      expected_result: no external openThread route; banner calls newChat; initialization scans all histories and prioritizes exact same-owner running remount; mount resume, external visibility, streaming and stop all require the exact owner-generation-claim-runEpoch, while current external runs only enter the banner
    - surface: reservation-and-heartbeat
      command_or_evidence_ref: node selftest-thread-reservation.mjs
      expected_result: generation fence、owner+generation 最高 claim、运行态 owner 门禁、TTL 内同 owner running remount 仅限 reservation 绑定的精确 runEpoch、生产 run 的 external/错误 owner-generation-claim/过期 TTL 均不得绑定 epoch、旧锚点拒绝后来 external run、过期 reservation 拒绝迟到 heartbeat、跨 generation 精确临时 claim abandon、失败尝试发布水位、附属目标、旧 reservation 清理与心跳全部通过
    - surface: sidebar-and-agent-tooling
      command_or_evidence_ref: build.md#完整轻量门禁
      expected_result: bundle, 13 selftests and branding all pass
    - surface: asynchronous-selection-and-send-races
      command_or_evidence_ref: node selftest-multi-window-routing.mjs
      expected_result: dynamic claim/selection/迟到资源 mutation 被拒绝；消息保存成功后先持久化 committed journal，再同步 guard 并调用 session.run；committed journal 保留 rollback snapshot，sidecar 清理失败后的 fresh replay 保留已提交消息，持续 sidecar 故障后的 fresh replay 保留已恢复 rollback canonical；recovery journal 先于 provisional canonical，首次 replay 和普通 mutation 完成前读取均阻断，已返回的 detached thread 也不能观察 provisional `_mem`
    - surface: history-delete-linearization
      command_or_evidence_ref: node selftest-conversations.mjs and node selftest-multi-window-routing.mjs
      expected_result: missing guard and ownership loss after load, delete save, committed journal write or sidecar cleanup all fail closed without deleting the thread; production deleteThreadForSelection helper dynamically proves non-current deletion publishes the newest claim while current deletion renews its existing exact claim; idle-to-running deletion and late-created cleanup abandon temporary claims without deleting the running thread; run epoch catches start-to-finish during delete save; deletion rollback save or committed-to-rollback journal failure gates later reads and mutations until durable recovery; mode/workspace save failures roll back; user append save failure is zero-run; final guard loss and run throw/not-running persist a rolled-back user message
    - surface: historical-open-idle-to-running
      command_or_evidence_ref: node selftest-multi-window-routing.mjs
      expected_result: history click uses owner-aware acquisition, permits only an exact same-owner running remount, and rejects external/other-owner running tasks; an idle candidate that starts during read fails closed and abandons the temporary claim, while a cancelled same-owner running remount preserves its normal owner anchor
    - surface: director-compatibility-and-store-serialization
      command_or_evidence_ref: node selftest-conversations.mjs
      expected_result: director legacy signatures remain callable; cold start publishes one load promise; message steps input, ownership guards, commit callbacks and all thread-returning mutation APIs receive detached snapshots; failed user append, mode, workspace, environment, model, or title save cannot contaminate a later successful snapshot; user append cannot start before its first successful save and committed journal; append/deletion rollback journal precedes provisional canonical; committed sidecar preserves accepted user messages and embeds the exact rollback snapshot; recovery replay and ordinary reads serialize behind mutations, retry after failure, accept real production text/think/tool/images/shot structures, reject falsy-but-present phases, unknown roles, missing tool names, unknown tool statuses and isolated malformed UI-consumed fields, and restore canonical state before a fresh Store accepts it
    - surface: authoritative-send-configuration
      command_or_evidence_ref: node selftest-multi-window-routing.mjs
      expected_result: digest-time configuration changes reject stale sends; default auto cannot overwrite a newer user mode intent; UI mode/workspace helpers always pass a live ownership guard
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
        post_change_replay_ref: git:fb2db7835624d9ca5dadabebd6a68a30ca9b3113-local-source-gate:2026-08-14T17:02:31+08:00
        expected_result: reservation suite and aggregate selftests pass
        actual_result: PowerShell 完整链无重试通过 sidebar bundle 223.6kb、13/13 Node 自测文件、branding 22 与官方 registry high/critical 审计；reservation 88/88、ConversationStore 203/203、routing PASS、mount/visibility/stream/stop 精确 run ownership、生产 run external 与错误身份/过期 TTL 负例、steps 输入和 guard/onCommit/API 返回 detached snapshot、owner anchor 精确 runEpoch 绑定、falsy recovery phase 拒绝、message role 与 tool name/status 枚举校验、持续 sidecar 故障恢复、跨 generation 精确临时 claim abandon、迟到创建 runEpoch 删除保护、user append 保存失败零启动与最终 guard 回滚、metadata 保存失败回滚、director 旧签名、共享冷启动、配置 intent 与生产删除 helper 动态合同通过；lockfile SHA-256 与 12 路径边界保持不变，最终标记 FULL_GATE_OK；现有 esbuild 开发依赖 1 个 moderate 未做 breaking upgrade
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
    result_ref: git:fb2db7835624d9ca5dadabebd6a68a30ca9b3113-local-source-gate:2026-08-14T17:02:31+08:00-sidebar-and-13-selftests-pass
  build:
    command_ref: build.md#侧栏构建
    result_ref: git:fb2db7835624d9ca5dadabebd6a68a30ca9b3113-local-source-gate:2026-08-14T17:02:31+08:00-bundle-223.6kb
  review:
    command_ref: build.md#独立审查
    result_ref: git:ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e-request-changes; git:e84e4b18ac250614979876b68e810a6fc2845d16-request-changes-p1-1-p2-2; git:bc639e34389331ebc950989e4b431160992b7f06-request-changes-p1-3-p2-1-reviewer-019ffd25-55db-7473-aab5-a42ac5c9b963; git:98e080540b823327f3e52ceed2b821784d3fc7b6-request-changes-p1-2-p2-1-reviewer-019ffd82-1326-7e42-b2c0-2355aecf81ad; git:78464614385e6599dbdbafe3945938c5d2341c54-request-changes-p1-2-p2-1-reviewer-d5261c5b-1250-4855-99e4-e29f1185d0c0; git:ee665652da982dc40c8dd8b71a692d48cb5aa8fd-request-changes-p1-2-p2-1-reviewer-7a7dc2f6-5372-444b-b9d2-0945acf807c5; git:4e0e246c9f7728b1ed366602b55d3c90daff2a02-request-changes-p1-2-p2-0-reviewer-d5fe1b3b-56d1-4e8c-b338-6d790631e32b; git:1a7b0511a74b7739ae258b59e9f907151365637b-request-changes-p1-2-p2-1-reviewer-ab60f7a9-7975-4375-a030-134f8fee95af; git:726aeaddb8c302fc75cc1e95d1fe10667b696d99-request-changes-p1-2-p2-0-reviewer-b58ed78e-22bc-4aca-afd3-ec1ca8b9fb40; git:7176a7df871eaaafe4c0be4b9e4752fcb6201fc0-request-changes-p1-3-p2-1-reviewer-510fe148-7da6-4cb5-bcea-9acfbc148da2; git:606b94c5c0d80803acae5c3b56215eb4fd528667-request-changes-p1-3-p2-1-reviewer-34cc68e3-c865-4af2-8536-f32b6b43ecb8; git:4b2ab8b88aa175528d08c246d6e35b8e39f62560-request-changes-p1-2-p2-1-reviewer-019fff05-d76d-7673-98f5-9c4ccb2ab421; git:095f1639b744625de74e91834de0f3a18a5cf4d6-request-changes-p1-3-p2-1-reviewer-b9184c20-9b46-4527-bd54-9c8340d1325f; git:7e4c7c72584b48d22e8bb0af2ed872c8c23c5201-request-changes-p1-1-p2-2-reviewer-518b26b3-1a04-42fe-94f4-7e224541361b; reviewer:51befd7e-f709-449c-b919-72614292f4be-upstream-pr-resolution-gate-failure-no-source-review; git:f92d93752aecbec3edf33bce5486fe8d95935371-provider-503-no-verdict; reviewers:019ffcda-2437-7791-a95a-54cab6ca68a8,019ffcee-5f0d-7892-977e-eced1beb2c71-shutdown-no-verdict; fresh final exact-head rereview pending
    latest_failed_result_ref: git:7e4c7c72584b48d22e8bb0af2ed872c8c23c5201-request-changes-p1-1-p2-2-reviewer-518b26b3-1a04-42fe-94f4-7e224541361b
  verification:
    command_ref: build.md#交付边界检查
    result_ref: git:fb2db7835624d9ca5dadabebd6a68a30ca9b3113-local-source-gate:2026-08-14T17:02:31+08:00-lockfile-ignored-bundle-and-12-file-boundary-pass
  closeout:
    command_ref: err.md#issue-1
    result_ref: pending-pr-and-squash-merge
```

## 现场记录

- 取证时间：`2026-08-13 18:52:34 +08:00`。
- fork 基线与上游 v0.22.4 源码提交均为 `7a77a66ed8361f858cfa0b19fd8239b63b4535f0`；tag object 为 `95def86131787fd0945bea1d951623828d1a2987`。
- 本任务不修改或启动本机已安装浏览器；fork 合并不等于安装包已更新。
- `2026-08-13 19:02:06 +08:00`：Windows PowerShell 完整轻量门禁通过，侧栏 bundle 为 209.8kb；13/13 Node 自测文件、thread reservation 22 项断言、新 multi-window routing 合同与 branding 22 文件检查全部通过。WSL/Git Bash 聚合入口的两次失败均发生在 bundle 工具链启动阶段，未形成产品测试失败，详情见 `err.md`。
- `2026-08-13 19:10:06 +08:00`：实现提交 `dfd91c6751feeeab48aeffd6ddac6dd42af3612f`、tree `1009baeba729b9969f39fa2b26e9ab5e1799c40a` 上重新执行 `npm ci` 与完整 PowerShell 门禁，结果再次全部通过。`origin/main` 与 `upstream/main` 均仍为 `7a77a66ed8361f858cfa0b19fd8239b63b4535f0`；仓库有发布用 `release.yml`，但没有 pull-request workflow，因此后续 PR 使用明确 `no-PR-CI` 记录且不触发 release。
- `2026-08-13 19:50:40 +08:00`：独立 reviewer 对 `ac55b198a4222a55b2c5a45f6d9fa84dfd42e62e` 返回 `REQUEST_CHANGES`，确认新 thread 在 `createThread()` 与 `acquireThread()` 之间可被其它窗口抢占，且创建者与 heartbeat 都会忽略失权。旧结论保留，不记为通过。
- `2026-08-13 19:50:40 +08:00`：修复提交 `b1e1c3ac7b3262c7883e9535c7ad027b4a5b9ac1`、tree `549fb36b1b27f52f6002951484c76b1a076a3625` 统一了三条创建路径的有界精确认领，并让 heartbeat 失权后按选择代际恢复。`npm ci` 与最终 PowerShell 完整门禁通过：bundle `211.4kb`、13/13 Node 自测文件、reservation 22 项断言和 branding 22 文件；最终 exact-head 独立复审仍待执行。
- `2026-08-13 22:11:10 +08:00`：独立 reviewer 对治理 HEAD `42ff472263174d7cba38b38577d4a8312bd4a2d5`、tree `7984406d3abd65f6e5da030c2c163416667c6c66` 返回 `REQUEST_CHANGES`（P1=2、P2=3）。失败证据包括初始化迟到覆盖新选择、发送跨多个 await 后失权仍继续、reservation API 缺失失败开放、关键竞态缺动态 mutation 保护以及旧治理 SHA/无 PR CI 表述漂移。
- `2026-08-13 22:11:10 +08:00`：实现提交 `3f9f961c1728a9f735222667b139458b32fc0ea3`、tree `c102564f779c727f44d00e2632124d7bebe1c4d1` 使用最小 selection intent 事务闭合迟到初始化/新对话/历史打开与失权恢复；发送每个异步阶段后重新续约并在最后一次验证后无 await 启动；缺 reservation API 失败关闭。源码冻结门禁通过：`npm ci`、bundle `215.0kb`、13/13 Node 自测文件、reservation 22 项断言、动态路由合同、branding 22 文件和 `git diff --check`。最终治理 HEAD/tree 与 fresh exact-head review 仍待完成。
- `2026-08-14 00:00:49 +08:00`：独立 reviewer 对 `0937c0f43b78b8babd510563eaf4c8d8ddc49a39` 返回 `REQUEST_CHANGES`（P1=3、P2=1），指出同 owner 迟到释放、失权发送文本覆盖、历史删除绕过 reservation 和关键竞态动态覆盖不足。当前工作树增加权威 reservation generation fence、无损输入合并、受控历史删除及生产源码动态断言；父线程复核进一步将同步 ownership guard 下沉到 `ConversationStore` 删除线性化点，封闭 `_load()` 期间新挂载接管的 TOCTOU。无重试最终链通过 `npm ci`、bundle `216.4kb`、13/13 Node 自测文件、reservation 34 项断言、ConversationStore 15 项断言、动态路由合同、branding 22 文件与 `git diff --check`；最终提交和 fresh exact-head review 仍待完成。
- `2026-08-14 01:59:12 +08:00`：独立 reviewer 对 `97252db1295e9209d8d2fa88d85c1d736214f227` 返回 `REQUEST_CHANGES`（P1=1、P2=4），指出追加消息后失权可导致重复文本、迟到 reservation/孤立 thread、模式写入 TOCTOU 与动态测试不足。实现 checkpoint `c9eca650fa0ce8a0ce40dbe09da39f78ce0d8e4d`、tree `f536dc22379ef2f7b9c7f2470a14d9bdf19fa611` 增加单调 claim、存储同步 ownership guard、迟到资源精确清理和消息/启动无 `await` 提交区间。无重试源码门禁通过：`npm ci`、bundle `218.5kb`、13/13 Node 自测文件、reservation 43 项断言、ConversationStore 26/26、动态路由合同、branding 22 文件与 `git diff --check`；治理提交与 fresh exact-head review 仍待完成。
- `2026-08-14 03:21:47 +08:00`：fresh reviewer 对治理 HEAD `d16f88cea639895a4a60f773fd7d21986e6f95f7`、tree `8c6abf42ac8e27538ad8d4fa3410228478287aa8` 返回 `REQUEST_CHANGES`（P1=2、P2=1），指出 claim fence 仍局限于单 thread、mode/workspace 保存失败未回滚，并缺少 `session.run()` 异常动态证据。源码 checkpoint `96a71dfb97f1ba272df01747d6ff94aa2b2640bc`、tree `3dcba8538116d63e7c2b4e1e56cdf3b24e7d67e5` 增加 owner+generation 最高 claim、保存失败条件回滚及动态 mutation 用例。无重试门禁通过：`npm ci`、bundle `218.5kb`、13/13、reservation 52 项、ConversationStore 32/32、动态路由合同、branding 22 与 `git diff --check`；治理提交和 fresh final review 待完成。
- `2026-08-14 03:31:02 +08:00`：实现 checkpoint `8ef8ce328dc587e048ba75c2ee9e979b47af38de`、tree `70735af06e995f44f5199fb2dd43453474cb556a` 让非当前历史删除发布最新 claim，再以附属 reservation 删除目标；当前 thread 的旧 reservation 仍只能续约自身，不能跨目标复活。该 SHA 上重新无重试执行 `npm ci` 和完整 PowerShell 门禁，bundle `218.5kb`、13/13、reservation 52 项、ConversationStore 32/32、动态路由合同、branding 22 与 `git diff --check` 全部通过；final exact-head review 仍待治理提交后执行。
- `2026-08-14 04:32:02 +08:00`：对治理 HEAD `f92d93752aecbec3edf33bce5486fe8d95935371` 发起的 fresh reviewer 因 provider 503 结束，没有 findings 或 verdict。父线程随后发现组合回归：非当前删除发布 claim 2 后，当前 thread 的 claim 1 虽可续约，却会在删除时被重复 acquire 拒绝。红测先稳定复现误报，再由 checkpoint `4074d00ceb4606e3d22ae1294ba53cb8302cdf68`、tree `47b165892ee4db71c3e61801efd32fd6359c1d09` 将当前删除改为精确 renew 验证；完整 PowerShell 门禁无重试通过 bundle `218.6kb`、13/13、reservation 52/52、ConversationStore 32/32、组合路由合同和 branding 22。最终治理 snapshot 与 fresh exact-head review 仍待完成。
- `2026-08-14 05:50:15 +08:00`：fresh reviewer `3f372874-23a5-4d38-966f-3d157f7c25a5` 对治理 HEAD `e84e4b18ac250614979876b68e810a6fc2845d16`、tree `5affad19645ed32eafbaee52ad271785a22e5a32` 返回 `REQUEST_CHANGES`（P1=1、P2=2），指出高 claim 认领失败未推进 owner 水位、生产删除接线动态证据不足及两次 shutdown/no-verdict 尝试漏记。实现提交 `4f52a4fdf45481da908e2c467a80ec16c68d32f2`、tree `d12dd5bc6829ac7172bb6644c5558caba8e7c7cb` 将有效 claim 在候选扫描前发布，并抽取生产 `deleteThreadForSelection()` 供 React 入口与动态测试共用；无重试门禁通过 bundle `218.6kb`、13/13、reservation 57/57、ConversationStore 32/32、生产删除 helper 动态合同、branding 22 与 `git diff --check`。reviewer `019ffcda-2437-7791-a95a-54cab6ca68a8`、`019ffcee-5f0d-7892-977e-eced1beb2c71` 均因长期无输出被 shutdown 且无 verdict；最终治理 snapshot 与 fresh exact-head review 仍待完成。
- `2026-08-14 07:31:10 +08:00`：fresh reviewer `019ffd25-55db-7473-aab5-a42ac5c9b963` 对治理 HEAD `bc639e34389331ebc950989e4b431160992b7f06`、tree `30452ce51ddea0474665c745ea3bd386f0b6c405` 返回 `REQUEST_CHANGES`（P1=3、P2=1），指出 director 旧签名兼容、冷启动 `_load()` 覆盖、digest 期间配置漂移及失败 mutation 夹带。实现提交 `c7672eb319c81fb06f605e9a4ec1ef642be59e7a` 增加共享 load Promise、串行 mutation queue、显式 guard 兼容层与权威发送配置；测试加固提交 `69a514e76550adc8d563f739c0c9f132bb3aeb88`、tree `9c0396e2d7d6fa100b7fea8b6ad58b4f1920d541` 动态验证默认/用户 mode intent、UI guard 和缺失 thread。无重试门禁通过 bundle `220.4kb`、13/13、reservation 57/57、ConversationStore 42/42、multi-window routing、branding 22 与 `git diff --check`；治理 snapshot 与 fresh final exact-head review 仍待完成。
- `2026-08-14 08:19:44 +08:00`：fresh reviewer `019ffd82-1326-7e42-b2c0-2355aecf81ad` 对 `98e080540b823327f3e52ceed2b821784d3fc7b6`、tree `6f8eab856a10030cc66eb2ec442c5225fb5e214c` 返回 `REQUEST_CHANGES`（P1=2、P2=1），指出初始化可接管无 reservation 的外部运行 thread、user append 保存失败会留在 `_mem` 并被夹带，以及 reservation API 治理表述失真。实现 `228c00b4aec7702748711de91d3927cc46656aa4`、tree `864c11a6e5faac2afc4621de21f4ab16cc9c7973` 以运行态 owner 门禁允许原 owner 重挂载续看、拒绝外部/其它 owner，并在 user append 保存失败时条件回滚。无重试门禁通过 bundle `220.9kb`、13/13、reservation 60/60、ConversationStore 48/48、multi-window routing、branding 22 与 `git diff --check`。治理明确 reservation API 已升级，fresh final exact-head review 仍待执行。
- `2026-08-14 08:57:28 +08:00`：reviewer `d5261c5b-1250-4855-99e4-e29f1185d0c0` 对 `78464614385e6599dbdbafe3945938c5d2341c54`、tree `70bf4311419e30c21852bc989e45fe3509f649be` 返回 `REQUEST_CHANGES`（P1=2、P2=1）：运行 thread 正常卸载会清空 reservation，导致原 owner 无法重挂载；environment/model/title 保存失败会留在 `_mem` 并被后续保存夹带；结构化 reviewer 台账漏记 `ac55b198...`。reviewer `51befd7e-f709-449c-b919-72614292f4be` 因未显式指定 fork 而在 upstream 查询 PR #2 失败，按入口闸门停止且未读源码，其流程性拒绝不作为实现 finding。红测在旧实现分别稳定失败 reservation 3 项与 Store 9 项；实现 `f19d8cbe123cdb0698a00fdaa47ac0836cf5bf0a`、tree `f68a14b1831444f2e163fdaa216b54f48a76806e` 保留运行中不续时 owner 锚点，并为三类 metadata mutation 增加条件回滚。无重试完整门禁通过 bundle `220.9kb`、13/13、reservation 67/67、ConversationStore 60/60、multi-window routing、branding 22 与 `git diff --check`；fresh final exact-head review 仍待治理提交后执行。
- `2026-08-14 09:50:04 +08:00`：fresh reviewer `7a7dc2f6-5372-444b-b9d2-0945acf807c5` 对 `ee665652da982dc40c8dd8b71a692d48cb5aa8fd`、tree `420cebc1a467a63ff188d0708ab99af7935e307b` 返回 `REQUEST_CHANGES`（P1=2、P2=1），指出历史读取期间的 director 启动仍可被点击接管，且初始化/非当前删除的临时 claim 会被生产 running-release 语义错误保留为 owner 锚点；测试 fake 的无条件释放掩盖了组合缺陷。旧实现上 reservation 红测稳定失败 2 项，生产语义 routing fake 立即暴露初始化竞态；实现 `ce6bf30c585dede0ce76c56ba8d1bab6f0b0fe29`、tree `556e9e801ec2afab35e888073005f01e9370a4a8` 增加显式 transient abandon，同时保留正常同 owner running remount 锚点。无重试完整门禁通过 bundle `221.5kb`、13/13、reservation 70/70、ConversationStore 60/60、multi-window routing、branding 22 与 `git diff --check`；final exact-head review 仍须绑定后续治理 HEAD。
- `2026-08-14 10:27:35 +08:00`：fresh reviewer `d5fe1b3b-56d1-4e8c-b338-6d790631e32b` 对治理 HEAD `4e0e246c9f7728b1ed366602b55d3c90daff2a02`、tree `b270a11e77982c8c52efc3236b714457d5d8c163` 返回 `REQUEST_CHANGES`（P1=2、P2=0），指出新 generation 发布后旧临时 claim 无法精确 abandon，且 user append 在保存失败前已启动任务。实现提交 `c718298bfa315a188ab6b5e010110a387a234688`、tree `aae7962d791897adb0cac6925f5986c23edb9ab9` 允许旧 generation 仅在显式 abandon 且 reservation 仍精确匹配时清理，并将 user append 改为先保存、最终同步 guard 后启动、失败时持久化回滚。无重试门禁通过 bundle `221.6kb`、13/13、reservation 75/75、ConversationStore 65/65、multi-window routing、branding 22 与 `git diff --check`；治理 snapshot 与 fresh final exact-head review 仍待完成。
- `2026-08-14 11:21:40 +08:00`：fresh reviewer `ab60f7a9-7975-4375-a030-134f8fee95af` 对治理 HEAD `1a7b0511a74b7739ae258b59e9f907151365637b`、tree `bc6efaf652926a417349effc63cdde7c1345f7ad` 返回 `REQUEST_CHANGES`（P1=2、P2=1），指出初始化只尝试最新历史并会漏掉本 owner 的 running anchor、历史点击无条件拒绝合法 remount、删除保存期间 external run 可形成无历史任务，以及 append 回滚二次保存失败没有隔离。实现提交 `42846c64f6cada240ce53c7c86a0d20430806261`、tree `a014757038fbdb3ad975fb78d189e8a9bc2d9988` 增加跨列表 owner-aware running 优先重挂载、历史同 owner remount、删除保存后 guard 与 append/deletion 恢复门。无重试完整门禁通过 bundle `222.1kb`、13/13、reservation 75/75、ConversationStore 78/78、multi-window routing、branding 22 与 `git diff --check`；治理 snapshot 与 fresh final exact-head review 仍待完成。
- `2026-08-14 12:04:31 +08:00`：fresh reviewer `b58ed78e-22bc-4aca-afd3-ec1ca8b9fb40` 对治理 HEAD `726aeaddb8c302fc75cc1e95d1fe10667b696d99`、tree `038386c6435a51e9377c8753eb0acad1737e504b` 返回 `REQUEST_CHANGES`（P1=2、P2=0），指出删除保存期间快速结束的 external run 会穿过前后 `isRunning()` 采样，且 append/deletion rollback-save 恢复门无法跨进程重载。实现提交 `62caad744ec56ab9b20ad2dbb13661afb65a5dca`、tree `886f4e360a73d2c2f272a3d8d0779a432e952821` 增加 accepted-run 单调 epoch 与同目录 durable recovery sidecar；动态红测覆盖 provider 初始化快速失败、删除期间 `run -> finish` 以及 fresh Store 恢复幽灵 append/deletion。无重试完整门禁通过 bundle `222.4kb`、13/13、reservation 77/77、ConversationStore 82/82、multi-window routing、branding 22 与 `git diff --check`；治理 snapshot 与 fresh final exact-head review 仍待完成。
- `2026-08-14 12:46:54 +08:00`：fresh reviewer `510fe148-7da6-4cb5-bcea-9acfbc148da2` 对治理 HEAD `7176a7df871eaaafe4c0be4b9e4752fcb6201fc0`、tree `03df54658eddb97e1fa7a4e023f8a61b2759fb80` 返回 `REQUEST_CHANGES`（P1=3、P2=1），指出 sidecar 建立晚于 provisional canonical、首次 replay 过早发布 `_mem`、owner-scope 未授权 accepted-run epoch，以及 recovery snapshot 仅做浅校验。7 项新增故障注入断言在旧实现稳定失败；实现提交 `2b87e2c2780c82d9faf2391c6be4c94bed8de8a3`、tree `f9146efb6a4bf2e1bab7a39bcf87c3761d2f3174` 将 journal 前置、replay/读写串行化并增加失败重试和深层 snapshot 校验，owner-scope 仅放行 accepted-run epoch。第一次完整链因误抄不存在的 `selftest-tools.mjs` 中断且不计证据；随后按 `build.md` 正确 13 项列表无重试重跑，bundle `222.4kb`、13/13、reservation 77/77、ConversationStore 95/95、multi-window routing、branding 22 与 `git diff --check` 全部通过并输出 `FULL_GATE_OK`；治理 snapshot 与 fresh final exact-head review 仍待完成。
- `2026-08-14 13:25:44 +08:00`：fresh reviewer `a9f2fd73-b20d-45ee-81fb-3fca1d45704c` 对治理 HEAD `c4bcf9ef1275b558db593a95530846eb3de53dce`、tree `053625e76e29d4520e58ae17d9cfdb3060ed3563` 返回 `REQUEST_CHANGES`（P1=2、P2=1），指出过期同 owner 锚点可接管后续 external run、任务启动早于 recovery journal durable commit、message 深层结构仍未校验。实现 `d31d6d29ec112e8fe5d85737bb07cc679db1c0f3`、tree `d1bfb146f53d9b596430dd9b1051898a0acd06f2` 增加 running-anchor TTL、rollback/committed journal phase、onCommit 前 committed snapshot、删除清理后最终 guard、迟到创建 runEpoch 删除保护与 role/content/steps 深层校验。无重试完整门禁通过 bundle `222.4kb`、13/13、reservation `78/78`、ConversationStore `112/112`、multi-window routing `PASS`、branding 22 与 `git diff --check`，输出 `FULL_GATE_OK`；治理 snapshot 与 fresh final exact-head review 仍待完成。
- `2026-08-14 14:36:42 +08:00`：fresh reviewer `34cc68e3-c865-4af2-8536-f32b6b43ecb8` 对治理 HEAD `606b94c5c0d80803acae5c3b56215eb4fd528667`、tree `fae9eea498cfe7e45cf9ad9c7c4a4423f2115e08` 返回 `REQUEST_CHANGES`（P1=3、P2=1），指出迟到 heartbeat 可续活过期 reservation、`committed -> rollback` journal 改写失败会丢失恢复、普通读取可观察 provisional `_mem`，以及 recovery 深层校验未覆盖 UI 实际字段。实现提交 `09e5b77549099f46855fbd406e51e248ea630a89`、tree `d1574650e8a61d1ba272c19d840f3f141630e513` 增加 TTL renew fence、读写共用串行队列、rollback journal 首次写失败恢复和 UI-consumed snapshot 深层校验。exact implementation SHA 上无重试完整门禁通过 bundle `222.4kb`、13/13、reservation `80/80`、ConversationStore `146/146`、multi-window routing `PASS`、branding 22、lockfile SHA-256 不变与 `git diff --check`，输出 `FULL_GATE_OK`；fresh final exact-head review 仍待治理提交后执行，仓库继续明确 `no-PR-CI`。
- `2026-08-14 15:29:43 +08:00`：fresh reviewer `019fff05-d76d-7673-98f5-9c4ccb2ab421` 对旧 final HEAD `4b2ab8b88aa175528d08c246d6e35b8e39f62560`、tree `f10ee625c142233c592a7645bfb5ac6273faa30d` 返回 `REQUEST_CHANGES`（P1=2、P2=1），指出 `getThread()` 泄露内部可变引用、持续 sidecar 故障后的 stale committed journal 会覆盖已恢复 canonical，以及 validator 缺少隔离负例与生产正向 replay。实现提交 `7e69ca1a15fb631e232b1277dd7694103448ba23`、tree `d8fbf58bb70d395acc31451cb2a4a6cc24ae96a0` 增加 detached thread snapshot、committed rollback snapshot 判定和完整正反向故障注入。exact implementation SHA 上无重试完整门禁通过 bundle `222.4kb`、13/13、reservation `80/80`、ConversationStore `181/181`、routing `PASS`、branding 22、官方 registry high/critical 审计、lockfile SHA-256 与 12 路径边界，输出 `FULL_GATE_OK`；esbuild 开发依赖 1 个 moderate 保持披露，fresh final exact-head review 仍待治理提交后执行。
- `2026-08-14 16:18:12 +08:00`：fresh reviewer `b9184c20-9b46-4527-bd54-9c8340d1325f` 对旧 final HEAD `095f1639b744625de74e91834de0f3a18a5cf4d6`、tree `c27d795225f0bad0f100eea4e17ffa9073074c63` 返回 `REQUEST_CHANGES`（P1=3、P2=1），指出新鲜旧 owner 锚点未绑定具体 run epoch、mutation API 返回内部对象、falsy 非法 recovery phase 被兼容为 rollback，以及 recovery role/tool 枚举未失败关闭。实现提交 `4943ed8148946cde15e69474ac0b1de2e7d71f34`、tree `d8ea93a524721ea95c8b994de53fa4e251e387e0` 将 UI accepted run 的精确身份与 `runEpoch` 绑定到 reservation，隔离 external run，并让全部 thread mutation 返回 detached snapshot、严格区分缺失 phase 与非法 falsy phase、限制 role/tool name/status。exact implementation SHA 上无重试完整门禁通过 bundle `222.5kb`、13/13、reservation `83/83`、ConversationStore `202/202`、routing `PASS`、branding 22、官方 registry high/critical 审计、lockfile SHA-256 与 12 路径边界，输出 `FULL_GATE_OK`；fresh final exact-head review 仍待治理提交后执行。
- `2026-08-14 17:02:31 +08:00`：fresh reviewer `518b26b3-1a04-42fe-94f4-7e224541361b` 对旧 final HEAD `7e4c7c72584b48d22e8bb0af2ed872c8c23c5201`、tree `6fb4517cd7257c3a43f9411b387b1b13adc4a3b5` 返回 `REQUEST_CHANGES`（P1=1、P2=2），指出当前 external run 可先于 heartbeat 被 visibility effect 置为 busy 并暴露 stop、生产 run 缺错误身份/过期 TTL mutation shield，以及 `steps` 输入引用仍可绕过队列。实现提交 `fb2db7835624d9ca5dadabebd6a68a30ca9b3113`、tree `3c969432f20dfcf30eb6d92ecd6017c22584fade` 统一 mount/visibility/stream/stop 精确 run ownership，补齐生产 run 负例，并隔离 steps、guard、onCommit 与返回值。exact implementation SHA 上无重试完整门禁通过 bundle `223.6kb`、13/13、reservation `88/88`、ConversationStore `203/203`、routing `PASS`、branding 22、官方 registry high/critical 审计、lockfile SHA-256 与 12 路径边界，输出 `FULL_GATE_OK`；fresh final exact-head review 仍待治理提交后执行。
