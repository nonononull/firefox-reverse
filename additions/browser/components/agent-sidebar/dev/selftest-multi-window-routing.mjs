import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  { hasThreadReservation, acquireOwnedThread, isReservationOwnerCurrent },
);
const restoreUnsentInput = sourceFunction("restoreUnsentInput", "function");
const deleteOwnedThread = sourceFunction(
  "deleteOwnedThread",
  "async function",
  { hasThreadReservation, acquireOwnedThread, renewOwnedThread, releaseOwnedThread },
);
assert.equal(
  (source.match(/conversations\.createThread\s*\(/g) || []).length,
  1,
  "AgentPanel 的所有新建路径必须统一经过 createOwnedThread",
);

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
  const reservations = new Map();
  const generations = new Map();
  const session = {
    beginThreadReservation(owner) {
      const generation = (generations.get(owner) || 0) + 1;
      generations.set(owner, generation);
      return generation;
    },
    acquireThread(ids, owner, generation) {
      if (generations.get(owner) !== generation) return null;
      const id = ids[0];
      const held = reservations.get(id);
      if (held && held.owner !== owner) return null;
      reservations.set(id, { owner, generation });
      return id;
    },
    renewThread(id, owner, generation) {
      const held = reservations.get(id);
      return generations.get(owner) === generation &&
        held?.owner === owner && held?.generation === generation;
    },
    releaseThread(id, owner, generation) {
      const held = reservations.get(id);
      if (generations.get(owner) !== generation ||
          held?.owner !== owner || held?.generation !== generation) {
        return false;
      }
      reservations.delete(id);
      return true;
    },
  };
  const oldMount = createReservationOwner(session, host);
  assert.equal(acquireOwnedThread(session, ["shared"], oldMount), "shared");
  const newMount = createReservationOwner(session, host);
  assert.equal(acquireOwnedThread(session, ["shared"], newMount), "shared");
  let staleCreateCount = 0;
  await assert.rejects(
    () => createOwnedThread(
      { async createThread() { staleCreateCount += 1; } },
      session,
      oldMount,
    ),
    /挂载代际已失效/,
  );
  assert.equal(staleCreateCount, 0, "旧挂载不得在失权后留下空历史 thread");
  assert.equal(
    acquireOwnedThread(session, ["shared"], oldMount),
    null,
    "旧挂载不得用同 owner 迟到重认领新挂载的 reservation",
  );
  assert.equal(
    renewOwnedThread(session, "shared", oldMount, () => {}),
    false,
    "旧挂载不得续约新挂载继承的同 owner reservation",
  );
  assert.equal(
    releaseOwnedThread(session, "shared", oldMount),
    false,
    "旧挂载不得释放新挂载继承的同 owner reservation",
  );
  const genB = session.beginThreadReservation("window-b");
  assert.equal(session.acquireThread(["shared"], "window-b", genB), null);
  assert.equal(releaseOwnedThread(session, "shared", newMount), true);
  assert.equal(session.acquireThread(["shared"], "window-b", genB), "shared");
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
    acquireThread() {
      acquireCount += 1;
      return "target";
    },
    renewThread: () => true,
    releaseThread() {
      releaseCount += 1;
      return true;
    },
  };
  const owner = createReservationOwner(session, host);
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
    () => deleteOwnedThread(conversations, session, "target", owner),
    /正在运行/,
  );
  assert.equal(acquireCount, 0, "运行中的 thread 必须在认领前拒绝删除");
  assert.equal(deleteCount, 0);

  running = false;
  session.acquireThread = () => null;
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", owner),
    /另一个浏览器窗口/,
  );
  assert.equal(deleteCount, 0, "被其它窗口预留的 thread 不得删除");

  session.acquireThread = () => {
    running = true;
    return "target";
  };
  await assert.rejects(
    () => deleteOwnedThread(conversations, session, "target", owner),
    /正在运行/,
  );
  assert.equal(deleteCount, 0, "认领后变为运行态的 thread 仍不得删除");
  assert.equal(releaseCount, 1, "删除未执行时也必须释放本次临时预留");

  running = false;
  session.acquireThread = () => "target";
  await deleteOwnedThread(conversations, session, "target", owner);
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
    () => deleteOwnedThread(conversations, session, "target", owner),
    /authorization lost/,
  );
  assert.equal(deleteCount, 1, "新挂载在存储 load 期间接管后，旧挂载不得删除 thread");
}

