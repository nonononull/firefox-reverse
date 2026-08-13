import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConversationStore } from "../modules/ConversationStore.sys.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const panelPath = path.join(here, "..", "content", "AgentPanel.jsx");
const source = fs.readFileSync(panelPath, "utf8");

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

function sourceFunction(name, prefix = "async function", dependencies = {}) {
  const marker = `${prefix} ${name}`;
  const from = source.indexOf(marker);
  assert.notEqual(from, -1, `missing exported function: ${name}`);
  const bodyStart = source.indexOf("{", from + marker.length);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) {
      const declaration = source.slice(from, i + 1);
      return Function(...Object.keys(dependencies), `${declaration}; return ${name};`)(
        ...Object.values(dependencies),
      );
    }
  }
  assert.fail(`unterminated exported function: ${name}`);
}

const externalVisibility = section(
  "// ── 外部 / MCP 驱动可见性",
  "// 自动跟随最新回复",
);
assert.doesNotMatch(
  externalVisibility,
  /openThread(?:Ref\.current)?\s*\(/,
  "外部运行探测不得接管另一个窗口的 thread",
);

const externalBanner = section("{extRunning && (", "<div className=\"agent-ws\">");
assert.match(externalBanner, /onClick=\{\(\) => \{ setExtRunning\(null\); newChat\(\); \}\}/);
assert.match(externalBanner, /该任务在原窗口运行/);
assert.doesNotMatch(externalBanner, /openThread\s*\(/);

const history = section(
  "{threads.map(t => (",
  '<button type="button" className="agent-history__del"',
);
assert.match(history, /onClick=\{\(\) => openThread\(t\.id\)\}/);
const historyDeletion = section("async function deleteThread", "function onKeyDown");
assert.match(
  historyDeletion,
  /deleteOwnedThread\([\s\S]*?!deletingCurrent,[\s\S]*?deletingCurrent,[\s\S]*?\)/,
  "当前删除必须验证既有 reservation，非当前删除仍使用临时 claim",
);

const hasThreadReservation = sourceFunction("hasThreadReservation", "function");
const sameSelection = sourceFunction("sameSelection", "function");
const captureSelectionIntent = sourceFunction("captureSelectionIntent", "function");
const beginSelectionIntent = sourceFunction(
  "beginSelectionIntent",
  "function",
  { captureSelectionIntent },
);
const finishSelectionIntent = sourceFunction("finishSelectionIntent", "function");
const sameSelectionIntent = sourceFunction(
  "sameSelectionIntent",
  "function",
  { sameSelection },
);
const createReservationOwner = sourceFunction("createReservationOwner", "function");
const reservationOwnerToken = sourceFunction("reservationOwnerToken", "function");
const isReservationOwnerCurrent = sourceFunction("isReservationOwnerCurrent", "function");
const createClaim = sourceFunction(
  "createReservationClaim",
  "function",
  { isReservationOwnerCurrent },
);
const reservationForSelection = sourceFunction("reservationForSelection", "function");
const acquireOwnedThread = sourceFunction(
  "acquireOwnedThread",
  "function",
  { reservationOwnerToken, isReservationOwnerCurrent },
);
const releaseOwnedThread = sourceFunction(
  "releaseOwnedThread",
  "function",
  { reservationOwnerToken, isReservationOwnerCurrent },
);
const keepOwnedThreadForSelection = sourceFunction(
  "keepOwnedThreadForSelection",
  "function",
  { sameSelectionIntent, releaseOwnedThread },
);
const renewOwnedThread = sourceFunction(
  "renewOwnedThread",
  "function",
  { reservationOwnerToken, isReservationOwnerCurrent },
);
const readAcquiredThread = sourceFunction(
  "readAcquiredThread",
  "async function",
  { renewOwnedThread, releaseOwnedThread },
);
const discardOwnedThread = sourceFunction(
  "discardOwnedThread",
  "async function",
  { renewOwnedThread, releaseOwnedThread },
);
const ownsSelectedThread = sourceFunction(
  "ownsSelectedThread",
  "function",
  { sameSelection, renewOwnedThread },
);
const ownsSelectedThreadForIntent = sourceFunction(
  "ownsSelectedThreadForIntent",
  "function",
  { sameSelectionIntent, ownsSelectedThread },
);
const createOwnedThread = sourceFunction(
  "createOwnedThread",
  "async function",
  {
    hasThreadReservation,
    acquireOwnedThread,
    createReservationClaim: createClaim,
    discardOwnedThread,
    isReservationOwnerCurrent,
    releaseOwnedThread,
    renewOwnedThread,
  },
);
const commitOwnedUserMessage = sourceFunction("commitOwnedUserMessage", "async function");
const restoreUnsentInput = sourceFunction("restoreUnsentInput", "function");
const deleteOwnedThread = sourceFunction(
  "deleteOwnedThread",
  "async function",
  {
    hasThreadReservation,
    acquireOwnedThread,
    createReservationClaim: createClaim,
    renewOwnedThread,
    releaseOwnedThread,
  },
);
assert.equal(
  (source.match(/conversations\.createThread\s*\(/g) || []).length,
  1,
  "AgentPanel 的所有新建路径必须统一经过 createOwnedThread",
);

function makeClaimSession() {
  const generations = new Map();
  const claims = new Map();
  const reservations = new Map();
  const running = new Set();
  const runCalls = [];
  return {
    reservations,
    runCalls,
    beginThreadReservation(owner) {
      const generation = (generations.get(owner) || 0) + 1;
      generations.set(owner, generation);
      claims.set(owner, 0);
      return generation;
    },
    acquireThread(ids, owner, generation, claim) {
      if (generations.get(owner) !== generation || !Number.isInteger(claim) || claim < claims.get(owner)) {
        return null;
      }
      for (const id of ids || []) {
        const held = reservations.get(id);
        if (held?.owner !== owner && held) {
          continue;
        }
        reservations.set(id, { owner, generation, claim });
        if (claim > claims.get(owner)) {
          claims.set(owner, claim);
        }
        return id;
      }
      return null;
    },
    renewThread(id, owner, generation, claim) {
      const held = reservations.get(id);
      return generations.get(owner) === generation && held?.owner === owner &&
        held?.generation === generation && held?.claim === claim;
    },
    releaseThread(id, owner, generation, claim) {
      const held = reservations.get(id);
      if (generations.get(owner) !== generation || held?.owner !== owner ||
          held?.generation !== generation || held?.claim !== claim) {
        return false;
      }
      reservations.delete(id);
      return true;
    },
    isRunning(id) {
      return running.has(id);
    },
    run(id, options) {
      running.add(id);
      runCalls.push({ id, options });
    },
  };
}

{
  assert.equal(hasThreadReservation(null), false);
  assert.equal(hasThreadReservation({ acquireThread() {}, renewThread() {} }), false);
  assert.equal(
    hasThreadReservation({ acquireThread() {}, renewThread() {}, releaseThread() {} }),
    false,
  );
  assert.equal(
    hasThreadReservation({
      beginThreadReservation() {},
      acquireThread() {},
      renewThread() {},
      releaseThread() {},
    }),
    true,
  );

  let createCount = 0;
  await assert.rejects(
    () => createOwnedThread({ async createThread() { createCount += 1; } }, {}, "window-a"),
    /预留 API 不完整/,
  );
  assert.equal(createCount, 0, "预留 API 不完整时不得先创建无主 thread");
}

{
  const host = {};
  const session = makeClaimSession();
  const oldMount = createReservationOwner(session, host);
  const oldClaim = createClaim(oldMount);
  assert.equal(acquireOwnedThread(session, ["shared"], oldClaim), "shared");
  const newMount = createReservationOwner(session, host);
  const newClaim = createClaim(newMount);
  assert.equal(acquireOwnedThread(session, ["shared"], newClaim), "shared");
  let staleCreateCount = 0;
  await assert.rejects(
    () => createOwnedThread(
      { async createThread() { staleCreateCount += 1; }, async deleteThread() {} },
      session,
      oldMount,
    ),
    /挂载代际已失效/,
  );
  assert.equal(staleCreateCount, 0, "旧挂载不得在失权后留下空历史 thread");
  assert.equal(
    acquireOwnedThread(session, ["shared"], oldClaim),
    null,
    "旧挂载不得用同 owner 迟到重认领新挂载的 reservation",
  );
  assert.equal(
    renewOwnedThread(session, "shared", oldClaim, () => {}),
    false,
    "旧挂载不得续约新挂载继承的同 owner reservation",
  );
  assert.equal(
    releaseOwnedThread(session, "shared", oldClaim),
    false,
    "旧挂载不得释放新挂载继承的同 owner reservation",
  );
  const genB = session.beginThreadReservation("window-b");
  assert.equal(session.acquireThread(["shared"], "window-b", genB, 1), null);
  assert.equal(releaseOwnedThread(session, "shared", newClaim), true);
  assert.equal(session.acquireThread(["shared"], "window-b", genB, 2), "shared");
}

{
  assert.equal(restoreUnsentInput("", "发送 A"), "发送 A");
  assert.equal(restoreUnsentInput("随后输入 B", "发送 A"), "发送 A\n随后输入 B");
  assert.equal(
    restoreUnsentInput("发送 A\n随后输入 B", "发送 A"),
    "发送 A\n随后输入 B",
    "同一次失败经过多层 catch 时不得重复恢复",
  );
}

{
  const host = {};
  let running = true;
  let acquireCount = 0;
  let deleteCount = 0;
  let releaseCount = 0;
  const session = {
    beginThreadReservation: () => 1,
    isRunning: () => running,
    acquireThread(_ids, _owner, _generation, claim) {
      acquireCount += 1;
      assert.ok(Number.isInteger(claim));
      return "target";
    },
    renewThread: () => true,
    releaseThread() {
      releaseCount += 1;
      return true;
    },
  };
  const owner = createReservationOwner(session, host);
  const ownerClaim = createClaim(owner);
  const conversations = {
    async deleteThread(_id, canDelete) {
      assert.equal(typeof canDelete, "function", "删除必须把所有权 guard 传到存储线性化点");
      if (canDelete() !== true) {
        throw new Error("conversation deletion authorization lost: target");
      }
      deleteCount += 1;
    },
  };
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", ownerClaim, true),
    /正在运行/,
  );
  assert.equal(acquireCount, 0, "运行中的 thread 必须在认领前拒绝删除");
  assert.equal(deleteCount, 0);

  running = false;
  session.acquireThread = () => null;
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", ownerClaim, true),
    /另一个浏览器窗口/,
  );
  assert.equal(deleteCount, 0, "被其它窗口预留的 thread 不得删除");

  session.acquireThread = () => {
    running = true;
    return "target";
  };
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", ownerClaim, true),
    /正在运行/,
  );
  assert.equal(deleteCount, 0, "认领后变为运行态的 thread 仍不得删除");
  assert.equal(releaseCount, 1, "删除未执行时也必须释放本次临时预留");

  running = false;
  session.acquireThread = () => "target";
  await deleteOwnedThread(conversations, session, "target", ownerClaim, true);
  assert.equal(deleteCount, 1);
  assert.equal(releaseCount, 2, "删除完成后必须释放本次临时预留");

  session.acquireThread = () => "target";
  conversations.deleteThread = async (_id, canDelete) => {
    host.__frxAgentOwnerGeneration = owner.generation + 1;
    if (canDelete() !== true) {
      throw new Error("conversation deletion authorization lost: target");
    }
    deleteCount += 1;
  };
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", ownerClaim, true),
    /authorization lost/,
  );
  assert.equal(deleteCount, 1, "新挂载在存储 load 期间接管后，旧挂载不得删除 thread");

  host.__frxAgentOwnerGeneration = owner.generation;
  const currentClaim = createClaim(owner);
  session.acquireThread = () => "target";
  session.renewThread = () => false;
  const releaseBeforeCurrentFailure = releaseCount;
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", currentClaim, false, true),
    /预留已失效/,
  );
  assert.equal(
    releaseCount,
    releaseBeforeCurrentFailure,
    "删除当前 thread 失败时不得释放其既有 claim",
  );
}

