/* dev/selftest-thread-reservation.mjs — 多窗口线程预留逻辑的生产源码动态测试。
 *   node dev/selftest-thread-reservation.mjs
 * AgentSession.sys.mjs 依赖整棵 Firefox 模块树、Node 无法直接 import，故从生产文件提取并执行
 * begin/acquire/renew/release/subscribe 方法，覆盖回归点：同 owner 新挂载立即重认领 / 旧挂载代际隔离 /
 * 别窗口活预留拦截 / 预留过期回收 / 心跳续约 / 精确代际释放。真模块的端到端验证走装机后 marionette aeval。
 * 不随 omni.ja 打包。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESERVE_TTL_MS = 8000;
const here = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(here, "..", "modules", "AgentSession.sys.mjs");
const sessionSource = fs.readFileSync(sessionPath, "utf8");

function sourceMethod(name, dependencies) {
  const marker = `  ${name}(`;
  const from = sessionSource.indexOf(marker);
  assert.notEqual(from, -1, `missing AgentSession method: ${name}`);
  const declarationStart = from + 2;
  const bodyStart = sessionSource.indexOf("{", declarationStart);
  let depth = 0;
  for (let i = bodyStart; i < sessionSource.length; i += 1) {
    if (sessionSource[i] === "{") depth += 1;
    if (sessionSource[i] === "}") depth -= 1;
    if (depth === 0) {
      const declaration = "function " + sessionSource.slice(declarationStart, i + 1);
      return Function(...Object.keys(dependencies), `${declaration}; return ${name};`)(
        ...Object.values(dependencies),
      );
    }
  }
  assert.fail(`unterminated AgentSession method: ${name}`);
}

function makeStore() {
  const sessions = new Map();
  const ownerGenerations = new Map();
  const getOrInit = id => {
    let s = sessions.get(id);
    if (!s) {
      s = { reservation: null, subs: new Set() };
      sessions.set(id, s);
    }
    return s;
  };
  const beginThreadReservation = sourceMethod("beginThreadReservation", {
    reservationGenerations: ownerGenerations,
  });
  const acquireThread = sourceMethod("acquireThread", {
    reservationGenerations: ownerGenerations,
    getOrInit,
    RESERVE_TTL_MS,
  });
  const renewThread = sourceMethod("renewThread", {
    sessions,
    reservationGenerations: ownerGenerations,
  });
  const releaseThread = sourceMethod("releaseThread", {
    sessions,
    reservationGenerations: ownerGenerations,
  });
  const subscribe = sourceMethod("subscribe", {
    getOrInit,
    snapshot: () => ({}),
  });
  return {
    sessions,
    advance: ms => {
      for (const state of sessions.values()) {
        if (state.reservation) {
          state.reservation.ts -= ms;
        }
      }
    },
    beginThreadReservation,
    acquireThread,
    renewThread,
    releaseThread,
    subscribe,
  };
}

let fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: got=${JSON.stringify(got)}${ok ? "" : " want=" + JSON.stringify(want)}`);
  if (!ok) {
    fail++;
  }
}

// 1) 基本认领
let st = makeStore();
let genA = st.beginThreadReservation("winA");
check("首次认领成功", st.acquireThread(["T"], "winA", genA), "T");

// 2) 别的活窗口认领不到（多窗口隔离仍生效）
let genB = st.beginThreadReservation("winB");
check("别窗口被拦", st.acquireThread(["T"], "winB", genB), null);

// 3) 同 owner 新挂载立即重认领；旧 generation 的 acquire/renew/release 全部失败关闭
const oldGenA = genA;
genA = st.beginThreadReservation("winA");
check("同 owner 新挂载立即重认领", st.acquireThread(["T"], "winA", genA), "T");
check("旧挂载不得迟到 acquire", st.acquireThread(["T"], "winA", oldGenA), null);
check("旧挂载不得迟到 renew", st.renewThread("T", "winA", oldGenA), false);
check("旧挂载不得迟到 release", st.releaseThread("T", "winA", oldGenA), false);
check("旧 release 后 reservation 仍有效", st.acquireThread(["T"], "winB", genB), null);
check("新挂载仍可 renew", st.renewThread("T", "winA", genA), true);

// 3b) 旧订阅迟到退订只移除 callback，不得清除新挂载 reservation
const unsubscribeOld = st.subscribe("T", () => {});
const newestGenA = st.beginThreadReservation("winA");
check("订阅期间同 owner 新挂载重认领", st.acquireThread(["T"], "winA", newestGenA), "T");
unsubscribeOld();
check("旧 unsubscribe 不释放新 reservation", st.acquireThread(["T"], "winB", genB), null);
check("新 reservation 退订后仍可 renew", st.renewThread("T", "winA", newestGenA), true);

// 4) ★核心修复：持有者销毁未释放（无心跳），预留过期后别窗口可回收
st = makeStore();
const deadGen = st.beginThreadReservation("dead-mount");
const newGen = st.beginThreadReservation("new-mount");
st.acquireThread(["T"], "dead-mount", deadGen); // 旧挂载认领后文档被异常拆除，没 release
st.advance(RESERVE_TTL_MS + 1); // 过 TTL 无续约
check("过期预留可被新窗口回收", st.acquireThread(["T"], "new-mount", newGen), "T");

// 5) 心跳续约：活窗口持续 renew → 始终不被别窗口抢
st = makeStore();
genA = st.beginThreadReservation("winA");
genB = st.beginThreadReservation("winB");
st.acquireThread(["T"], "winA", genA);
for (let i = 0; i < 10; i++) {
  st.advance(3000); // 每 3s 一次心跳，10 次跨度 30s >> TTL
  check(`心跳第${i + 1}次续约`, st.renewThread("T", "winA", genA), true);
  // 期间别窗口始终抢不到
  if (st.acquireThread(["T"], "winB", genB) !== null) {
    console.log("FAIL 心跳期间别窗口竟抢到");
    fail++;
  }
}

// 6) renew 对已被别窗口接管的预留返回 false（不抢回）
st = makeStore();
genA = st.beginThreadReservation("winA");
genB = st.beginThreadReservation("winB");
st.acquireThread(["T"], "winA", genA);
st.advance(RESERVE_TTL_MS + 1);
st.acquireThread(["T"], "winB", genB); // winA 过期，winB 合法接管
check("renew 不抢回已接管的预留", st.renewThread("T", "winA", genA), false);
check("接管方 renew 正常", st.renewThread("T", "winB", genB), true);

// 7) release 只放自己的精确代际预留
st = makeStore();
genA = st.beginThreadReservation("winA");
genB = st.beginThreadReservation("winB");
const genC = st.beginThreadReservation("winC");
st.acquireThread(["T"], "winA", genA);
check("release 不放别窗口的预留", st.releaseThread("T", "winB", genB), false);
check("别窗口释放后仍不可认领", st.acquireThread(["T"], "winC", genC), null);
check("release 自己的预留", st.releaseThread("T", "winA", genA), true);
check("release 后可被认领", st.acquireThread(["T"], "winC", genC), "T");

// 8) 缺 owner/generation 的旧式调用全部失败关闭，renew 不得在空 reservation 上隐式重认领
st = makeStore();
genA = st.beginThreadReservation("winA");
check("无 owner begin 被拒绝", st.beginThreadReservation(), null);
check("缺 generation 认领被拒绝", st.acquireThread(["T"], "winA"), null);
check("缺 generation renew 被拒绝", st.renewThread("T", "winA"), false);
check("缺 generation release 被拒绝", st.releaseThread("T", "winA"), false);
check("空 reservation 不可由 renew 建权", st.renewThread("T", "winA", genA), false);

// 9) 多候选：跳过被占的，认领第一个可用的
st = makeStore();
genA = st.beginThreadReservation("winA");
genB = st.beginThreadReservation("winB");
st.acquireThread(["A"], "winA", genA); // A 被 winA 占
const got = st.acquireThread(["A", "B"], "winB", genB); // A 被活占 → 取 B
check("多候选跳过被占取下一个", got, "B");

console.log(fail ? `\n${fail} FAILED` : "\nALL PASS");
process.exit(fail ? 1 : 0);
