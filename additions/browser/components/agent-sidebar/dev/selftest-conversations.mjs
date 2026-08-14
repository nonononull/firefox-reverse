/* dev/selftest-conversations.mjs — ConversationStore（内存 backend）逻辑自测。
 *   node dev/selftest-conversations.mjs
 */
import assert from "node:assert/strict";
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
  async exists() {
    return false;
  },
  async readJSON() {
    coldReadCount += 1;
    await coldReadGate;
    return { threads: [] };
  },
  async writeJSON() {},
  async remove() {},
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

// rollback save 失败后，恢复责任必须落到磁盘 sidecar；fresh Store 不得接受 provisional 主文件。
{
  const originalIOUtils = globalThis.IOUtils;
  const files = new Map();
  const writes = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  globalThis.IOUtils = {
    async exists(path) {
      return files.has(path);
    },
    async readJSON(path) {
      if (!files.has(path)) {
        throw new Error("file not found: " + path);
      }
      return clone(files.get(path));
    },
    async writeJSON(path, value) {
      writes.push({ path, value: clone(value) });
      files.set(path, clone(value));
    },
    async remove(path) {
      files.delete(path);
    },
  };
  try {
    const appendPath = "persistent-append-conversations.json";
    const appendStore = new ConversationStore({ memoryOnly: false, path: appendPath });
    const appendThread = await appendStore.createThread(undefined, null, null, () => true);
    const appendSave = appendStore._save.bind(appendStore);
    let appendOwned = true;
    let appendSaveCount = 0;
    writes.length = 0;
    appendStore._save = async () => {
      appendSaveCount += 1;
      if (appendSaveCount === 1) {
        await appendSave();
        appendOwned = false;
        return;
      }
      throw new Error("append canonical rollback unavailable");
    };
    await assert.rejects(
      appendStore.appendMessage(
        appendThread.id,
        { role: "user", content: "不得跨重载复活" },
        () => appendOwned,
        () => {},
      ),
      /append rollback save failed/,
    );
    ok(
      writes[0]?.path === appendPath + ".recovery" && writes[1]?.path === appendPath,
      "append 在 provisional canonical 前先持久化 recovery sidecar",
    );
    const freshAppendStore = new ConversationStore({ memoryOnly: false, path: appendPath });
    const recoveredAppend = await freshAppendStore.getThread(appendThread.id);
    ok(recoveredAppend?.messages.length === 0, "fresh Store 从 durable recovery 恢复未提交的 append");
    ok(!files.has(appendPath + ".recovery"), "append 恢复成功后清理 durable recovery sidecar");

    const deletePath = "persistent-delete-conversations.json";
    const deleteStore = new ConversationStore({ memoryOnly: false, path: deletePath });
    const deleteThread = await deleteStore.createThread(undefined, null, null, () => true);
    const deleteSave = deleteStore._save.bind(deleteStore);
    let deleteOwned = true;
    let deleteSaveCount = 0;
    writes.length = 0;
    deleteStore._save = async () => {
      deleteSaveCount += 1;
      if (deleteSaveCount === 1) {
        await deleteSave();
        deleteOwned = false;
        return;
      }
      throw new Error("delete canonical rollback unavailable");
    };
    await assert.rejects(
      deleteStore.deleteThread(deleteThread.id, () => deleteOwned),
      /deletion rollback save failed/,
    );
    ok(
      writes[0]?.path === deletePath + ".recovery" && writes[1]?.path === deletePath,
      "deletion 在 provisional canonical 前先持久化 recovery sidecar",
    );
    const freshDeleteStore = new ConversationStore({ memoryOnly: false, path: deletePath });
    const recoveredDelete = await freshDeleteStore.getThread(deleteThread.id);
    ok(recoveredDelete?.id === deleteThread.id, "fresh Store 从 durable recovery 恢复未提交的 deletion");
    ok(!files.has(deletePath + ".recovery"), "deletion 恢复成功后清理 durable recovery sidecar");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// guarded append 的 durable commit 必须先于 onCommit；清理失败后 fresh Store 仍保留已启动任务的消息。
{
  const originalIOUtils = globalThis.IOUtils;
  const files = new Map();
  const events = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const path = "committed-append-conversations.json";
  const recoveryPath = path + ".recovery";
  let failRecoveryRemove = true;
  globalThis.IOUtils = {
    async exists(candidate) {
      return files.has(candidate);
    },
    async readJSON(candidate) {
      if (!files.has(candidate)) {
        throw new Error("file not found: " + candidate);
      }
      return clone(files.get(candidate));
    },
    async writeJSON(candidate, value) {
      files.set(candidate, clone(value));
      events.push(candidate === recoveryPath ? `journal:${value.phase || "legacy"}` : "canonical");
    },
    async remove(candidate) {
      events.push("remove");
      if (candidate === recoveryPath && failRecoveryRemove) {
        failRecoveryRemove = false;
        throw new Error("committed journal cleanup unavailable");
      }
      files.delete(candidate);
    },
  };
  try {
    const store = new ConversationStore({ memoryOnly: false, path });
    const thread = await store.createThread();
    events.length = 0;
    await assert.rejects(
      store.appendMessage(
        thread.id,
        { role: "user", content: "已经启动的任务必须保留" },
        () => true,
        () => { events.push("onCommit"); },
      ),
      /committed journal cleanup unavailable/,
    );
    const committedWrite = events.indexOf("journal:committed");
    const onCommit = events.indexOf("onCommit");
    ok(committedWrite >= 0 && committedWrite < onCommit, "committed journal 在 onCommit 前持久化");
    const freshStore = new ConversationStore({ memoryOnly: false, path });
    const recovered = await freshStore.getThread(thread.id);
    ok(recovered?.messages.at(-1)?.content === "已经启动的任务必须保留", "清理失败后 fresh Store 保留已提交用户消息");
    ok(!files.has(recoveryPath), "fresh Store replay committed journal 后清理 sidecar");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// committed -> rollback journal 首次改写失败时，仍必须恢复内存、canonical 与 fresh Store。
{
  const originalIOUtils = globalThis.IOUtils;
  const clone = value => JSON.parse(JSON.stringify(value));
  async function exerciseRollbackJournalFailure(kind) {
    const files = new Map();
    const path = `rollback-journal-${kind}.json`;
    const recoveryPath = path + ".recovery";
    let owned = true;
    let injected = false;
    globalThis.IOUtils = {
      async exists(candidate) { return files.has(candidate); },
      async readJSON(candidate) {
        if (!files.has(candidate)) {
          throw new Error("file not found: " + candidate);
        }
        return clone(files.get(candidate));
      },
      async writeJSON(candidate, value) {
        if (candidate === recoveryPath && value.phase === "rollback" &&
            files.get(candidate)?.phase === "committed" && !injected) {
          injected = true;
          throw new Error(`${kind} rollback journal unavailable`);
        }
        files.set(candidate, clone(value));
        if (candidate === recoveryPath && value.phase === "committed") {
          owned = false;
        }
      },
      async remove(candidate) { files.delete(candidate); },
    };
    const store = new ConversationStore({ memoryOnly: false, path });
    const thread = await store.createThread(undefined, null, null, () => true);
    if (kind === "append") {
      await assert.rejects(
        store.appendMessage(
          thread.id,
          { role: "user", content: "不得保留的失权消息" },
          () => owned,
          () => {},
        ),
        /append authorization lost|append rollback journal failed/,
      );
      ok(injected, "append 注入 committed -> rollback journal 改写失败");
      ok(store._mem.threads[0].messages.length === 0, "append journal 改写失败后仍回滚内存消息");
      ok(files.get(path)?.threads[0]?.messages.length === 0, "append journal 改写失败后仍恢复 canonical");
      const fresh = new ConversationStore({ memoryOnly: false, path });
      ok((await fresh.getThread(thread.id))?.messages.length === 0, "append journal 改写失败后 fresh Store 不复活消息");
    } else {
      await assert.rejects(
        store.deleteThread(thread.id, () => owned),
        /deletion authorization lost|deletion rollback journal failed/,
      );
      ok(injected, "deletion 注入 committed -> rollback journal 改写失败");
      ok(store._mem.threads.some(candidate => candidate.id === thread.id), "deletion journal 改写失败后仍恢复内存 thread");
      ok(files.get(path)?.threads.some(candidate => candidate.id === thread.id), "deletion journal 改写失败后仍恢复 canonical");
      const fresh = new ConversationStore({ memoryOnly: false, path });
      ok((await fresh.getThread(thread.id))?.id === thread.id, "deletion journal 改写失败后 fresh Store 保留 thread");
    }
  }
  try {
    await exerciseRollbackJournalFailure("append");
    await exerciseRollbackJournalFailure("deletion");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// fresh Store replay 未完成前，读取和 mutation 都必须等待同一个 load Promise。
{
  const originalIOUtils = globalThis.IOUtils;
  const files = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const path = "replay-concurrency-conversations.json";
  const recoveryPath = path + ".recovery";
  const recovered = {
    threads: [{
      id: "replay-thread",
      title: "恢复前",
      createdAt: 1,
      updatedAt: 1,
      workspace: null,
      mode: null,
      envId: null,
      modelStrategy: "balanced",
      messages: [],
    }],
  };
  files.set(path, { threads: [] });
  files.set(recoveryPath, { schemaVersion: 1, snapshot: clone(recovered) });
  let canonicalWriteCount = 0;
  let signalReplayWrite;
  let releaseReplayWrite;
  const replayWriteStarted = new Promise(resolve => { signalReplayWrite = resolve; });
  const replayWriteGate = new Promise(resolve => { releaseReplayWrite = resolve; });
  globalThis.IOUtils = {
    async exists(candidate) {
      return files.has(candidate);
    },
    async readJSON(candidate) {
      if (!files.has(candidate)) {
        throw new Error("file not found: " + candidate);
      }
      return clone(files.get(candidate));
    },
    async writeJSON(candidate, value) {
      if (candidate === path) {
        canonicalWriteCount += 1;
        if (canonicalWriteCount === 1) {
          signalReplayWrite();
          await replayWriteGate;
        }
      }
      files.set(candidate, clone(value));
    },
    async remove(candidate) {
      files.delete(candidate);
    },
  };
  try {
    const store = new ConversationStore({ memoryOnly: false, path });
    const firstRead = store.getThread("replay-thread");
    await replayWriteStarted;
    let secondReadSettled = false;
    let mutationSettled = false;
    const secondRead = store.getThread("replay-thread").finally(() => { secondReadSettled = true; });
    const mutation = store.renameThread("replay-thread", "恢复后修改").finally(() => { mutationSettled = true; });
    await tick();
    ok(!secondReadSettled, "首次 recovery replay 完成前并发读取保持阻断");
    ok(!mutationSettled, "首次 recovery replay 完成前并发 mutation 保持阻断");
    releaseReplayWrite();
    await Promise.all([firstRead, secondRead, mutation]);
    ok(files.get(path)?.threads[0]?.title === "恢复后修改", "replay 完成后 mutation 不被迟到旧快照覆盖");
    ok(!files.has(recoveryPath), "replay 与后续 mutation 完成后清理 sidecar");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// 普通 mutation 尚未提交或回滚时，get/list 读取不得观察 provisional _mem。
{
  const store = new ConversationStore({ memoryOnly: true });
  const thread = await store.createThread(undefined, null, null, () => true);
  let signalSave;
  let releaseSave;
  const saveStarted = new Promise(resolve => { signalSave = resolve; });
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  store._save = async () => {
    signalSave();
    await saveGate;
    throw new Error("provisional mode save failed");
  };
  const mutation = store.setThreadMode(thread.id, "assist", () => true);
  await saveStarted;
  let getSettled = false;
  let listSettled = false;
  const pendingGet = store.getThread(thread.id).finally(() => { getSettled = true; });
  const pendingList = store.listThreads().finally(() => { listSettled = true; });
  await tick();
  ok(!getSettled, "mutation 保存完成前 getThread 保持阻断");
  ok(!listSettled, "mutation 保存完成前 listThreads 保持阻断");
  releaseSave();
  await assert.rejects(mutation, /provisional mode save failed/);
  const [readThread, readList] = await Promise.all([pendingGet, pendingList]);
  ok(readThread.mode === null, "失败 mutation 后 getThread 只看到回滚值");
  ok(readList[0]?.mode === null, "失败 mutation 后 listThreads 只看到回滚值");
}

// 首次 replay 失败后，第二次读取必须重试 canonical 恢复，不能因 _mem 已赋值而放行。
{
  const originalIOUtils = globalThis.IOUtils;
  const files = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const path = "replay-retry-conversations.json";
  const recoveryPath = path + ".recovery";
  const recovered = {
    threads: [{
      id: "retry-thread",
      title: "待重试",
      createdAt: 1,
      updatedAt: 1,
      workspace: null,
      mode: null,
      envId: null,
      modelStrategy: "balanced",
      messages: [],
    }],
  };
  files.set(path, { threads: [] });
  files.set(recoveryPath, { schemaVersion: 1, snapshot: clone(recovered) });
  let canonicalWriteCount = 0;
  globalThis.IOUtils = {
    async exists(candidate) {
      return files.has(candidate);
    },
    async readJSON(candidate) {
      if (!files.has(candidate)) {
        throw new Error("file not found: " + candidate);
      }
      return clone(files.get(candidate));
    },
    async writeJSON(candidate, value) {
      if (candidate === path && ++canonicalWriteCount === 1) {
        throw new Error("replay canonical unavailable");
      }
      files.set(candidate, clone(value));
    },
    async remove(candidate) {
      files.delete(candidate);
    },
  };
  try {
    const store = new ConversationStore({ memoryOnly: false, path });
    await assert.rejects(store.getThread("retry-thread"), /replay canonical unavailable/);
    ok(files.has(recoveryPath), "首次 replay 失败后保留 sidecar");
    ok((await store.getThread("retry-thread"))?.title === "待重试", "第二次读取重试并完成 recovery replay");
    ok(canonicalWriteCount === 2, "第二次读取实际重试 canonical 写入");
    ok(!files.has(recoveryPath), "重试成功后清理 sidecar");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// 可解析但线程结构损坏的 sidecar 必须失败关闭，不能覆盖 canonical。
{
  const originalIOUtils = globalThis.IOUtils;
  const files = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const path = "malformed-recovery-conversations.json";
  const canonical = { threads: [] };
  files.set(path, clone(canonical));
  files.set(path + ".recovery", { schemaVersion: 1, snapshot: { threads: [{}] } });
  globalThis.IOUtils = {
    async exists(candidate) {
      return files.has(candidate);
    },
    async readJSON(candidate) {
      return clone(files.get(candidate));
    },
    async writeJSON(candidate, value) {
      files.set(candidate, clone(value));
    },
    async remove(candidate) {
      files.delete(candidate);
    },
  };
  try {
    const store = new ConversationStore({ memoryOnly: false, path });
    await assert.rejects(store.listThreads(), /recovery snapshot is malformed/);
    ok(JSON.stringify(files.get(path)) === JSON.stringify(canonical), "畸形 sidecar 不覆盖 canonical");
    ok(files.has(path + ".recovery"), "畸形 sidecar 保留供人工恢复");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// 消息深层结构损坏的 sidecar 必须失败关闭，不能只验证 messages 顶层数组。
{
  const originalIOUtils = globalThis.IOUtils;
  const clone = value => JSON.parse(JSON.stringify(value));
  const malformedMessages = [
    [null],
    [{ role: "", content: "x" }],
    [{ role: 7, content: "x" }],
    [{ role: "user", content: null }],
    [{ role: "assistant", content: "x", steps: {} }],
    [{ role: "assistant", content: "x", steps: [null] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "tool", images: { length: 1 } }] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "tool", images: [{}] }] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "tool", name: {} }] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "tool", summary: {} }] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "tool", shot: {} }] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "text", text: {} }] }],
    [{ role: "assistant", content: "x", steps: [{ kind: "unknown", text: "x" }] }],
  ];
  const malformedThreadFields = [
    { workspace: {} },
    { mode: {} },
    { envId: {} },
    { modelStrategy: {} },
  ];
  try {
    for (let index = 0; index < malformedMessages.length; index += 1) {
      const files = new Map();
      const path = `malformed-message-${index}.json`;
      const canonical = { threads: [] };
      files.set(path, clone(canonical));
      files.set(path + ".recovery", {
        schemaVersion: 1,
        phase: "rollback",
        snapshot: {
          threads: [{
            id: `thread-${index}`,
            title: "损坏消息",
            createdAt: 1,
            updatedAt: 1,
            messages: malformedMessages[index],
          }],
        },
      });
      globalThis.IOUtils = {
        async exists(candidate) { return files.has(candidate); },
        async readJSON(candidate) { return clone(files.get(candidate)); },
        async writeJSON(candidate, value) { files.set(candidate, clone(value)); },
        async remove(candidate) { files.delete(candidate); },
      };
      const store = new ConversationStore({ memoryOnly: false, path });
      await assert.rejects(store.listThreads(), /recovery snapshot is malformed/);
      ok(JSON.stringify(files.get(path)) === JSON.stringify(canonical), `畸形消息 ${index + 1} 不覆盖 canonical`);
      ok(files.has(path + ".recovery"), `畸形消息 ${index + 1} 保留 recovery sidecar`);
    }
    for (let index = 0; index < malformedThreadFields.length; index += 1) {
      const files = new Map();
      const path = `malformed-thread-field-${index}.json`;
      const canonical = { threads: [] };
      files.set(path, clone(canonical));
      files.set(path + ".recovery", {
        schemaVersion: 1,
        phase: "rollback",
        snapshot: {
          threads: [{
            id: `thread-field-${index}`,
            title: "损坏字段",
            createdAt: 1,
            updatedAt: 1,
            messages: [],
            ...malformedThreadFields[index],
          }],
        },
      });
      globalThis.IOUtils = {
        async exists(candidate) { return files.has(candidate); },
        async readJSON(candidate) { return clone(files.get(candidate)); },
        async writeJSON(candidate, value) { files.set(candidate, clone(value)); },
        async remove(candidate) { files.delete(candidate); },
      };
      const store = new ConversationStore({ memoryOnly: false, path });
      await assert.rejects(store.listThreads(), /recovery snapshot is malformed/);
      ok(JSON.stringify(files.get(path)) === JSON.stringify(canonical), `畸形 thread 字段 ${index + 1} 不覆盖 canonical`);
      ok(files.has(path + ".recovery"), `畸形 thread 字段 ${index + 1} 保留 recovery sidecar`);
    }
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
  }
}