{
  let createCount = 0;
  const acquired = [];
  const conversations = new ConversationStore({ memoryOnly: true });
  const originalCreate = conversations.createThread.bind(conversations);
  conversations.createThread = async (...args) => {
    createCount += 1;
    return originalCreate(...args);
  };
  const session = {
    beginThreadReservation: () => 1,
    acquireThread(ids, _owner, _generation, claim) {
      acquired.push(ids[0]);
      return claim === 1 ? null : ids[0];
    },
    renewThread() {
      return true;
    },
    releaseThread() {},
  };
  const created = await createOwnedThread(
    conversations,
    session,
    { owner: "window-a", generation: 1, claimState: { next: 0 } },
  );
  assert.equal(created.reservation.claim, 2, "首个 claim 冲突后必须用后续 claim 有界重试");
  assert.equal(createCount, 2);
  assert.equal(acquired.length, 2);
  assert.equal((await conversations.listThreads()).length, 1, "认领失败的候选不得落入历史列表");
}

{
  const conversations = new ConversationStore({ memoryOnly: true });
  const released = [];
  let attempt = 0;
  const session = {
    beginThreadReservation: () => 1,
    acquireThread(ids) {
      attempt += 1;
      return attempt === 1 ? "wrong-id" : ids[0];
    },
    renewThread: () => true,
    releaseThread(id) {
      released.push(id);
      return true;
    },
  };
  const created = await createOwnedThread(
    conversations,
    session,
    { owner: "window-a", generation: 1, claimState: { next: 0 } },
  );
  assert.equal(created.reservation.claim, 2);
  assert.ok(released.includes("wrong-id"), "错误非空 acquire ID 必须按对应 claim 立即释放");
  assert.equal((await conversations.listThreads()).length, 1, "错误 ID 的候选不得留下孤立历史");
}

