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

const initialization = section("// 初始化：", "// 多窗口隔离的**预留生命周期");
assert.match(initialization, /list\.find\([\s\S]*session\.isRunning/);
assert.ok(
  initialization.indexOf("session.isRunning") < initialization.indexOf("session.acquireThread"),
  "初始化必须在认领前排除运行中的 thread",
);
assert.doesNotMatch(initialization, /setBusy\(true\)/, "重挂载不得自动续看运行 thread");

const externalVisibility = section(
  "// ── 外部 / MCP 驱动可见性",
  "// 自动跟随最新回复",
);
assert.doesNotMatch(externalVisibility, /openThread(?:Ref\.current)?\s*\(/);
assert.doesNotMatch(externalVisibility, /setBusy\(true\)/);
assert.match(externalVisibility, /r\.id !== currentId \|\| !busy/);
assert.match(externalVisibility, /setExtRunning\(target\)/);

const send = section("async function send()", "// 「停止」按钮");
assert.match(send, /session\.isRunning\(currentId\)/);
assert.ok(
  send.indexOf("session.isRunning(currentId)") < send.indexOf("setMessages("),
  "发送必须在乐观写入前拒绝当前 external run",
);

const newChat = section("async function newChat()", "// 选模式：");
assert.match(newChat, /const got = session\.acquireThread\(\[t\.id\], ownerRef\.current\)/);
assert.match(newChat, /if \(got !== t\.id\)[\s\S]*return;/);
assert.ok(newChat.indexOf("return;") < newChat.indexOf("setCurrentId(t.id)"));

const openThread = section("async function openThread(id)", "async function deleteThread");
assert.match(openThread, /session\.isRunning\(id\)/);
assert.match(openThread, /id !== currentId \|\| !busy/);
assert.ok(openThread.indexOf("session.isRunning(id)") < openThread.indexOf("session.acquireThread"));

const externalBanner = section("{extRunning && (", "<div className=\"agent-ws\">");
assert.match(externalBanner, /onClick=\{\(\) => \{ setExtRunning\(null\); newChat\(\); \}\}/);
assert.match(externalBanner, /该任务在原窗口运行/);
assert.doesNotMatch(externalBanner, /openThread\s*\(/);

const history = section("{threads.map(t => (", '<button type="button" className="agent-history__del"');
assert.match(history, /onClick=\{\(\) => openThread\(t\.id\)\}/);

console.log("multi-window routing contract: PASS");
