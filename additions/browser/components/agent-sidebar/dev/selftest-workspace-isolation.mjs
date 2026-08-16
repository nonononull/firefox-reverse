/* selftest-workspace-isolation.mjs - 多窗口会话的工作目录与页面上下文交错回归。
 * 纯 Node + 内存 IO，不启动 Firefox：A 捕获 ctx 后，B 改写共享 fallback，再恢复 A。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(here, "..", "modules");
const panelSource = fs.readFileSync(path.join(here, "..", "content", "AgentPanel.jsx"), "utf8");
const agentSessionSource = fs.readFileSync(path.join(modulesDir, "AgentSession.sys.mjs"), "utf8");
const jsvmpSource = fs.readFileSync(path.join(modulesDir, "JsvmpBackend.sys.mjs"), "utf8");

let pass = 0;
let fail = 0;
function check(condition, message, detail = "") {
  if (condition) {
    pass++;
    console.log("  PASS " + message);
    return;
  }
  fail++;
  console.error("  FAIL " + message + (detail ? `: ${detail}` : ""));
}

const rootA = "/workspace-A";
const rootB = "/workspace-B";
const urlA = "https://a.example/assets/a.js";
const urlB = "https://b.example/assets/b.js";
const winA = {
  closed: false,
  gBrowser: { selectedBrowser: { currentURI: { host: "a.example" } } },
};
const winB = {
  closed: false,
  gBrowser: { selectedBrowser: { currentURI: { host: "b.example" } } },
};
const ctxA = Object.freeze({ workspaceRoot: rootA, win: winA, signal: null });

let fallbackWin = winB;
const textFiles = new Map([
  [
    path.posix.join(rootA, ".frx-notes.ndjson"),
    JSON.stringify({ date: "2026-08-16", site: "a.example", kind: "note", note: "A_ONLY", status: "verified" }) + "\n",
  ],
  [
    path.posix.join(rootB, ".frx-notes.ndjson"),
    JSON.stringify({ date: "2026-08-16", site: "b.example", kind: "note", note: "B_ONLY", status: "verified" }) + "\n",
  ],
]);
const writes = [];
const copies = [];

globalThis.Services = {
  appinfo: { OS: "Linux" },
  env: { get: () => "" },
  obs: { addObserver() {} },
  prefs: {
    getStringPref: () => "",
    setStringPref() {},
    clearUserPref() {},
    getBoolPref: () => false,
    setBoolPref() {},
    getIntPref: () => 0,
    setIntPref() {},
  },
  wm: { getMostRecentWindow: () => fallbackWin },
};
globalThis.ChromeUtils = {
  importESModule(spec) {
    if (spec.includes("Timer.sys.mjs")) {
      return { setTimeout, clearTimeout };
    }
    return {};
  },
};
globalThis.PathUtils = {
  profileDir: "/profile",
  tempDir: "/tmp",
  join: (...parts) => path.posix.join(...parts.map(String)),
  filename: p => path.posix.basename(String(p)),
  parent: p => path.posix.dirname(String(p)),
  isAbsolute: p => path.posix.isAbsolute(String(p || "")),
};
globalThis.IOUtils = {
  async makeDirectory() {},
  async getChildren() {
    return [];
  },
  async exists(p) {
    return textFiles.has(p);
  },
  async readUTF8(p) {
    if (!textFiles.has(p)) {
      throw new Error("ENOENT " + p);
    }
    return textFiles.get(p);
  },
  async writeUTF8(p, value) {
    textFiles.set(p, String(value));
    writes.push(p);
  },
  async write(p, value) {
    textFiles.set(p, value);
    writes.push(p);
  },
  async stat(p) {
    if (!textFiles.has(p)) {
      throw new Error("ENOENT " + p);
    }
    const value = textFiles.get(p);
    return { type: "file", size: typeof value === "string" ? value.length : value.byteLength, lastModified: 1 };
  },
  async copy(src, dest) {
    textFiles.set(dest, textFiles.get(src));
    copies.push({ src, dest });
  },
};
globalThis.Cc = {};
globalThis.Ci = {};
globalThis.Components = { isSuccessCode: () => true };
globalThis.fetch = async url => ({
  status: 200,
  headers: { get: () => "application/javascript" },
  async text() {
    return `console.log(${JSON.stringify(url)});`;
  },
});

const { WorkspaceBackend } = await import("../modules/WorkspaceBackend.sys.mjs");
const { CodeBackend } = await import("../modules/CodeBackend.sys.mjs");
const { NotesBackend } = await import("../modules/NotesBackend.sys.mjs");
const { ScriptsBackend } = await import("../modules/ScriptsBackend.sys.mjs");
const { JsvmpBackend } = await import("../modules/JsvmpBackend.sys.mjs");
const { getBackends } = await import("../modules/Backends.sys.mjs");

console.log("[1] A 捕获 ctx 后，B 改写全局 root；直接文件/执行工具仍固定到 A");
const workspace = new WorkspaceBackend();
workspace.setRoot(rootB);
check(workspace._resolve("bound.txt", ctxA) === path.posix.join(rootA, "bound.txt"), "显式 A ctx 不受 B fallback 影响");
workspace._resolveExe = async () => "/bin/node";
workspace._spawn = async (_exe, _argv, opts) => ({
  exitCode: 0,
  timedOut: false,
  aborted: false,
  capped: false,
  output: "",
  observedRoot: opts.root,
});
const run = await workspace.runNode({ code: "1" }, ctxA);
check(run.cwd === rootA, "run_node cwd 固定为 A", `got ${run.cwd}`);
let explicitNullRejected = false;
try {
  workspace._resolve("must-not-fallback.txt", { workspaceRoot: null, win: winA });
} catch {
  explicitNullRejected = true;
}
check(explicitNullRejected, "显式 workspaceRoot:null 失败关闭，不落到 B");
check(workspace._resolve("legacy.txt") === path.posix.join(rootB, "legacy.txt"), "完全省略 ctx 的旧直驱 fallback 保持兼容");

globalThis.__issue6CallToolDispatch = async (_name, args, ctx) => {
  try {
    return { ok: true, data: { ctx, resolved: workspace._resolve(args.path, ctx) } };
  } catch (error) {
    return { ok: false, error: String(error && error.message), data: { ctx } };
  }
};
const agentSessionHarness = `
const runAgentTurn = async () => ({});
class ToolRouter {
  registerAll() {}
  listSpecs() { return []; }
  async dispatch(name, args, ctx) { return globalThis.__issue6CallToolDispatch(name, args, ctx); }
}
const createBuiltinTools = () => [];
const getBackends = () => ({});
const configStore = {};
const buildClientFromStore = () => ({});
const isVisionModel = () => false;
const conversationStore = {};
${agentSessionSource.replace(/^import .*;\r?\n/gm, "")}
`;
const { agentSession } = await import(`data:text/javascript;base64,${Buffer.from(agentSessionHarness).toString("base64")}`);
const legacyRaw = await agentSession.callTool("fs_read", { path: "legacy-raw.txt" });
check(
  legacyRaw.ok &&
    legacyRaw.data.resolved === path.posix.join(rootB, "legacy-raw.txt") &&
    !Object.prototype.hasOwnProperty.call(legacyRaw.data.ctx, "workspaceRoot"),
  "raw callTool 省略 workspaceRoot 时保留旧 fallback",
  JSON.stringify(legacyRaw)
);
const explicitNullRaw = await agentSession.callTool("fs_read", { path: "must-not-fallback.txt" }, { workspaceRoot: null });
check(
  !explicitNullRaw.ok &&
    Object.prototype.hasOwnProperty.call(explicitNullRaw.data.ctx, "workspaceRoot") &&
    explicitNullRaw.data.ctx.workspaceRoot === null,
  "raw callTool 显式 workspaceRoot:null 时继续失败关闭",
  JSON.stringify(explicitNullRaw)
);

const code = new CodeBackend({ workspace });
check(code._wsRoot(ctxA) === rootA, "code_search 显式 A ctx 使用 A");
check(code._wsRoot({ workspaceRoot: null, win: winA }) === null, "code_search 显式未绑定不回退 B");
check(code._wsRoot() === rootB, "code_search 完全省略 ctx 时保留全局 fallback");

console.log("[2] 发送前 notes 与 session.run 复用同一个冻结 ctx");
const sendStart = panelSource.indexOf("async function send()");
const sendEnd = panelSource.indexOf("// 「停止」按钮", sendStart);
const sendSource = panelSource.slice(sendStart, sendEnd);
function runCtxPrecedesEnsureThread(source) {
  const runCtxAt = source.indexOf("const runCtx = Object.freeze");
  const ensureThreadAwaitAt = source.indexOf("await ensureThread()");
  return runCtxAt >= 0 && ensureThreadAwaitAt >= 0 && runCtxAt < ensureThreadAwaitAt;
}
check(runCtxPrecedesEnsureThread(sendSource), "发送段在首个 ensureThread await 前冻结 runCtx");
const runCtxBlock = sendSource.match(/    const runCtx = Object\.freeze\(\{[\s\S]*?^    \}\);\r?\n/m)?.[0] || "";
const lateRunCtxMutation = sendSource
  .replace(runCtxBlock, "")
  .replace("const tid = await ensureThread();", `const tid = await ensureThread();\n${runCtxBlock}`);
check(runCtxBlock && !runCtxPrecedesEnsureThread(lateRunCtxMutation), "顺序断言杀死 await 后冻结 runCtx 的 mutation");
check(/notes\.digest\(\{\}, runCtx\)/.test(sendSource), "notes.digest 使用 runCtx");
check(/session\.run\([\s\S]*\.\.\.runCtx/.test(sendSource), "session.run 复用 runCtx");

const notes = new NotesBackend({ workspace });
const boundDigest = await notes.digest({}, ctxA);
const legacyDigest = await notes.digest({});
check(boundDigest.includes("A_ONLY") && !boundDigest.includes("B_ONLY"), "显式 ctx 的 notes 只读 A");
check(legacyDigest.includes("B_ONLY"), "省略 ctx 的 notes 对照确实会读当前 B fallback");

console.log("[3] find_param_entry 等待 network，并把同一个 ctx 传给两个子后端");
const backends = getBackends();
let findNetCtx = Symbol("not-called");
let findCodeCtx = Symbol("not-called");
backends.net.list = async (_args, ctx) => {
  findNetCtx = ctx;
  return { requests: [{ id: "req-A", method: "GET", status: 200, url: "https://a.example/?sign=1" }] };
};
backends.code.search = async (_args, ctx) => {
  findCodeCtx = ctx;
  return { hits: [{ file: "A/sign.js", line: 1, text: "sign" }] };
};
const found = await backends.find.paramEntry({ param: "sign" }, ctxA);
check(!found.netError && found.requests.length === 1, "find 正确等待异步 network list", found.netError || "no requests");
check(findNetCtx === ctxA, "find 的 network 子调用收到 ctxA");
check(findCodeCtx === ctxA, "find 的 code 子调用收到 ctxA");

console.log("[4] scripts 的页面来源与工作目录目标都固定到 A");
const pageCtxs = [];
const page = {
  async eval(_args, ctx) {
    pageCtxs.push(ctx);
    const win = ctx && ctx.win ? ctx.win : fallbackWin;
    return { value: [win === winA ? urlA : urlB] };
  },
};
const scripts = new ScriptsBackend({ page, workspace });
const listed = await scripts.list({}, ctxA);
check(listed.urls.length === 1 && listed.urls[0] === urlA, "scripts_list 只枚举 A 窗口", JSON.stringify(listed.urls));
check(pageCtxs.at(-1) === ctxA, "scripts_list 把 ctxA 传给 page.eval");
let shortSave = null;
let shortSaveError = null;
try {
  shortSave = await scripts.save({ url: "a.js", toWorkspace: true }, ctxA);
} catch (error) {
  shortSaveError = error;
}
check(!shortSaveError && shortSave?.url === urlA, "短名 scripts_save 从 A 页面解析完整 URL", String(shortSaveError || ""));
check(shortSave?.path === path.posix.join(rootA, "scripts", "a.js"), "scripts_save 写入 A 工作目录", shortSave?.path || "no path");

let capturePageCtx = null;
let captureSaveCtx = null;
let captureUrl = null;
const capture = new ScriptsBackend({
  page: {
    async eval(_args, ctx) {
      capturePageCtx = ctx;
      return { value: [ctx && ctx.win === winA ? urlA : urlB] };
    },
  },
  workspace,
});
capture.save = async ({ url }, ctx) => {
  captureUrl = url;
  captureSaveCtx = ctx;
  return { path: "/profile/" + path.posix.basename(url), bytes: 1 };
};
await capture.captureAll({ concurrency: 1 }, ctxA);
check(capturePageCtx === ctxA && captureSaveCtx === ctxA, "scripts_capture_all 对 list/save 全链透传 ctxA");
check(captureUrl === urlA, "scripts_capture_all 不抓 B 页面脚本", String(captureUrl));

console.log("[5] JSVMP query/trace stop 镜像到 A，默认 status 继续使用 A 窗口");
const traceFile = "/trace/firefox-reverse-jsvmp-b.ndjson.7";
textFiles.set(traceFile, '{"op":1}\n');
const jsvmp = new JsvmpBackend({ getWorkspaceRoot: ctx => (ctx ? ctx.workspaceRoot : rootB) });
const relayed = await jsvmp._relayToWorkspace(traceFile, ctxA);
const expectedRelay = path.posix.join(rootA, "jsvmp", path.posix.basename(traceFile));
check(relayed === expectedRelay, "_relayToWorkspace 使用 ctxA", String(relayed));
check(copies.some(item => item.src === traceFile && item.dest === expectedRelay), "JSVMP trace 实际复制到 A");
const relayCtxCallCount = (jsvmpSource.match(/_relayToWorkspace\(f, ctx\)/g) || []).length;
check(relayCtxCallCount === 3, "JSVMP relay 定义、query、trace-stop 三处均携带 ctx", `count=${relayCtxCallCount}`);
check(/return this\.status\(\{\}, ctx\);/.test(jsvmpSource), "JSVMP trace 默认 status 透传 ctx");

console.log(`\nworkspace isolation selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