{
  let lost = 0;
  assert.equal(
    renewOwnedThread(
      { renewThread: () => true },
      "owned",
      { owner: "window-a", generation: 1, claim: 1 },
      () => { lost += 1; },
    ),
    true,
  );
  assert.equal(lost, 0);
  assert.equal(
    renewOwnedThread({}, "legacy", { owner: "window-a", generation: 1, claim: 1 }, () => { lost += 1; }),
    false,
  );
  assert.equal(lost, 1, "缺少 renewThread 时必须失败关闭");
  assert.equal(
    renewOwnedThread(
      { renewThread: () => false },
      "lost",
      { owner: "window-a", generation: 1, claim: 1 },
      () => { lost += 1; },
    ),
    false,
  );
  assert.equal(lost, 2, "renewThread=false 必须立即报告失权");
  assert.equal(
    renewOwnedThread(
      { renewThread: () => { throw new Error("broken"); } },
      "broken",
      { owner: "window-a", generation: 1, claim: 1 },
      () => { lost += 1; },
    ),
    false,
  );
  assert.equal(lost, 3, "renewThread 异常也必须失败关闭");
}

{
  const expected = { id: "thread-a", revision: 7, claim: 1, intent: 0 };
  const selectionRef = { current: { ...expected } };
  delete selectionRef.current.intent;
  const intentRef = { current: 0 };
  const pendingRef = { current: null };
  let releaseCount = 0;
  const session = {
    releaseThread(id, owner, generation, claim) {
      assert.equal(id, "thread-late");
      assert.equal(owner, "window-a");
      assert.equal(generation, 1);
      assert.equal(claim, 1);
      releaseCount += 1;
      return true;
    },
  };
  assert.equal(sameSelection(selectionRef.current, expected), true);
  assert.equal(sameSelectionIntent(selectionRef, intentRef, expected), true);
  assert.equal(
    keepOwnedThreadForSelection(
      selectionRef,
      intentRef,
      expected,
      { id: "thread-late" },
      session,
      { owner: "window-a", generation: 1, claim: 1 },
    ),
    true,
  );
  const newer = beginSelectionIntent(selectionRef, intentRef, pendingRef);
  assert.equal(pendingRef.current, newer.intent);
  assert.equal(newer.id, expected.id);
  assert.equal(newer.revision, expected.revision);
  assert.equal(sameSelection(selectionRef.current, expected), true, "用户意图变化前后可仍是同一已提交选择");
  assert.equal(sameSelectionIntent(selectionRef, intentRef, expected), false, "新用户意图必须淘汰旧异步结果");
  assert.equal(
    keepOwnedThreadForSelection(
      selectionRef,
      intentRef,
      expected,
      { id: "thread-late" },
      session,
      { owner: "window-a", generation: 1, claim: 1 },
    ),
    false,
  );
  assert.equal(releaseCount, 0, "迟到的历史认领不得释放同 owner 的更新事务");
  assert.equal(
    keepOwnedThreadForSelection(
      selectionRef,
      intentRef,
      expected,
      { id: "thread-late" },
      session,
      { owner: "window-a", generation: 1, claim: 1 },
      true,
    ),
    false,
  );
  assert.equal(releaseCount, 1, "迟到的唯一新建 thread 必须释放");
  const newest = beginSelectionIntent(selectionRef, intentRef, pendingRef);
  finishSelectionIntent(pendingRef, newer);
  assert.equal(pendingRef.current, newest.intent, "旧事务结束不得清除更新事务的 pending 标记");
  finishSelectionIntent(pendingRef, newest);
  assert.equal(pendingRef.current, null, "当前选择事务结束后必须清除 pending 标记");
}

