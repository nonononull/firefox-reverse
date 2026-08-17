/* selftest-skill-backend.mjs - skill_get 内置 chrome 资源读取回归。
 * 纯 Node + 内存 IO，不启动 Firefox；旧 asyncFetch 永不回调时必须在本测试的有界窗口内失败。
 */
import assert from "node:assert/strict";
import path from "node:path";

const SKILL_URL = "chrome://browser/content/agent-sidebar/skill-reverse.md";
const TEMPLATE_NAMES = [
  "node-env-loader.js",
  "wasm-signer-loader.js",
  "request-template.js",
  "webpack-chunk-loader.js",
  "jsvmp-const-harvest.js",
  "wasm-call-logger.js",
];
const TIMEOUT = Symbol("timeout");

let netUtilCalls = 0;
globalThis.ChromeUtils = {
  importESModule(spec) {
    assert.equal(spec, "resource://gre/modules/NetUtil.sys.mjs");
    return {
      NetUtil: {
        asyncFetch() {
          netUtilCalls++;
          // 确定性模拟 Firefox 现场：调用已发出，但回调永不抵达。
        },
      },
    };
  },
};
globalThis.Components = { isSuccessCode: () => true };
globalThis.PathUtils = { join: (...parts) => path.win32.join(...parts) };

const files = new Map();
const directories = [];
globalThis.IOUtils = {
  async makeDirectory(dir) {
    directories.push(dir);
  },
  async stat(file) {
    if (!files.has(file)) {
      throw new Error("ENOENT " + file);
    }
    return { size: files.get(file).length };
  },
  async writeUTF8(file, text) {
    files.set(file, text);
  },
};

let responseMode = "success";
const fetchCalls = [];
globalThis.fetch = async url => {
  fetchCalls.push(url);
  if (responseMode === "not-found") {
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      async text() {
        return "ignored";
      },
    };
  }
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async text() {
      if (url === SKILL_URL) {
        return "ISSUE12_SKILL_BODY";
      }
      const name = url.slice(url.lastIndexOf("/") + 1);
      return "template:" + name;
    },
  };
};

const { SkillBackend } = await import("../modules/SkillBackend.sys.mjs");

async function within(promise, timeoutMs = 200) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(TIMEOUT), timeoutMs)),
  ]);
}

const workspaceRoot = "C:\\issue12-workspace";
const workspace = { getRoot: ctx => ctx.workspaceRoot };
const backend = new SkillBackend({ workspace });
const first = await within(backend.get({}, { workspaceRoot }));

if (first === TIMEOUT) {
  throw new Error(
    `SKILL_BACKEND_OLD_FLOW_TIMEOUT netUtilCalls=${netUtilCalls} fetchCalls=${fetchCalls.length}`
  );
}

assert.equal(first.ok, true);
assert.equal(first.skill, "ISSUE12_SKILL_BODY");
assert.deepEqual(
  first.templates,
  TEMPLATE_NAMES.map(name => ".agent-tools/templates/" + name)
);
assert.equal(netUtilCalls, 0, "新路径不得再进入 NetUtil.asyncFetch");
assert.equal(fetchCalls.filter(url => url === SKILL_URL).length, 1);
assert.equal(fetchCalls.length, 1 + TEMPLATE_NAMES.length);
assert.equal(directories.length, 1);
for (const name of TEMPLATE_NAMES) {
  const file = path.win32.join(workspaceRoot, ".agent-tools", "templates", name);
  assert.equal(files.get(file), "template:" + name);
}

const second = await within(backend.get({}, { workspaceRoot }));
assert.notEqual(second, TIMEOUT);
assert.equal(second.ok, true);
assert.equal(second.skill, "ISSUE12_SKILL_BODY");
assert.equal(fetchCalls.filter(url => url === SKILL_URL).length, 1, "正文必须命中缓存");
assert.equal(fetchCalls.length, 1 + TEMPLATE_NAMES.length, "已释放模板不得重复读取或覆写");

responseMode = "not-found";
const missing = await within(new SkillBackend().get({}, {}));
assert.notEqual(missing, TIMEOUT);
assert.equal(missing.ok, false);
assert.match(missing.error, /status=404/);
assert.match(missing.error, /skill-reverse\.md/);

console.log("skill backend selftest: all passed");
