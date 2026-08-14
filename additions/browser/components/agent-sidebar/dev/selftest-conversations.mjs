/* dev/selftest-conversations.mjs — ConversationStore（内存 backend）逻辑自测。
 *   node dev/selftest-conversations.mjs
 */
import { ConversationStore } from "../modules/ConversationStore.sys.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗ FAIL:", m)));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

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

// frx-director-mcp 的既有 chromeScripts 使用旧签名，不传 UI ownership guard。
const directorStore = new ConversationStore({ memoryOnly: true });
const directorThread = await directorStore.createThread("MCP 任务", "D:\\mcp", "assist");
await directorStore.setThreadWorkspace(directorThread.id, "D:\\director");
await directorStore.setThreadMode(directorThread.id, "auto");
await directorStore.appendMessage(directorThread.id, { role: "user", content: "外部 director 指令" });
const directorResult = await directorStore.getThread(directorThread.id);
ok(directorResult?.workspace === "D:\\director", "director 旧签名可更新工作目录");
ok(directorResult?.mode === "auto", "director 旧签名可更新模式");
ok(directorResult?.messages.at(-1)?.content === "外部 director 指令", "director 旧签名可追加 user 消息");

// 首次持久化加载只能发布一个共享 Promise；两个窗口不能用迟到读取互相覆盖 _mem。
const previousIOUtils = globalThis.IOUtils;
let releaseColdRead;
const coldReadGate = new Promise(resolve => { releaseColdRead = resolve; });
let coldReadCount = 0;
globalThis.IOUtils = {
  async readJSON() {
    coldReadCount += 1;
    await coldReadGate;
    return { threads: [] };
  },
  async writeJSON() {},
};
try {
  const coldStore = new ConversationStore({ memoryOnly: false, path: "cold-conversations.json" });
  const coldList = coldStore.listThreads();
  const coldA = coldStore.createThread("A", null, null, () => true);
  const coldB = coldStore.createThread("B", null, null, () => true);
  while (coldReadCount === 0) {
    await tick();
  }
  await tick();
  releaseColdRead();
  const [, threadA, threadB] = await Promise.all([coldList, coldA, coldB]);
  const coldIds = new Set((await coldStore.listThreads()).map(thread => thread.id));
  ok(coldReadCount === 1, "冷启动并发只读取一次持久化快照");
  ok(coldIds.has(threadA.id) && coldIds.has(threadB.id), "冷启动并发创建的两条 thread 均保留");
} finally {
  if (previousIOUtils === undefined) {
    delete globalThis.IOUtils;
  } else {
    globalThis.IOUtils = previousIOUtils;
  }
}

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
ok(commitOrder.join(",") === "guard,guard,start", "持久化前后复核所有权，最终复核与启动同步相邻");

const finalGuardStore = new ConversationStore({ memoryOnly: true });
const finalGuardThread = await finalGuardStore.createThread(undefined, null, null, () => true);
let releaseFinalSave;
let signalFinalSave;
const finalSaveStarted = new Promise(resolve => { signalFinalSave = resolve; });
const finalSaveGate = new Promise(resolve => { releaseFinalSave = resolve; });
let finalSaveCount = 0;
const finalSaveSnapshots = [];
finalGuardStore._save = async () => {
  finalSaveCount += 1;
  finalSaveSnapshots.push(JSON.parse(JSON.stringify(finalGuardStore._mem)));
  if (finalSaveCount === 1) {
    signalFinalSave();
    await finalSaveGate;
  }
};
let finalAppendOwned = true;
let finalStartCount = 0;
const finalGuardAppend = finalGuardStore.appendMessage(
  finalGuardThread.id,
  { role: "user", content: "保存期间不得迟到启动" },
  () => finalAppendOwned,
  () => { finalStartCount += 1; },
);
await finalSaveStarted;
finalAppendOwned = false;
releaseFinalSave();
let finalGuardRejected = false;
try {
  await finalGuardAppend;
} catch (e) {
  finalGuardRejected = /append authorization lost/.test(String(e?.message || e));
}
ok(finalGuardRejected, "appendMessage 持久化后在线性化点失权时失败关闭");
ok(finalStartCount === 0, "appendMessage 持久化期间失权不得启动任务");
ok(finalSaveCount === 2, "appendMessage 最终失权后持久化回滚快照");
ok(finalSaveSnapshots.at(-1)?.threads[0]?.messages.length === 0, "最终失权的用户消息不留在持久化快照");
ok((await finalGuardStore.getThread(finalGuardThread.id)).messages.length === 0, "最终失权的用户消息不留在内存");

