/* dev/selftest-conversations.mjs — ConversationStore（内存 backend）逻辑自测。
 *   node dev/selftest-conversations.mjs
 */
import { ConversationStore } from "../modules/ConversationStore.sys.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗ FAIL:", m)));

const s = new ConversationStore({ memoryOnly: true });

ok((await s.listThreads()).length === 0, "初始无线程");

const t1 = await s.createThread(undefined, null, null, () => true);
ok(t1.id && t1.title === "新对话" && t1.messages.length === 0, "createThread 返回空线程");
ok((await s.listThreads()).length === 1, "列表含 1 条");

await s.appendMessage(t1.id, { role: "user", content: "帮我分析 sign 加密入口在哪" }, () => true);
const got = await s.getThread(t1.id);
ok(got.messages.length === 1 && got.messages[0].role === "user", "appendMessage 落入");
ok(got.title === "帮我分析 sign 加密入口在哪", "首条 user 消息自动成标题");

await s.appendMessage(t1.id, { role: "assistant", content: "..." });
ok((await s.getThread(t1.id)).messages.length === 2, "assistant 消息追加");

// 第二个线程 + 排序（updatedAt 倒序）
const t2 = await s.createThread(undefined, null, null, () => true);
await s.appendMessage(t2.id, { role: "user", content: "第二个对话" }, () => true);
const list = await s.listThreads();
ok(list[0].id === t2.id, "最近更新的线程排在前");
ok(list.find(t => t.id === t1.id).count === 2, "摘要带消息计数");

const delayedCreateStore = new ConversationStore({ memoryOnly: true });
const delayedCreateLoad = delayedCreateStore._load.bind(delayedCreateStore);
let allowCreateLoad;
delayedCreateStore._load = async () => {
  await new Promise(resolve => { allowCreateLoad = resolve; });
  return delayedCreateLoad();
};
let createOwned = true;
const delayedCreate = delayedCreateStore.createThread(undefined, null, null, () => createOwned);
while (!allowCreateLoad) {
  await new Promise(resolve => setTimeout(resolve, 0));
}
createOwned = false;
allowCreateLoad();
let delayedCreateRejected = false;
try {
  await delayedCreate;
} catch (e) {
  delayedCreateRejected = /creation authorization lost/.test(String(e?.message || e));
}
delayedCreateStore._load = delayedCreateLoad;
ok(delayedCreateRejected, "createThread 在 load 后失权时失败关闭");
ok((await delayedCreateStore.listThreads()).length === 0, "createThread 失权时不留下孤立历史");

const guardedStore = new ConversationStore({ memoryOnly: true });
const guardedThread = await guardedStore.createThread(undefined, null, null, () => true);
const guardedLoad = guardedStore._load.bind(guardedStore);
let allowAppendLoad;
guardedStore._load = async () => {
  await new Promise(resolve => { allowAppendLoad = resolve; });
  return guardedLoad();
};
let appendOwned = true;
let startCount = 0;
const delayedAppend = guardedStore.appendMessage(
  guardedThread.id,
  { role: "user", content: "不得迟到落盘" },
  () => appendOwned,
  () => { startCount += 1; },
);
while (!allowAppendLoad) {
  await new Promise(resolve => setTimeout(resolve, 0));
}
appendOwned = false;
allowAppendLoad();
let delayedAppendRejected = false;
try {
  await delayedAppend;
} catch (e) {
  delayedAppendRejected = /append authorization lost/.test(String(e?.message || e));
}
guardedStore._load = guardedLoad;
ok(delayedAppendRejected, "appendMessage 在 load 后失权时失败关闭");
ok(startCount === 0, "appendMessage 失权时不启动任务");
ok((await guardedStore.getThread(guardedThread.id)).messages.length === 0, "appendMessage 失权时不修改消息");

const commitOrder = [];
await guardedStore.appendMessage(
  guardedThread.id,
  { role: "user", content: "原子提交" },
  () => { commitOrder.push("guard"); return true; },
  thread => {
    ok(thread.messages.at(-1)?.content === "原子提交", "启动回调看到已同步追加的用户消息");
    commitOrder.push("start");
  },
);
ok(commitOrder.join(",") === "guard,start", "所有权复核、消息追加与启动按同步顺序提交");