{
  let renewCount = 0;
  const session = {
    renewThread() {
      renewCount += 1;
      return true;
    },
  };
  const selectionRef = { current: { id: "thread-a", revision: 3, claim: 1 } };
  const intentRef = { current: 4 };
  const expected = { ...selectionRef.current, intent: 4 };
  const reservation = { owner: "window-a", generation: 1, claim: 1 };
  assert.equal(ownsSelectedThread(session, selectionRef, expected, reservation), true);
  assert.equal(
    ownsSelectedThreadForIntent(session, selectionRef, intentRef, expected, reservation),
    true,
  );
  assert.equal(renewCount, 2);
  intentRef.current = 5;
  assert.equal(
    ownsSelectedThreadForIntent(session, selectionRef, intentRef, expected, reservation),
    false,
  );
  assert.equal(renewCount, 2, "意图已变化时不得续约旧操作");
  intentRef.current = 4;
  selectionRef.current = { id: "thread-a", revision: 4, claim: 1 };
  assert.equal(ownsSelectedThread(session, selectionRef, expected, reservation), false);
  assert.equal(renewCount, 2, "选择代际已变化时不得续约旧操作");
  selectionRef.current = { id: expected.id, revision: expected.revision, claim: expected.claim };
  session.renewThread = () => false;
  assert.equal(ownsSelectedThread(session, selectionRef, expected, reservation), false);
}