const rollbackFailureStore = new ConversationStore({ memoryOnly: true });
const rollbackFailureThread = await rollbackFailureStore.createThread(undefined, null, null, () => true);
let rollbackOwned = true;
let rollbackSaveCount = 0;
const rollbackSnapshots = [];
rollbackFailureStore._save = async () => {
  rollbackSaveCount += 1;
  rollbackSnapshots.push(JSON.parse(JSON.stringify(rollbackFailureStore._mem)));
  if (rollbackSaveCount === 1) {
    rollbackOwned = false;
    return;
  }
  if (rollbackSaveCount === 2) {
    throw new Error("rollback save failed");
  }
  if (rollbackSaveCount === 3) {
    throw new Error("recovery save unavailable");
  }
};
let rollbackFailureRejected = false;
try {
  await rollbackFailureStore.appendMessage(
    rollbackFailureThread.id,
    { role: "user", content: "回滚失败也不能夹带" },
    () => rollbackOwned,
    () => {},
  );
} catch (e) {
  rollbackFailureRejected = /append rollback save failed/.test(String(e?.message || e));
}
ok(rollbackFailureRejected, "appendMessage 回滚二次保存失败时显式进入恢复态");
ok(rollbackFailureThread.messages.length === 0, "回滚二次保存失败后内存仍保持无消息状态");
let blockedByRecovery = false;
try {
  await rollbackFailureStore.setThreadWorkspace(rollbackFailureThread.id, "D:\\blocked");
} catch (e) {
  blockedByRecovery = /recovery save unavailable/.test(String(e?.message || e));
}
ok(blockedByRecovery, "恢复快照仍无法保存时阻断后续 mutation");
ok(rollbackFailureThread.workspace === null, "恢复完成前不得修改 thread");
ok(
  rollbackSnapshots[2]?.threads[0]?.workspace === null,
  "恢复写必须发生在后续 mutation 修改内存之前",
);
await rollbackFailureStore.setThreadWorkspace(rollbackFailureThread.id, "D:\\recovered");
ok(rollbackFailureThread.workspace === "D:\\recovered", "恢复快照保存成功后才允许后续 mutation");
ok(rollbackSnapshots[3]?.threads[0]?.messages.length === 0, "恢复保存先清除磁盘中的未运行消息");

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

// user append 必须先持久化成功再启动；保存失败时不得执行 onCommit，也不得污染后续快照。
const appendFailureStore = new ConversationStore({ memoryOnly: true });
const appendFailureThread = await appendFailureStore.createThread(undefined, null, null, () => true);
const appendOriginalUpdatedAt = appendFailureThread.updatedAt;
let appendStarted = 0;
let appendSaveCount = 0;
const appendSuccessfulSnapshots = [];
appendFailureStore._save = async () => {
  appendSaveCount += 1;
  if (appendSaveCount === 1) {
    throw new Error("user append save failed");
  }
  appendSuccessfulSnapshots.push(JSON.parse(JSON.stringify(appendFailureStore._mem)));
};
let appendSaveRejected = false;
try {
  await appendFailureStore.appendMessage(
    appendFailureThread.id,
    { role: "user", content: "不得夹带的失败消息" },
    () => true,
    () => { appendStarted += 1; },
  );
} catch (e) {
  appendSaveRejected = /user append save failed/.test(String(e?.message || e));
}
ok(appendSaveRejected, "appendMessage 透传启动前的保存失败");
ok(appendStarted === 0, "appendMessage 保存失败时不得启动任务");
ok(appendFailureThread.messages.length === 0, "appendMessage 保存失败时回滚本次内存消息");
ok(appendFailureThread.title === "新对话", "appendMessage 保存失败时回滚自动标题");
ok(appendFailureThread.updatedAt === appendOriginalUpdatedAt, "appendMessage 保存失败时回滚更新时间");
await appendFailureStore.setThreadWorkspace(appendFailureThread.id, "D:\\after-failure");
ok(
  appendSuccessfulSnapshots.at(-1)?.threads[0]?.messages.length === 0,
  "后续成功持久化快照不夹带失败 user 消息",
);

// mode/workspace 必须串行修改并保存；前一项失败后，后一项不能把失败值夹带写入。
const interleavedStore = new ConversationStore({ memoryOnly: true });
const interleavedThread = await interleavedStore.createThread(undefined, null, null, () => true);
let releaseFirstSave;
let signalFirstSave;
const firstSaveStarted = new Promise(resolve => { signalFirstSave = resolve; });
const firstSaveGate = new Promise(resolve => { releaseFirstSave = resolve; });
let interleavedSaveCount = 0;
const successfulSnapshots = [];
interleavedStore._save = async () => {
  interleavedSaveCount += 1;
  if (interleavedSaveCount === 1) {
    signalFirstSave();
    await firstSaveGate;
    throw new Error("mode save failed");
  }
  successfulSnapshots.push(JSON.parse(JSON.stringify(interleavedStore._mem)));
};
const failedModeSave = interleavedStore.setThreadMode(interleavedThread.id, "assist", () => true);
await firstSaveStarted;
const successfulWorkspaceSave = interleavedStore.setThreadWorkspace(
  interleavedThread.id,
  "D:\\serialized",
  () => true,
);
await tick();
releaseFirstSave();
const [modeResult, workspaceResult] = await Promise.allSettled([failedModeSave, successfulWorkspaceSave]);
const interleavedResult = await interleavedStore.getThread(interleavedThread.id);
ok(modeResult.status === "rejected", "并发 mode 保存失败向调用方透传");
ok(workspaceResult.status === "fulfilled", "后续 workspace 保存仍可成功");
ok(interleavedResult.mode === null, "后续保存不保留失败的 mode 修改");
ok(interleavedResult.workspace === "D:\\serialized", "后续保存保留自己的 workspace 修改");
ok(successfulSnapshots.at(-1)?.threads[0]?.mode === null, "成功持久化快照不夹带失败 mode");