{
  let createCount = 0;
  let deleteCount = 0;
  const acquired = [];
  const conversations = {
    async createThread() {
      createCount += 1;
      return { id: `new-${createCount}`, messages: [] };
    },
    async deleteThread() {
      deleteCount += 1;
    },
  };
  const session = {
    beginThreadReservation: () => 1,
    acquireThread(ids) {
      acquired.push(ids[0]);
      return ids[0] === "new-1" ? "some-other-thread" : ids[0];
    },
    renewThread() {
      return true;
    },
    releaseThread() {},
  };
  const thread = await createOwnedThread(
    conversations,
    session,
    { owner: "window-a", generation: 1 },
  );
  assert.equal(thread.id, "new-2", "首个新 thread 被抢后必须有界创建并认领第二个");
  assert.deepEqual(acquired, ["new-1", "new-2"]);
  assert.equal(deleteCount, 0, "被其它窗口认领的空 thread 不得由创建者删除");
}

{
  let lost = 0;
  assert.equal(
    renewOwnedThread(
      { renewThread: () => true },
      "owned",
      { owner: "window-a", generation: 1 },
      () => { lost += 1; },
    ),
    true,
  );
  assert.equal(lost, 0);
  assert.equal(
    renewOwnedThread({}, "legacy", { owner: "window-a", generation: 1 }, () => { lost += 1; }),
    false,
  );
  assert.equal(lost, 1, "缺少 renewThread 时必须失败关闭");
  assert.equal(
    renewOwnedThread(
      { renewThread: () => false },
      "lost",
      { owner: "window-a", generation: 1 },
      () => { lost += 1; },
    ),
    false,
  );
  assert.equal(lost, 2, "renewThread=false 必须立即报告失权");
  assert.equal(
    renewOwnedThread(
      { renewThread: () => { throw new Error("broken"); } },
      "broken",
      { owner: "window-a", generation: 1 },
      () => { lost += 1; },
    ),
    false,
  );
  assert.equal(lost, 3, "renewThread 异常也必须失败关闭");
}

{
  const expected = { id: "thread-a", revision: 7, intent: 0 };
  const selectionRef = { current: { ...expected } };
  delete selectionRef.current.intent;
  const intentRef = { current: 0 };
  const pendingRef = { current: null };
  let releaseCount = 0;
  const session = {
    releaseThread(id, owner, generation) {
      assert.equal(id, "thread-late");
      assert.equal(owner, "window-a");
      assert.equal(generation, 1);
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
      { owner: "window-a", generation: 1 },
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
      { owner: "window-a", generation: 1 },
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
      { owner: "window-a", generation: 1 },
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
  const selectionRef = { current: { id: "thread-a", revision: 3 } };
  const intentRef = { current: 4 };
  const expected = { ...selectionRef.current, intent: 4 };
  const reservation = { owner: "window-a", generation: 1 };
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
  selectionRef.current = { id: "thread-a", revision: 4 };
  assert.equal(ownsSelectedThread(session, selectionRef, expected, reservation), false);
  assert.equal(renewCount, 2, "选择代际已变化时不得续约旧操作");
  selectionRef.current = { id: expected.id, revision: expected.revision };
  session.renewThread = () => false;
  assert.equal(ownsSelectedThread(session, selectionRef, expected, reservation), false);
}

{
  let createCount = 0;
  let boundId = null;
  const conversations = {
    async createThread() {
      createCount += 1;
      return { id: `lost-${createCount}`, messages: [] };
    },
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
        { owner: "window-a", generation: 1 },
      );
      boundId = thread.id;
    },
    /无法认领新会话/,
  );
  assert.equal(createCount, 3, "连续认领失败必须在固定三次后停止");
  assert.equal(boundId, null, "创建者不得绑定认领失败的 thread");
}