{
  let createCount = 0;
  let boundId = null;
  const conversations = new ConversationStore({ memoryOnly: true });
  const originalCreate = conversations.createThread.bind(conversations);
  conversations.createThread = async (...args) => {
    createCount += 1;
    return originalCreate(...args);
  };
  const session = {
    beginThreadReservation: () => 1,
    acquireThread: () => null,
    renewThread: () => true,
    releaseThread() {},
  };
  await assert.rejects(
    async () => {
      const thread = await createOwnedThread(
        conversations,
        session,
        { owner: "window-a", generation: 1, claimState: { next: 0 } },
      );
      boundId = thread.thread.id;
    },
    /无法认领新会话/,
  );
  assert.equal(createCount, 3, "连续认领失败必须在固定三次后停止");
  assert.equal(boundId, null, "创建者不得绑定认领失败的 thread");
  assert.equal((await conversations.listThreads()).length, 0, "连续认领失败不得留下孤立历史 thread");
}

{
  const session = makeClaimSession();
  const owner = createReservationOwner(session, {});
  const store = new ConversationStore({ memoryOnly: true });
  let intentCurrent = true;
  const originalLoad = store._load.bind(store);
  let allowLoad;
  store._load = async () => {
    await new Promise(resolve => { allowLoad = resolve; });
    return originalLoad();
  };
  const pending = createOwnedThread(store, session, owner, () => intentCurrent);
  while (!allowLoad) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  intentCurrent = false;
  allowLoad();
  await assert.rejects(pending, /选择已变化/);
  store._load = originalLoad;
  assert.equal((await store.listThreads()).length, 0, "createThread 的 load 期间 intent 失效不得落孤立历史");
  assert.equal(session.reservations.size, 0, "迟到创建不得泄漏 reservation");

  const saveDelayedStore = new ConversationStore({ memoryOnly: true });
  let allowSave;
  let saveCount = 0;
  saveDelayedStore._save = async () => {
    saveCount += 1;
    if (saveCount === 1) {
      await new Promise(resolve => { allowSave = resolve; });
    }
  };
  let keepCreated = true;
  const saveDelayedCreate = createOwnedThread(
    saveDelayedStore,
    session,
    owner,
    () => keepCreated,
  );
  while (!allowSave) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.equal((await saveDelayedStore.listThreads()).length, 0, "保存完成前不得向其它窗口公开 pending thread");
  keepCreated = false;
  allowSave();
  await assert.rejects(saveDelayedCreate, /清理或移交迟到的新会话/);
  assert.equal((await saveDelayedStore.listThreads()).length, 0, "保存期间失效且仍持有 claim 时必须删除空历史");
  assert.equal(session.reservations.size, 0, "保存期间失效不得泄漏旧 claim");

  const handoffStore = new ConversationStore({ memoryOnly: true });
  let allowHandoffSave;
  let handoffSaveCount = 0;
  handoffStore._save = async () => {
    handoffSaveCount += 1;
    if (handoffSaveCount === 1) {
      await new Promise(resolve => { allowHandoffSave = resolve; });
    }
  };
  let keepHandoff = true;
  const handoffCreate = createOwnedThread(handoffStore, session, owner, () => keepHandoff);
  while (!allowHandoffSave) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const handoffId = handoffStore._mem.threads[0].id;
  const newerClaim = createClaim(owner);
  assert.equal(acquireOwnedThread(session, [handoffId], newerClaim), handoffId);
  keepHandoff = false;
  allowHandoffSave();
  await assert.rejects(handoffCreate, /清理或移交迟到的新会话/);
  assert.equal((await handoffStore.listThreads()).length, 1, "新 claim 已接管时旧操作不得删除该 thread");
  assert.equal(session.reservations.get(handoffId)?.claim, newerClaim.claim, "迟到清理不得释放更新 claim");
  releaseOwnedThread(session, handoffId, newerClaim);

  const existing = await store.createThread(undefined, null, null, () => true);
  const claim = createClaim(owner);
  assert.equal(acquireOwnedThread(session, [existing.id], claim), existing.id);
  let allowRead;
  const delayedConversations = {
    async getThread() {
      await new Promise(resolve => { allowRead = resolve; });
      return existing;
    },
  };
  let keepRead = true;
  const delayedRead = readAcquiredThread(
    delayedConversations,
    session,
    existing.id,
    claim,
    () => keepRead,
  );
  while (!allowRead) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  keepRead = false;
  allowRead();
  await assert.rejects(delayedRead, /read authorization lost/);
  assert.equal(session.reservations.has(existing.id), false, "迟到历史读取必须释放自己的 claim");
}