// environment/model/title 保存失败也必须回滚内存，后续成功保存不得夹带失败值。
const metadataFailureCases = [
  {
    label: "setThreadEnvironment",
    property: "envId",
    mutate: (store, thread) => store.setThreadEnvironment(thread.id, "env-failed"),
  },
  {
    label: "setThreadModelStrategy",
    property: "modelStrategy",
    mutate: (store, thread) => store.setThreadModelStrategy(thread.id, "premium"),
  },
  {
    label: "renameThread",
    property: "title",
    mutate: (store, thread) => store.renameThread(thread.id, "不得夹带的失败标题"),
  },
];
for (const testCase of metadataFailureCases) {
  const store = new ConversationStore({ memoryOnly: true });
  const thread = await store.createThread(undefined, null, null, () => true);
  const originalValue = thread[testCase.property];
  const originalMutationUpdatedAt = thread.updatedAt;
  const snapshots = [];
  let saveCount = 0;
  store._save = async () => {
    saveCount += 1;
    if (saveCount === 1) {
      throw new Error(`${testCase.label} save failed`);
    }
    snapshots.push(JSON.parse(JSON.stringify(store._mem)));
  };
  let rejected = false;
  try {
    await testCase.mutate(store, thread);
  } catch (e) {
    rejected = new RegExp(`${testCase.label} save failed`).test(String(e?.message || e));
  }
  ok(rejected, `${testCase.label} 透传保存失败`);
  ok(thread[testCase.property] === originalValue, `${testCase.label} 保存失败时回滚内存值`);
  ok(thread.updatedAt === originalMutationUpdatedAt, `${testCase.label} 保存失败时回滚更新时间`);
  await store.setThreadWorkspace(thread.id, `D:\\after-${testCase.property}-failure`);
  ok(
    snapshots.at(-1)?.threads[0]?.[testCase.property] === originalValue,
    `${testCase.label} 后续成功快照不夹带失败值`,
  );
}

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

const deleteRollbackStore = new ConversationStore({ memoryOnly: true });
const deleteRollbackThread = await deleteRollbackStore.createThread(undefined, null, null, () => true);
let deleteOwned = true;
let deleteRollbackSaveCount = 0;
const deleteRollbackSnapshots = [];
deleteRollbackStore._save = async () => {
  deleteRollbackSaveCount += 1;
  deleteRollbackSnapshots.push(JSON.parse(JSON.stringify(deleteRollbackStore._mem)));
  if (deleteRollbackSaveCount === 1) {
    deleteOwned = false;
    return;
  }
  if (deleteRollbackSaveCount === 2) {
    throw new Error("delete rollback save failed");
  }
  if (deleteRollbackSaveCount === 3) {
    throw new Error("delete recovery unavailable");
  }
};
let deleteRollbackRejected = false;
try {
  await deleteRollbackStore.deleteThread(deleteRollbackThread.id, () => deleteOwned);
} catch (e) {
  deleteRollbackRejected = /deletion rollback save failed/.test(String(e?.message || e));
}
ok(deleteRollbackRejected, "deleteThread 回滚二次保存失败时显式进入恢复态");
ok((await deleteRollbackStore.getThread(deleteRollbackThread.id)) !== null, "删除回滚失败后内存保留原线程");
let deleteRecoveryBlocked = false;
try {
  await deleteRollbackStore.renameThread(deleteRollbackThread.id, "不得提前修改");
} catch (e) {
  deleteRecoveryBlocked = /delete recovery unavailable/.test(String(e?.message || e));
}
ok(deleteRecoveryBlocked, "删除恢复快照仍无法保存时阻断后续 mutation");
ok(deleteRollbackThread.title === "新对话", "删除恢复完成前不得修改 thread");
ok(
  deleteRollbackSnapshots[2]?.threads[0]?.title === "新对话",
  "删除恢复写必须发生在后续 mutation 修改内存之前",
);
await deleteRollbackStore.renameThread(deleteRollbackThread.id, "恢复后允许修改");
ok(deleteRollbackThread.title === "恢复后允许修改", "删除恢复成功后才允许后续 mutation");

await s.deleteThread(t2.id, () => true);
ok((await s.listThreads()).length === 1, "deleteThread 生效");

console.log(`\nConversationStore 自测：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