const reservationLifecycle = section(
  "// 多窗口隔离的**预留生命周期 + 心跳**",
  "// 流式渲染",
);
assert.match(reservationLifecycle, /renewOwnedThread\(session, currentId, reservation,/);
assert.match(reservationLifecycle, /!sameSelection\(selectionRef\.current, leaseSelection\)/);
assert.match(reservationLifecycle, /keepOwnedThreadForSelection\s*\(/);
assert.match(reservationLifecycle, /setCurrentId\(current\s*=>\s*current\s*===\s*currentId\s*\?\s*null\s*:\s*current\)/);
assert.match(reservationLifecycle, /setError\("当前会话的窗口预留已失效/);

const initialization = section("// 初始化：载入线程列表", "// 续看：mount/切线程");
assert.match(initialization, /acquired\s*===\s*latest\s*\?\s*latest\s*:\s*null/);
assert.match(initialization, /keepOwnedThreadForSelection\s*\(/);
assert.match(initialization, /sameSelectionIntent\(selectionRef, selectionIntentRef, initialSelection\)/);
const openThread = section("async function openThread", "async function deleteThread");
assert.match(openThread, /got\s*!==\s*id/);
assert.match(openThread, /keepOwnedThreadForSelection\s*\(/);
assert.match(openThread, /beginSelectionIntent[\s\S]*try\s*\{[\s\S]*await conversations\.getThread/);
assert.match(openThread, /finally\s*\{\s*finishSelectionIntent\s*\(/);

const newChat = section("async function newChat", "// 选模式：");
assert.match(newChat, /beginSelectionIntent[\s\S]*try\s*\{[\s\S]*await createOwnedThread/);
assert.match(newChat, /finally\s*\{\s*finishSelectionIntent\s*\(/);

const send = section("async function send", "// 「停止」按钮");
assert.match(send, /pendingSelectionIntentRef\.current\s*!==\s*null[\s\S]*return;/);
assert.match(send, /sendSelection\s*=\s*ensured\.selection;[\s\S]*ensured\.reservationLost/);
assert.match(send, /runStarted\s*=\s*true;[\s\S]*if\s*\(!runStarted\)/);
assert.ok(
  (send.match(/ensureStillOwned\s*\(\s*\)/g) || []).length >= 5,
  "发送链在读取历史、写模式、读取笔记和落消息后必须反复核验选择与所有权",
);
assert.match(send, /conversations\.appendMessage[\s\S]*ensureStillOwned\s*\(\s*\)/);
assert.match(send, /conversations\.getThread[\s\S]*catch[\s\S]*ensureStillOwned\s*\(\s*\)/);
assert.match(send, /conversations\.setThreadMode[\s\S]*catch[\s\S]*ensureStillOwned\s*\(\s*\)/);
assert.match(send, /notes\.digest[\s\S]*catch[\s\S]*ensureStillOwned\s*\(\s*\)[\s\S]*session\.run/);
assert.doesNotMatch(send, /setInput\(current\s*=>\s*current\s*\|\|\s*text\)/);
assert.equal(
  (send.match(/setInput\(current\s*=>\s*restoreUnsentInput\(current,\s*text\)\)/g) || []).length,
  3,
  "发送前建会话失权、准备链失权和外层失败都必须无损恢复本次文本",
);

const deleteHistory = section("async function deleteThread", "function onKeyDown");
assert.match(deleteHistory, /await deleteOwnedThread\s*\(/);
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