{
  const store = new ConversationStore({ memoryOnly: true });
  const thread = await store.createThread(undefined, null, null, () => true);
  const session = makeClaimSession();
  const commitState = { started: false };
  let canCommit = false;
  await assert.rejects(
    () => commitOwnedUserMessage(
      store,
      session,
      thread.id,
      { role: "user", content: "发送 A" },
      { systemPrompt: "test" },
      () => canCommit,
      () => {},
      commitState,
    ),
    /append authorization lost/,
  );
  assert.equal((await store.getThread(thread.id)).messages.length, 0, "提交前失权必须零消息写入");
  assert.equal(session.runCalls.length, 0, "提交前失权必须零任务启动");

  canCommit = true;
  await commitOwnedUserMessage(
    store,
    session,
    thread.id,
    { role: "user", content: "发送 A" },
    { systemPrompt: "test" },
    () => canCommit,
    () => {},
    commitState,
  );
  assert.equal(commitState.started, true);
  assert.equal(session.runCalls.length, 1, "成功提交只能启动一次任务");
  assert.deepEqual(
    session.runCalls[0].options.convo.map(message => message.content),
    ["发送 A"],
    "session.run 必须看到同步提交后的权威消息",
  );

  const runThrowStore = new ConversationStore({ memoryOnly: true });
  const runThrowThread = await runThrowStore.createThread(undefined, null, null, () => true);
  let runThrowCalls = 0;
  const runThrowState = { started: false };
  await assert.rejects(
    () => commitOwnedUserMessage(
      runThrowStore,
      {
        isRunning: () => false,
        run() {
          runThrowCalls += 1;
          throw new Error("run failed");
        },
      },
      runThrowThread.id,
      { role: "user", content: "不得残留" },
      {},
      () => true,
      () => {},
      runThrowState,
    ),
    /run failed/,
  );
  assert.equal(runThrowCalls, 1);
  assert.equal(runThrowState.started, false, "session.run 抛错时不得标记已启动");
  assert.equal((await runThrowStore.getThread(runThrowThread.id)).messages.length, 0, "session.run 抛错时回滚用户消息");

  const notRunningStore = new ConversationStore({ memoryOnly: true });
  const notRunningThread = await notRunningStore.createThread(undefined, null, null, () => true);
  let notRunningCalls = 0;
  const notRunningState = { started: false };
  await assert.rejects(
    () => commitOwnedUserMessage(
      notRunningStore,
      {
        isRunning: () => false,
        run() { notRunningCalls += 1; },
      },
      notRunningThread.id,
      { role: "user", content: "未启动不得残留" },
      {},
      () => true,
      () => {},
      notRunningState,
    ),
    /Agent 未进入运行态/,
  );
  assert.equal(notRunningCalls, 1);
  assert.equal(notRunningState.started, false, "session.run 未进入 running 时不得标记已启动");
  assert.equal((await notRunningStore.getThread(notRunningThread.id)).messages.length, 0, "session.run 未进入 running 时回滚用户消息");

  const saveFailStore = new ConversationStore({ memoryOnly: true });
  const saveFailThread = await saveFailStore.createThread(undefined, null, null, () => true);
  saveFailStore._memoryOnly = false;
  saveFailStore._save = async () => { throw new Error("save failed"); };
  const saveFailSession = makeClaimSession();
  const saveFailState = { started: false };
  await assert.rejects(
    () => commitOwnedUserMessage(
      saveFailStore,
      saveFailSession,
      saveFailThread.id,
      { role: "user", content: "已启动" },
      {},
      () => true,
      () => {},
      saveFailState,
    ),
    /save failed/,
  );
  assert.equal(saveFailState.started, true, "任务启动后保存失败必须保留 started 状态");
  assert.equal(saveFailSession.runCalls.length, 1, "保存失败不得触发第二次任务启动");
}