// deletion 的 committed sidecar 清理期间失权时仍必须回滚，不能把已失权删除当作成功。
{
  const originalIOUtils = globalThis.IOUtils;
  const files = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const path = "delete-cleanup-race-conversations.json";
  const recoveryPath = path + ".recovery";
  let releaseCleanup;
  let signalCleanup;
  let cleanupCount = 0;
  const cleanupStarted = new Promise(resolve => { signalCleanup = resolve; });
  const cleanupGate = new Promise(resolve => { releaseCleanup = resolve; });
  globalThis.IOUtils = {
    async exists(candidate) { return files.has(candidate); },
    async readJSON(candidate) {
      if (!files.has(candidate)) {
        throw new Error("file not found: " + candidate);
      }
      return clone(files.get(candidate));
    },
    async writeJSON(candidate, value) { files.set(candidate, clone(value)); },
    async remove(candidate) {
      if (candidate === recoveryPath && cleanupCount++ === 0) {
        signalCleanup();
        await cleanupGate;
      }
      files.delete(candidate);
    },
  };
  try {
    const store = new ConversationStore({ memoryOnly: false, path });
    const thread = await store.createThread(undefined, null, null, () => true);
    let owned = true;
    const deleting = store.deleteThread(thread.id, () => owned);
    await cleanupStarted;
    owned = false;
    releaseCleanup();
    await assert.rejects(deleting, /deletion authorization lost/);
    ok((await store.getThread(thread.id))?.id === thread.id, "sidecar 清理期间失权后恢复被删 thread");
    ok(files.get(path)?.threads.some(candidate => candidate.id === thread.id), "sidecar 清理期间失权后恢复 canonical");
  } finally {
    if (originalIOUtils === undefined) {
      delete globalThis.IOUtils;
    } else {
      globalThis.IOUtils = originalIOUtils;
    }
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
  if (deleteRollbackSaveCount === 3 || deleteRollbackSaveCount === 4) {
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
let deleteRecoveryReadBlocked = false;
try {
  await deleteRollbackStore.getThread(deleteRollbackThread.id);
} catch (e) {
  deleteRecoveryReadBlocked = /delete recovery unavailable/.test(String(e?.message || e));
}
ok(deleteRecoveryReadBlocked, "删除恢复完成前读取也保持失败关闭");
ok(deleteRollbackStore._mem.threads.some(thread => thread.id === deleteRollbackThread.id), "删除回滚失败后内存保留原线程");
let deleteRecoveryBlocked = false;
try {
  await deleteRollbackStore.renameThread(deleteRollbackThread.id, "不得提前修改");
} catch (e) {
  deleteRecoveryBlocked = /delete recovery unavailable/.test(String(e?.message || e));
}
ok(deleteRecoveryBlocked, "删除恢复快照仍无法保存时阻断后续 mutation");
ok(deleteRollbackThread.title === "新对话", "删除恢复完成前不得修改 thread");
ok(
  deleteRollbackSnapshots[3]?.threads[0]?.title === "新对话",
  "删除恢复写必须发生在后续 mutation 修改内存之前",
);
await deleteRollbackStore.renameThread(deleteRollbackThread.id, "恢复后允许修改");
ok(deleteRollbackThread.title === "恢复后允许修改", "删除恢复成功后才允许后续 mutation");

await s.deleteThread(t2.id, () => true);
ok((await s.listThreads()).length === 1, "deleteThread 生效");

console.log(`\nConversationStore 自测：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
