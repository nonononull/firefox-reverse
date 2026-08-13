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

function sourceFunction(name, prefix = "async function") {
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
      return Function(`${declaration}; return ${name};`)();
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

const createOwnedThread = sourceFunction("createOwnedThread");
assert.equal(
  (source.match(/conversations\.createThread\s*\(/g) || []).length,
  1,
  "AgentPanel 的所有新建路径必须统一经过 createOwnedThread",
);

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
      return ids[0] === "new-1" ? null : ids[0];
    },
  };
  const thread = await createOwnedThread(conversations, session, "window-a");
  assert.equal(thread.id, "new-2", "首个新 thread 被抢后必须有界创建并认领第二个");
  assert.deepEqual(acquired, ["new-1", "new-2"]);
  assert.equal(deleteCount, 0, "被其它窗口认领的空 thread 不得由创建者删除");
}

const renewOwnedThread = sourceFunction("renewOwnedThread", "function");
{
  let lost = 0;
  assert.equal(
    renewOwnedThread({ renewThread: () => true }, "owned", "window-a", () => { lost += 1; }),
    true,
  );
  assert.equal(lost, 0);
  assert.equal(
    renewOwnedThread({}, "legacy", "window-a", () => { lost += 1; }),
    true,
    "缺少可选 renewThread 时保持旧版兼容",
  );
  assert.equal(lost, 0);
  assert.equal(
    renewOwnedThread({ renewThread: () => false }, "lost", "window-a", () => { lost += 1; }),
    false,
  );
  assert.equal(lost, 1, "renewThread=false 必须立即报告失权");
  assert.equal(
    renewOwnedThread({ renewThread: () => { throw new Error("broken"); } }, "broken", "window-a", () => { lost += 1; }),
    false,
  );
  assert.equal(lost, 2, "renewThread 异常也必须失败关闭");
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
  const session = { acquireThread: () => null };
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
assert.match(reservationLifecycle, /selectionRef\.current\.id\s*!==\s*currentId/);
assert.match(reservationLifecycle, /setCurrentId\(current\s*=>\s*current\s*===\s*currentId\s*\?\s*null\s*:\s*current\)/);
assert.match(reservationLifecycle, /setError\("当前会话的窗口预留已失效/);

const initialization = section("// 初始化：载入线程列表", "// 续看：mount/切线程");
assert.match(initialization, /acquired\s*===\s*latest\s*\?\s*latest\s*:\s*null/);
const openThread = section("async function openThread", "async function deleteThread");
assert.match(openThread, /got\s*!==\s*id/);

console.log("multi-window routing contract: PASS");