{
  const session = makeClaimSession();
  const owner = createReservationOwner(session, {});
  const currentClaim = createClaim(owner);
  assert.equal(acquireOwnedThread(session, ["current"], currentClaim), "current");
  const deleteClaim = createClaim(owner);
  let deleted = false;
  await deleteOwnedThread(
    {
      async deleteThread(id, canDelete) {
        assert.equal(id, "history");
        assert.equal(canDelete(), true);
        deleted = true;
      },
    },
    session,
    "history",
    deleteClaim,
    true,
  );
  assert.equal(deleted, true, "非当前历史必须由最新 claim 完成受控删除");
  assert.equal(session.reservations.has("history"), false, "附属删除结束后必须释放目标 reservation");
  assert.equal(
    renewOwnedThread(session, "current", currentClaim, () => {}),
    true,
    "附属删除发布更高 claim 后，当前 thread 的旧 reservation 仍可续约",
  );
  let currentDeleted = false;
  await deleteOwnedThread(
    {
      async deleteThread(id, canDelete) {
        assert.equal(id, "current");
        assert.equal(canDelete(), true);
        currentDeleted = true;
      },
    },
    session,
    "current",
    currentClaim,
    false,
    true,
  );
  assert.equal(currentDeleted, true, "附属删除后仍必须能删除自己持有的当前 thread");
  assert.equal(session.reservations.has("current"), false, "当前 thread 删除成功后必须释放既有 reservation");
}