const modeLoad = guardedStore._load.bind(guardedStore);
let allowModeLoad;
guardedStore._load = async () => {
  await new Promise(resolve => { allowModeLoad = resolve; });
  return modeLoad();
};
let modeOwned = true;
let modeRejected = false;
const delayedMode = guardedStore.setThreadMode(guardedThread.id, "assist", () => modeOwned);
while (!allowModeLoad) {
  await new Promise(resolve => setTimeout(resolve, 0));
}
modeOwned = false;
allowModeLoad();
try {
  await delayedMode;
} catch (e) {
  modeRejected = /mode update authorization lost/.test(String(e?.message || e));
}
guardedStore._load = modeLoad;
ok(modeRejected, "setThreadMode 在线性化点失权时失败关闭");
ok((await guardedStore.getThread(guardedThread.id)).mode === null, "setThreadMode 失权时不修改模式");

const workspaceLoad = guardedStore._load.bind(guardedStore);
let allowWorkspaceLoad;
guardedStore._load = async () => {
  await new Promise(resolve => { allowWorkspaceLoad = resolve; });
  return workspaceLoad();
};
let workspaceOwned = true;
let workspaceRejected = false;
const delayedWorkspace = guardedStore.setThreadWorkspace(
  guardedThread.id,
  "D:\\safe",
  () => workspaceOwned,
);
while (!allowWorkspaceLoad) {
  await new Promise(resolve => setTimeout(resolve, 0));
}
workspaceOwned = false;
allowWorkspaceLoad();
try {
  await delayedWorkspace;
} catch (e) {
  workspaceRejected = /workspace update authorization lost/.test(String(e?.message || e));
}
guardedStore._load = workspaceLoad;
ok(workspaceRejected, "setThreadWorkspace 在线性化点失权时失败关闭");
ok((await guardedStore.getThread(guardedThread.id)).workspace === null, "setThreadWorkspace 失权时不修改目录");

const saveFailureStore = new ConversationStore({ memoryOnly: true });
const saveFailureThread = await saveFailureStore.createThread(undefined, null, null, () => true);
const originalSave = saveFailureStore._save.bind(saveFailureStore);
const originalUpdatedAt = saveFailureThread.updatedAt;
saveFailureStore._save = async () => { throw new Error("save failed"); };
let modeSaveRejected = false;
try {
  await saveFailureStore.setThreadMode(saveFailureThread.id, "assist", () => true);
} catch (e) {
  modeSaveRejected = /save failed/.test(String(e?.message || e));
}
ok(modeSaveRejected, "setThreadMode 透传保存失败");
ok(saveFailureThread.mode === null, "setThreadMode 保存失败时回滚内存模式");
ok(saveFailureThread.updatedAt === originalUpdatedAt, "setThreadMode 保存失败时回滚更新时间");

let workspaceSaveRejected = false;
try {
  await saveFailureStore.setThreadWorkspace(saveFailureThread.id, "D:\\failed", () => true);
} catch (e) {
  workspaceSaveRejected = /save failed/.test(String(e?.message || e));
}
ok(workspaceSaveRejected, "setThreadWorkspace 透传保存失败");
ok(saveFailureThread.workspace === null, "setThreadWorkspace 保存失败时回滚内存目录");
ok(saveFailureThread.updatedAt === originalUpdatedAt, "setThreadWorkspace 保存失败时回滚更新时间");
saveFailureStore._save = originalSave;

await s.renameThread(t1.id, "RC4 入口分析");
ok((await s.getThread(t1.id)).title === "RC4 入口分析", "renameThread 生效");

let missingGuardRejected = false;
try {
  await s.deleteThread(t2.id);
} catch (e) {
  missingGuardRejected = /ownership guard/.test(String(e?.message || e));
}
ok(missingGuardRejected, "deleteThread 缺少所有权 guard 时失败关闭");
ok((await s.getThread(t2.id)) !== null, "缺少 guard 时保留原线程");

const originalLoad = s._load.bind(s);
let loadCompleted = false;
let guardRanAfterLoad = false;
s._load = async () => {
  const data = await originalLoad();
  loadCompleted = true;
  return data;
};
let lostGuardRejected = false;
try {
  await s.deleteThread(t2.id, () => {
    guardRanAfterLoad = loadCompleted;
    return false;
  });
} catch (e) {
  lostGuardRejected = /authorization lost/.test(String(e?.message || e));
}
s._load = originalLoad;
ok(guardRanAfterLoad, "deleteThread 在 load 后、变更列表前复核 guard");
ok(lostGuardRejected, "删除线性化前失权时失败关闭");
ok((await s.getThread(t2.id)) !== null, "删除线性化前失权时保留原线程");

await s.deleteThread(t2.id, () => true);
ok((await s.listThreads()).length === 1, "deleteThread 生效");

console.log(`\nConversationStore 自测：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
