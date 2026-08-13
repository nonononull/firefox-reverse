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
const releaseOwnedThread = sourceFunction("releaseOwnedThread", "function");
const keepOwnedThreadForSelection = sourceFunction(
  "keepOwnedThreadForSelection",
  "function",
  { sameSelectionIntent, releaseOwnedThread },
);
const renewOwnedThread = sourceFunction("renewOwnedThread", "function");
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
  { hasThreadReservation },
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
    acquireThread(ids) {
      acquired.push(ids[0]);
      return ids[0] === "new-1" ? "some-other-thread" : ids[0];
    },
    renewThread() {
      return true;
    },
    releaseThread() {},
  };
  const thread = await createOwnedThread(conversations, session, "window-a");
  assert.equal(thread.id, "new-2", "首个新 thread 被抢后必须有界创建并认领第二个");
  assert.deepEqual(acquired, ["new-1", "new-2"]);
  assert.equal(deleteCount, 0, "被其它窗口认领的空 thread 不得由创建者删除");
}

{
  let lost = 0;
  assert.equal(
    renewOwnedThread({ renewThread: () => true }, "owned", "window-a", () => { lost += 1; }),
    true,
  );
  assert.equal(lost, 0);
  assert.equal(renewOwnedThread({}, "legacy", "window-a", () => { lost += 1; }), false);
  assert.equal(lost, 1, "缺少 renewThread 时必须失败关闭");
  assert.equal(
    renewOwnedThread({ renewThread: () => false }, "lost", "window-a", () => { lost += 1; }),
    false,
  );
  assert.equal(lost, 2, "renewThread=false 必须立即报告失权");
  assert.equal(
    renewOwnedThread({ renewThread: () => { throw new Error("broken"); } }, "broken", "window-a", () => { lost += 1; }),
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
    releaseThread(id, owner) {
      assert.equal(id, "thread-late");
      assert.equal(owner, "window-a");
      releaseCount += 1;
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
      "window-a",
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
      "window-a",
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
      "window-a",
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
  assert.equal(ownsSelectedThread(session, selectionRef, expected, "window-a"), true);
  assert.equal(
    ownsSelectedThreadForIntent(session, selectionRef, intentRef, expected, "window-a"),
    true,
  );
  assert.equal(renewCount, 2);
  intentRef.current = 5;
  assert.equal(
    ownsSelectedThreadForIntent(session, selectionRef, intentRef, expected, "window-a"),
    false,
  );
  assert.equal(renewCount, 2, "意图已变化时不得续约旧操作");
  intentRef.current = 4;
  selectionRef.current = { id: "thread-a", revision: 4 };
  assert.equal(ownsSelectedThread(session, selectionRef, expected, "window-a"), false);
  assert.equal(renewCount, 2, "选择代际已变化时不得续约旧操作");
  selectionRef.current = { id: expected.id, revision: expected.revision };
  session.renewThread = () => false;
  assert.equal(ownsSelectedThread(session, selectionRef, expected, "window-a"), false);
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
  const session = { acquireThread: () => null, renewThread: () => true, releaseThread() {} };
  await assert.rejects(
    async () => {
      const thread = await createOwnedThread(conversations, session, "window-a");
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
assert.match(reservationLifecycle, /renewOwnedThread\(session, currentId, owner,/);
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

assert.match(externalVisibility, /stopped\s*\|\|\s*!sameSelection\s*\(/);

console.log("multi-window routing contract: PASS");
