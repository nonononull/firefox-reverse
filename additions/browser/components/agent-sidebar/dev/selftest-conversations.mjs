/* dev/selftest-conversations.mjs — ConversationStore（内存 backend）逻辑自测。
 *   node dev/selftest-conversations.mjs
 */
import { ConversationStore } from "../modules/ConversationStore.sys.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗ FAIL:", m)));

const s = new ConversationStore({ memoryOnly: true });

ok((await s.listThreads()).length === 0, "初始无线程");

const t1 = await s.createThread();
ok(t1.id && t1.title === "新对话" && t1.messages.length === 0, "createThread 返回空线程");
ok((await s.listThreads()).length === 1, "列表含 1 条");

await s.appendMessage(t1.id, { role: "user", content: "帮我分析 sign 加密入口在哪" });
const got = await s.getThread(t1.id);
ok(got.messages.length === 1 && got.messages[0].role === "user", "appendMessage 落入");
ok(got.title === "帮我分析 sign 加密入口在哪", "首条 user 消息自动成标题");

await s.appendMessage(t1.id, { role: "assistant", content: "..." });
ok((await s.getThread(t1.id)).messages.length === 2, "assistant 消息追加");

// 第二个线程 + 排序（updatedAt 倒序）
const t2 = await s.createThread();
await s.appendMessage(t2.id, { role: "user", content: "第二个对话" });
const list = await s.listThreads();
ok(list[0].id === t2.id, "最近更新的线程排在前");
ok(list.find(t => t.id === t1.id).count === 2, "摘要带消息计数");

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