const reservationLifecycle = section(
  "// 多窗口隔离的**预留生命周期 + 心跳**",
  "// 流式渲染",
);
assert.match(reservationLifecycle, /renewOwnedThread\(session, currentId, leaseReservation,/);
assert.match(reservationLifecycle, /!sameSelection\(selectionRef\.current, leaseSelection\)/);
assert.match(reservationLifecycle, /keepOwnedThreadForSelection\s*\(/);
assert.match(reservationLifecycle, /setCurrentId\(current\s*=>\s*current\s*===\s*currentId\s*\?\s*null\s*:\s*current\)/);
assert.match(reservationLifecycle, /setError\("当前会话的窗口预留已失效/);

const initialization = section("// 初始化：载入线程列表", "// 续看：mount/切线程");
assert.match(initialization, /acquired\s*===\s*latest\s*\?\s*latest\s*:\s*null/);
assert.match(initialization, /await readAcquiredThread\s*\(/);
assert.match(initialization, /keepOwnedThreadForSelection\s*\(/);
assert.match(initialization, /sameSelectionIntent\(selectionRef, selectionIntentRef, initialSelection\)/);
const openThread = section("async function openThread", "async function deleteThread");
assert.match(openThread, /got\s*!==\s*id/);
assert.match(openThread, /readAcquiredThread\s*\(/);
assert.match(openThread, /beginSelectionIntent[\s\S]*try\s*\{[\s\S]*await conversations\.getThread/);
assert.match(openThread, /finally\s*\{[\s\S]*releaseOwnedThread[\s\S]*finishSelectionIntent\s*\(/);

const newChat = section("async function newChat", "// 选模式：");
assert.match(newChat, /beginSelectionIntent[\s\S]*try\s*\{[\s\S]*await createOwnedThread/);
assert.match(newChat, /finally\s*\{\s*finishSelectionIntent\s*\(/);

const send = section("async function send", "// 「停止」按钮");
assert.match(send, /pendingSelectionIntentRef\.current\s*!==\s*null[\s\S]*return;/);
assert.match(send, /sendSelection\s*=\s*ensured\.selection;[\s\S]*ensured\.reservationLost/);
assert.match(send, /await commitOwnedUserMessage\s*\(/);
assert.match(send, /if\s*\(!commitState\.started\)\s*\{\s*setInput\(current\s*=>\s*restoreUnsentInput/);
assert.doesNotMatch(send, /conversations\.appendMessage\s*\(/);
assert.doesNotMatch(send, /session\.run\s*\(/);
assert.doesNotMatch(send, /setMessages\(\[\.\.\.messages,\s*userMsg\]\)/);
assert.doesNotMatch(send, /setInput\(current\s*=>\s*current\s*\|\|\s*text\)/);
assert.equal(
  (send.match(/setInput\(current\s*=>\s*restoreUnsentInput\(current,\s*text\)\)/g) || []).length,
  1,
  "只有原子提交尚未启动任务时才能恢复本次文本",
);

const deleteHistory = section("async function deleteThread", "function onKeyDown");
assert.match(deleteHistory, /await deleteOwnedThread\s*\(/);
assert.match(deleteHistory, /deletingCurrent[\s\S]*createReservationClaim\(reservationRef\.current\)/);
assert.doesNotMatch(deleteHistory, /await conversations\.deleteThread\s*\(/);
assert.match(deleteHistory, /beginSelectionIntent[\s\S]*finally\s*\{\s*finishSelectionIntent\s*\(/);

assert.equal(
  (source.match(/session\.acquireThread\s*\(/g) || []).length,
  1,
  "AgentPanel 只允许 generation-aware acquire helper 直连底层 API",
);
assert.equal(
  (source.match(/session\.renewThread\s*\(/g) || []).length,
  1,
  "AgentPanel 只允许 generation-aware renew helper 直连底层 API",
);
assert.equal(
  (source.match(/session\.releaseThread\s*\(/g) || []).length,
  1,
  "AgentPanel 只允许 generation-aware release helper 直连底层 API",
);

assert.match(externalVisibility, /stopped\s*\|\|\s*!sameSelection\s*\(/);

console.log("multi-window routing contract: PASS");
