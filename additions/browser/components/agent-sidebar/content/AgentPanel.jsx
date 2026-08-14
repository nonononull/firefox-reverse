import React, { useState, useRef, useEffect, useCallback } from "react";

/**
 * Agent 对话面板（A1+：多轮消息 + 多线程历史持久化）。
 *
 * 依赖通过 props 注入（index.jsx 用 ChromeUtils.importESModule 加载 modules 后传入），
 * 使本组件保持纯 UI、可独立打包。
 *
 * @param {object} props
 * @param {() => import("../modules/LlmClient.sys.mjs").LlmClient} props.buildClient
 * @param {import("../modules/ConversationStore.sys.mjs").ConversationStore} props.conversations
 * @param {() => void} [props.onOpenEnvironment]
 * @param {() => void} [props.onOpenSettings]
 */

const TITLE = "Firefox-Reverse-Agent";
const SYSTEM = `你是 firefox-reverse 浏览器内置的 JS 逆向与自动化助手，可调用工具直接操作浏览器：分析页面、自动点击/滑动/填表、抓包、搜代码、追踪加密/签名参数的生成算法。

工具清单与参数你已在 function 列表里看到，这里不重复；只给必须时刻记住的核心，**完整方法论调 \`skill_get\` 读全文**。

【做逆向：先 skill_get】做签名/加密参数逆向前，**先调一次 \`skill_get\`** 把方法论（一页流：决策树→常规执行链 6 步→工具速查）拉进上下文，并自动释放 node 补环境/请求脚手架到工作目录（fs_copy 拿现成改）。开工也先 \`notes_get\` 看本站历史。

【先判难度·简单站先走快车道】抓到接口**先看目标参数"长什么样"**(长度/字符集/是否 base64/有没有同发毫秒时间戳)——多数是**标准算法**(MD5/SHA/HMAC/AES/DES)，**别急着扣代码**：\`signer_trace\`/\`webapi_trace\` 抓 signer **真实入参** → 本地 \`crypto\` 对同一入参跑「候选算法×拼接模板」与真实值**逐字节比**，对上即收工(一行混淆都不用读)。**hook 不到入参 或 确认非官方算法**才降档到"扣最小片段进 vm→WASM→JSVMP"。trace **先 arm 再触发**(首屏就发的接口先开 trace 再 \`page_navigate\` 重载，否则只抓到 init 噪声)。详见 skill_get 决策树 ①→⑤。

【两阶段（详见 skill_get）】① **Node 可用版**：定位+\`scripts_save(toWorkspace)\` 落 signer → \`webapi_trace\`/\`webapi_query\` 抓指纹 → 用 \`net_get\` 抓**完整请求当模版**、逐步剥参数定位"真正的门" → \`npm_install\` 补环境只生成加密参数、其余稳定值(cookie/token)可从浏览器拿 → **以本地实打目标接口、返回有效数据为准**(不是"签名看着对")。② **白盒纯算**：\`jsvmp_trace\` 看 VM + 监控 node 链路 → 纯 .js/.py 逐字节对比。

【阶段门（skill_get §3.5 全文）】严格按 P0侦察→P1定位生成点→**P2 先验证再逆向**→P3判型→P4选策略(黑盒优先)→P5补环境→P6实打验证。**铁律：没用已知输入在浏览器复现出真实 wire 值(P2)前，禁止进字节码反汇编**——逆错对象是最大时间黑洞。**wire 参数 ≠ 最显眼 signer 的输出**(常见 wire=wrapper(signer,其它))，**永远 diff 真实样本**验证；格式/长度/前缀不符=没找对，回上一层。红旗(格式不符/长度对不上/偶尔为空)**必停**别忽略。

【账本而非流水（skill_get §6.5）】维护结构化 \`ledger.md\`：目标定义 / 已确认事实(带证据) / **已否决假设(永不重试)** / 待解问题 / 当前阶段+下一步。**想查/跑某事前先看账本——已确认或已否决里有的，直接用，绝不重新发现/重走死路**（"我来确认下 X"而 X 已在账本=违规）。压缩重启后第一件事按账本"当前阶段+下一步"续，**别从 P0 重侦察**。

【红线】① 最终产物运行时**不靠浏览器跑加密**(node 补环境/纯算都行；开浏览器调 signer 当 runtime=违规。但从浏览器抓的静态 cookie/token 当输入用**不算违规**，那是输入数据)；② \`page_eval\` **全权、别自我设限**——页面里读值/调 signer/**装 hook 记入参出参(「hook 日志大法」:包 \`window.fetch\`/XHR/crypto→交互触发→读 \`window.__log\`)/改全局/注入**都行,是你最趁手的分析工具,别因"应该只读"退回笨重 signer_trace;唯一边界是①(产物不靠浏览器);强检测/JSVMP 站注入**可能被测到**→**自己权衡**换不换引擎层 trace,**不是禁令**；③ 别全量 trace 整页(收窄到 signer 一次调用)；④ 站点无关、标准密码学用库不手搓。

【反绕圈】**⚠ 工具的硬限制 ≠「此路不通」（本 Agent 最大的坑，记牢）**：page_eval 输出被截 / run_node 超时 / 结果被上下文上限截 / fs_read 整读被拦——是**工具用法要换**（**取大源码·\`fn.toString()\` 一律加 \`saveTo:'work/x.js'\` 落盘再 code_search/fs_read**、超时调大、分段读），**不是分析路线死了**；**严禁**因撞工具上限就编个"环境/指纹绕不过"的体面根因、甩"白盒/oracle 二选一"来结案。看到 truncated/被截/只回一截 = 上限、换用法别换策略。 其次：同类报错 / 同一工具撞同一个错 **≥3 次 = 在绕圈** → 别再用同样方式重试，按 skill_get §6 换路线。系统也会在工具结果里给你换路线提示。

【上下文】大结果(trace/大文件/字节码)别整块灌进对话——先落盘、对话留摘要；要细节用 \`fs_read\` 的 offset/limit 分段、\`code_search\` 精搜、或 \`run_node\` 算好只回结论。（长会话堆大会拖慢甚至卡死。）
【沉淀】每验证通过一个关键结论 → \`notes_add\`（**只记验证过的**），下次同站点复用。结论用「## 结论」小标题：参数在哪生成 · 算法/依赖/指纹输入 · 可独立复现(附可运行 .js/.py + 实打接口返回有效数据)。

【自主执行（重要）】
- 拿到目标先拆成有序子任务清单（一两句列出来）；然后**不间断地逐个完成到全部结束**，每完成一步简述"做了什么/得到什么/下一步"，并**立即继续下一步**，无需等我点头。
- **不要每步都停下来问"要不要继续 / 是否继续 / 需要我做吗"**——默认一直推进到底。只有这两种情况才结束本轮：① 真正需要我提供你拿不到的东西（登录态/验证码/账号/纯业务决策）；② 目标已全部完成。
- 用工作目录形成闭环：抓取/分析 → fs_write 落盘中间产物（脚本、trace、还原代码、笔记）→ run_node/run_python **实跑验证** → 与页面真实产出对照 → 修正，直到还原结果经得起独立实跑比对。
- 工具失败/超时/结果为空别立刻收手：分析原因、换参数或换工具继续推进；同一工具别用相同入参反复重试。

【纪律】
- 主动调工具，别空想；用中文，结论要可落地。
- 不确定就明说"不确定"并给下一步建议，然后继续尝试，而不是停下来等我。
- 给结论用「## 结论」作小标题，简洁直接；别用"实事求是的结论"之类套话/口头禅。`;

// 模式注入块：每条发送时按本会话模式拼到系统提示尾部。
// 全自动=一条龙跑到底（现状默认）；AI辅助=逐阶段停下跟用户讨论选方向。
const AUTO_BLOCK = `

【执行模式：全自动】给定目标接口/参数，你**一条龙**自主推进到底（P0 侦察→P1 定位→P2 验证→P3 判型→P4 选策略→P5 补环境→P6 实打验证），不中途停下问我；只有真正需要我提供你拿不到的东西（登录态/账号/验证码/纯业务决策），或任务全部完成（给出可独立实跑、与页面真值对上的产物）时才停。`;

const ASSIST_BLOCK = `

【执行模式：AI辅助（跟用户协作导航）】偏「逐阶段、跟用户对齐方向」，但**以用户当前的指令为最高优先**——下面 1 永远盖过 2/3 那套「停下给选项」的模板：
1. **用户给了明确指令/实验/方向时**（例：「跑这个脚本」「别转 oracle/白盒，继续在黑盒上挖」「先做这个实验」）：**照做、做到底、回报具体结果**。**别用「我给你 2-3 个方向你选」这套模板把用户的指令顶掉，更别擅自转去用户刚否掉的方向**。这一轮你就是**执行 + 如实回报**，不是「提案 + 停」；该步内连续多调几个工具把它做完，别做一步就停。回报的是**真实跑出来的结果**，不是为收尾编的结论。
2. **首轮 / 用户没给明确方向时**：先出一个**简短分阶段方案**（每阶段用什么工具、预期产出），停下问从哪开始（可先调 skill_get/notes_get/page_info 这类只读工具了解现状）。
3. **只在「真分叉」才停下给选项**：你确实被卡死、或确有几条**实质不同**的路且判不准哪条好——这才给 2-3 个候选方向 + 你的推荐让用户选。**严禁为了结束这一轮、为了跳出反复试的循环，就硬造一个分叉、硬下一个体面的「根因」来收尾。**
4. **结论必须跟着你自己的证据走、不许自相矛盾**：写「根因/结论」前回看本轮自己的输出——你的日志若显示某步**成功了**，就不能写它「失败」；若是「补一个对象、报错就往后挪一步」，那是在**逼近**、不是「死路」。证据没指向某结论就别下，宁可写「还没定论，下一步具体做 X」然后接着做。
5. 真拿不准、缺登录态/账号/验证码/纯业务决策，才停下问——辅助模式的价值是**用户帮你导航死路**，不是给你每轮找借口收尾。`;

// 内联 SVG 图标（stroke=currentColor，随主题/字色变化，比 emoji 清晰可控）
const svgProps = {
  viewBox: "0 0 24 24",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const ICONS = {
  history: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  ),
  plus: (
    <svg {...svgProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  gear: (
    <svg {...svgProps}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  env: (
    <svg {...svgProps}>
      <path d="M4 5.5h16M4 12h16M4 18.5h16" />
      <circle cx="8" cy="5.5" r="1.8" />
      <circle cx="14" cy="12" r="1.8" />
      <circle cx="10" cy="18.5" r="1.8" />
    </svg>
  ),
  // 删除按钮 SVG（轻量 × 号，比文本字符更可控）
  close: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  // 模式图标（与上面同风格 line-SVG）：全自动=闪电(一条龙快)、AI辅助=罗盘(领航/选方向)、未选=开关(挑模式)
  modeAuto: (
    <svg {...svgProps}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  modeAssist: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2 5.2-2Z" />
    </svg>
  ),
  modeUnset: (
    <svg {...svgProps}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="5.5" />
      <circle cx="8" cy="12" r="2.6" />
    </svg>
  ),
};

// 工具调用步骤：紧凑状态行（可折叠隐藏） + 截图缩略图（若有）
function ToolStep({ step }) {
  const mark = step.status === "ok" ? "✓" : step.status === "err" ? "✗" : "…";
  return (
    <div className={`msg__step msg__step--tool is-${step.status}`}>
      <div className="msg__step-line">
        <span className="msg__step-name">🔧 {step.name} {mark}</span>
        {step.summary ? <span className="msg__step-sum"> {step.summary}</span> : null}
      </div>
      {step.images && step.images.length
        ? step.images.map((src, k) => (
            <img key={k} className="msg__shot" src={src} alt="screenshot" loading="lazy" />
          ))
        : step.shot
        ? <span className="msg__step-sum">［截图 ×{step.shot}］</span>
        : null}
    </div>
  );
}

// 一段正文：DeepSeek 的每轮文字回复，**始终可见**（不被折叠屏蔽）
function TextSeg({ step, live }) {
  return (
    <div className="msg__textseg">
      {step.text}
      {live ? <span className="msg__cursor">▌</span> : null}
    </div>
  );
}

// 思考型模型(v4-pro)的思考过程：默认展开可见，可点击收起
function ThinkSeg({ step, live }) {
  return (
    <details className="msg__think" open>
      <summary className="msg__think-label">💭 思考过程</summary>
      <div className="msg__think-body">
        {step.text}
        {live ? <span className="msg__cursor">▌</span> : null}
      </div>
    </details>
  );
}

// 渲染 steps：正文段/思考段始终显示；工具步骤按 hideTools 折叠。live 时给最后一段加光标。
function StepList({ steps, hideTools, live }) {
  return steps.map((s, j) => {
    if (s.kind === "tool") {
      return hideTools ? null : <ToolStep key={j} step={s} />;
    }
    if (s.kind === "think") {
      return <ThinkSeg key={j} step={s} live={live && j === steps.length - 1} />;
    }
    return <TextSeg key={j} step={s} live={live && j === steps.length - 1} />;
  });
}

// 完成态 assistant 消息体：默认展开全过程；收起后**只保留最后一段（结论）**，思考/工具/中间正文一并收齐
function AssistantBody({ steps, content }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!steps || !steps.length) {
    return <div className="msg__content">{content}</div>;
  }
  const toolCount = steps.filter(s => s.kind === "tool").length;
  // 最后一段正文（最终结论）的下标
  let lastTextIdx = -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].kind === "text") {
      lastTextIdx = i;
      break;
    }
  }
  // 有「过程」可收起：含工具/思考，或正文不止一段
  const collapsible =
    steps.some(s => s.kind !== "text") || steps.filter(s => s.kind === "text").length > 1;
  const shown = collapsed ? (lastTextIdx >= 0 ? [steps[lastTextIdx]] : steps.slice(-1)) : steps;
  return (
    <div className="msg__content">
      <StepList steps={shown} hideTools={false} />
      {collapsible && (
        <button type="button" className="msg__toolToggle" onClick={() => setCollapsed(v => !v)}>
          {collapsed ? `▸ 展开思考/工具过程（${toolCount} 步工具）` : "▾ 收起过程，只看结论"}
        </button>
      )}
    </div>
  );
}

// 持久化前给 steps 瘦身：剥掉截图 dataURL（体积大，只留张数）、截断超长思考段，
// 避免 conversations.json 膨胀。成功/报错/手动停止三条路径共用，保证历史一致保留。
function slimifySteps(steps) {
  return steps.map(s => {
    if (s.images && s.images.length) {
      const { images, ...rest } = s; // eslint-disable-line no-unused-vars
      return { ...rest, shot: images.length };
    }
    if (s.kind === "think" && s.text && s.text.length > 800) {
      return { ...s, text: s.text.slice(0, 800) + "…（思考已截断）" };
    }
    return s;
  });
}

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// 工作目录路径短显示（只留末两段）+ 文件大小友好显示
function shortPath(p) {
  if (!p) return "";
  const segs = String(p).replace(/\/+$/, "").split("/");
  return segs.length <= 2 ? p : ".../" + segs.slice(-2).join("/");
}
function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "K";
  return (n / 1024 / 1024).toFixed(1) + "M";
}

// chrome 特权全局（侧边栏文档 = chrome:// 系统 principal）。typeof 守卫，取不到则降级（按钮报错不崩）。
const _CC = typeof Components !== "undefined" ? Components.classes : typeof Cc !== "undefined" ? Cc : null;
const _CI = typeof Components !== "undefined" ? Components.interfaces : typeof Ci !== "undefined" ? Ci : null;
const _SVC = typeof Services !== "undefined" ? Services : null;

function hasThreadReservation(session) {
  return !!session &&
    typeof session.beginThreadReservation === "function" &&
    typeof session.acquireThread === "function" &&
    typeof session.renewThread === "function" &&
    typeof session.releaseThread === "function";
}

function sameSelection(current, expected) {
  return !!current && !!expected &&
    current.id === expected.id && current.revision === expected.revision &&
    current.claim === expected.claim;
}

function captureSelectionIntent(selectionRef, intentRef) {
  return { ...selectionRef.current, intent: intentRef.current };
}

function beginSelectionIntent(selectionRef, intentRef, pendingRef) {
  intentRef.current += 1;
  const selection = captureSelectionIntent(selectionRef, intentRef);
  pendingRef.current = selection.intent;
  return selection;
}

function finishSelectionIntent(pendingRef, expected) {
  if (pendingRef.current === expected.intent) {
    pendingRef.current = null;
  }
}

function sameSelectionIntent(selectionRef, intentRef, expected) {
  return intentRef.current === expected.intent &&
    sameSelection(selectionRef.current, expected);
}

function beginThreadConfigIntent(intentRef, pendingRef = null) {
  intentRef.current += 1;
  if (pendingRef) {
    pendingRef.current = intentRef.current;
  }
  return intentRef.current;
}

function captureThreadConfigIntent(intentRef) {
  return intentRef.current;
}

function sameThreadConfigIntent(intentRef, expected) {
  return intentRef.current === expected;
}

function finishThreadConfigIntent(pendingRef, expected) {
  if (pendingRef.current === expected) {
    pendingRef.current = null;
  }
}

async function setOwnedThreadMode(conversations, threadId, mode, canSet) {
  if (!conversations || typeof conversations.setThreadMode !== "function") {
    throw new Error("会话存储接口不完整，无法修改执行模式。");
  }
  const thread = await conversations.setThreadMode(threadId, mode, value => canSet(value) === true);
  if (!thread) {
    throw new Error("当前会话已不存在，无法修改执行模式。");
  }
  return thread;
}

async function setOwnedThreadWorkspace(conversations, threadId, workspace, canSet) {
  if (!conversations || typeof conversations.setThreadWorkspace !== "function") {
    throw new Error("会话存储接口不完整，无法修改工作目录。");
  }
  const thread = await conversations.setThreadWorkspace(threadId, workspace, value => canSet(value) === true);
  if (!thread) {
    throw new Error("当前会话已不存在，无法修改工作目录。");
  }
  return thread;
}

function threadRunConfig(thread) {
  return {
    mode: thread?.mode || "auto",
    workspace: thread?.workspace || null,
  };
}

function sameThreadRunConfig(thread, expected) {
  const current = threadRunConfig(thread);
  return !!expected && current.mode === expected.mode && current.workspace === expected.workspace;
}

async function readOwnedThreadRunConfig(conversations, threadId, canRead) {
  if (!conversations || typeof conversations.getThread !== "function") {
    throw new Error("会话存储接口不完整，无法读取执行配置。");
  }
  const thread = await conversations.getThread(threadId);
  if (!thread) {
    throw new Error("当前会话已不存在，已停止发送且未启动任务。");
  }
  if (canRead(thread) !== true) {
    throw new Error("当前会话配置已变化，已停止发送且未启动任务，请重新发送。");
  }
  return threadRunConfig(thread);
}

async function prepareOwnedThreadRunConfig(conversations, threadId, notes, canRead) {
  let digest = "";
  try {
    digest = notes && notes.digest ? await notes.digest({}) : "";
  } catch {
    /* 笔记可选，取不到不影响。 */
  }
  const runConfig = await readOwnedThreadRunConfig(conversations, threadId, canRead);
  return { digest, runConfig };
}

function createReservationOwner(session, host) {
  let owner = null;
  if (host) {
    if (!host.__frxAgentOwnerToken) {
      host.__frxAgentOwnerToken = "win-" + Math.random().toString(36).slice(2);
    }
    owner = host.__frxAgentOwnerToken;
  } else {
    owner = "mount-" + Math.random().toString(36).slice(2);
  }
  const generation = session && typeof session.beginThreadReservation === "function"
    ? session.beginThreadReservation(owner)
    : null;
  if (host && Number.isInteger(generation)) {
    host.__frxAgentOwnerGeneration = generation;
  }
  return { owner, generation, host, claimState: { next: 0 } };
}

function createReservationClaim(reservation) {
  if (!isReservationOwnerCurrent(reservation)) {
    return null;
  }
  if (!reservation.claimState) {
    reservation.claimState = { next: 0 };
  }
  reservation.claimState.next += 1;
  return {
    ...reservation,
    claim: reservation.claimState.next,
  };
}

function reservationForSelection(reservation, selection) {
  if (!selection || !Number.isInteger(selection.claim) || selection.claim <= 0) {
    return null;
  }
  return { ...reservation, claim: selection.claim };
}

function reservationOwnerToken(reservation) {
  return reservation?.owner;
}

function isReservationOwnerCurrent(reservation) {
  if (!reservation || typeof reservation.owner !== "string" ||
      !Number.isInteger(reservation.generation) || reservation.generation <= 0) {
    return false;
  }
  return !reservation.host ||
    reservation.host.__frxAgentOwnerGeneration === reservation.generation;
}

function acquireOwnedThread(session, candidateIds, reservation) {
  if (!isReservationOwnerCurrent(reservation) || !Number.isInteger(reservation.claim) || reservation.claim <= 0) {
    return null;
  }
  return session.acquireThread(
    candidateIds,
    reservationOwnerToken(reservation),
    reservation.generation,
    reservation.claim,
  );
}

function releaseOwnedThread(session, threadId, reservation, abandonRunning = false) {
  try {
    if (session && typeof session.releaseThread === "function" && threadId &&
        (isReservationOwnerCurrent(reservation) || (abandonRunning === true &&
          typeof reservation?.owner === "string" && reservation.owner &&
          Number.isInteger(reservation.generation) && reservation.generation > 0 &&
          Number.isInteger(reservation.claim) && reservation.claim > 0))) {
      return session.releaseThread(
        threadId,
        reservationOwnerToken(reservation),
        reservation.generation,
        reservation.claim,
        abandonRunning,
      ) === true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function keepOwnedThreadForSelection(
  selectionRef,
  intentRef,
  expected,
  thread,
  session,
  reservation,
  releaseWhenStale = false,
  abandonRunningWhenStale = false,
) {
  if (sameSelectionIntent(selectionRef, intentRef, expected)) {
    return true;
  }
  if (releaseWhenStale && thread) {
    releaseOwnedThread(session, thread.id, reservation, abandonRunningWhenStale);
  }
  return false;
}

async function acquireIdleExistingThread(
  conversations,
  session,
  threadId,
  reservation,
  canKeep = () => true,
) {
  if (!threadId) {
    return null;
  }
  if (!hasThreadReservation(session) || typeof session.isRunning !== "function" ||
      !conversations || typeof conversations.getThread !== "function") {
    throw new Error("多窗口会话预留或运行状态接口不完整，已拒绝加载历史会话。");
  }
  const wasRunning = session.isRunning(threadId);
  const claim = createReservationClaim(reservation);
  const acquired = claim ? acquireOwnedThread(session, [threadId], claim) : null;
  if (acquired !== threadId) {
    if (acquired) {
      releaseOwnedThread(session, acquired, claim, true);
    }
    return null;
  }
  if (!wasRunning) {
    try {
      const thread = await readAcquiredThread(conversations, session, threadId, claim, canKeep);
      return thread ? { thread, reservation: claim, resumedRunning: false } : null;
    } catch (e) {
      if (/conversation (?:became running|read authorization lost)/.test(String(e?.message || e))) {
        return null;
      }
      throw e;
    }
  }
  let keep = false;
  try {
    const thread = await conversations.getThread(threadId);
    if (!thread || canKeep() !== true || !renewOwnedThread(session, threadId, claim, () => {})) {
      return null;
    }
    keep = true;
    return { thread, reservation: claim, resumedRunning: true };
  } finally {
    if (!keep) {
      releaseOwnedThread(session, threadId, claim, false);
    }
  }
}

async function acquirePreferredExistingThread(
  conversations,
  session,
  candidateIds,
  reservation,
  canKeep = () => true,
) {
  if (!session || typeof session.isRunning !== "function") {
    throw new Error("Agent 运行状态接口不完整，已拒绝加载历史会话。");
  }
  const candidates = (candidateIds || [])
    .filter(Boolean)
    .map(id => ({ id, running: session.isRunning(id) }));
  const ordered = [
    ...candidates.filter(candidate => candidate.running),
    ...candidates.filter(candidate => !candidate.running),
  ];
  for (const candidate of ordered) {
    if (canKeep() !== true) {
      return null;
    }
    const existing = await acquireIdleExistingThread(
      conversations,
      session,
      candidate.id,
      reservation,
      canKeep,
    );
    if (existing) {
      return existing;
    }
  }
  return null;
}

async function createOwnedThread(conversations, session, reservation, canCreate = () => true) {
  if (!hasThreadReservation(session) || !conversations ||
      typeof conversations.createThread !== "function" || typeof conversations.deleteThread !== "function") {
    throw new Error("多窗口会话预留 API 不完整，已拒绝创建未受保护的会话。");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!isReservationOwnerCurrent(reservation)) {
      throw new Error("当前窗口挂载代际已失效，已拒绝创建迟到会话。");
    }
    const claim = createReservationClaim(reservation);
    let candidateId = null;
    let authorized = false;
    let stale = false;
    try {
      const thread = await conversations.createThread(undefined, null, null, candidate => {
        candidateId = candidate.id;
        if (canCreate() !== true) {
          stale = true;
          return false;
        }
        const acquired = acquireOwnedThread(session, [candidate.id], claim);
        if (acquired && acquired !== candidate.id) {
          releaseOwnedThread(session, acquired, claim, true);
        }
        authorized = acquired === candidate.id;
        return authorized;
      });
      if (!authorized) {
        throw new Error("ConversationStore 未在线性化点执行新会话认领。");
      }
      const selectionCurrent = canCreate() === true;
      if (!selectionCurrent || !renewOwnedThread(session, thread.id, claim, () => {})) {
        await discardOwnedThread(conversations, session, thread.id, claim);
        if (selectionCurrent) {
          throw new Error("conversation creation authorization lost: " + thread.id);
        }
        throw new Error("会话选择已变化，已清理或移交迟到的新会话。");
      }
      return { thread, reservation: claim };
    } catch (e) {
      if (candidateId) {
        releaseOwnedThread(session, candidateId, claim, true);
      }
      if (stale) {
        throw new Error("会话选择已变化，已拒绝写入迟到的新会话。");
      }
      const rejected = /creation authorization lost/.test(String(e?.message || e));
      if (!rejected || !isReservationOwnerCurrent(reservation)) {
        throw e;
      }
    }
  }
  throw new Error("连续创建的新会话均被其它窗口认领，无法认领新会话。");
}

async function discardOwnedThread(conversations, session, threadId, reservation) {
  try {
    await conversations.deleteThread(
      threadId,
      () => renewOwnedThread(session, threadId, reservation, () => {}),
    );
  } catch (e) {
    if (!/deletion authorization lost/.test(String(e?.message || e))) {
      throw e;
    }
  } finally {
    releaseOwnedThread(session, threadId, reservation, true);
  }
}

async function commitOwnedUserMessage(
  conversations,
  session,
  threadId,
  message,
  runOptions,
  canCommit,
  onCommitted,
  commitState,
) {
  if (!conversations || typeof conversations.appendMessage !== "function" ||
      !session || typeof session.run !== "function" || typeof session.isRunning !== "function") {
    throw new Error("会话存储或 Agent 运行接口不完整，已拒绝发送。");
  }
  await conversations.appendMessage(
    threadId,
    message,
    thread => canCommit(thread) === true && !session.isRunning(threadId),
    thread => {
      session.run(threadId, { ...runOptions, convo: [...thread.messages] });
      if (!session.isRunning(threadId)) {
        throw new Error("Agent 未进入运行态，已回滚本次用户消息。");
      }
      commitState.started = true;
      try {
        onCommitted(thread);
      } catch {
        /* UI 回调失败不能回滚已启动任务。 */
      }
    },
  );
}

function renewOwnedThread(session, threadId, reservation, onLost) {
  try {
    if (session && typeof session.renewThread === "function" &&
        isReservationOwnerCurrent(reservation) &&
        session.renewThread(
          threadId,
          reservationOwnerToken(reservation),
          reservation.generation,
          reservation.claim,
        ) === true) {
      return true;
    }
  } catch {
    // 按失权处理，避免异常后继续使用旧 thread。
  }
  onLost();
  return false;
}

async function readAcquiredThread(conversations, session, threadId, reservation, canKeep) {
  let keep = false;
  try {
    if (!session || typeof session.isRunning !== "function" || session.isRunning(threadId)) {
      throw new Error("conversation became running before history read: " + threadId);
    }
    const thread = await conversations.getThread(threadId);
    if (!thread) {
      return null;
    }
    if (canKeep() !== true) {
      throw new Error("conversation read authorization lost: " + threadId);
    }
    if (session.isRunning(threadId)) {
      throw new Error("conversation became running during history read: " + threadId);
    }
    if (!renewOwnedThread(session, threadId, reservation, () => {})) {
      throw new Error("conversation read authorization lost: " + threadId);
    }
    keep = true;
    return thread;
  } finally {
    if (!keep) {
      releaseOwnedThread(session, threadId, reservation, true);
    }
  }
}

function ownsSelectedThread(session, selectionRef, expected, reservation) {
  if (!sameSelection(selectionRef.current, expected)) {
    return false;
  }
  return renewOwnedThread(session, expected.id, reservation, () => {});
}

function ownsSelectedThreadForIntent(session, selectionRef, intentRef, expected, reservation) {
  return sameSelectionIntent(selectionRef, intentRef, expected) &&
    ownsSelectedThread(session, selectionRef, expected, reservation);
}

function restoreUnsentInput(current, unsent) {
  if (!unsent) {
    return current || "";
  }
  if (!current) {
    return unsent;
  }
  if (current === unsent || current.startsWith(unsent + "\n")) {
    return current;
  }
  return unsent + "\n" + current;
}

function currentThreadRunEpoch(session, threadId) {
  try {
    const epoch = session && typeof session.getState === "function"
      ? session.getState(threadId)?.runEpoch
      : null;
    return Number.isInteger(epoch) && epoch >= 0 ? epoch : null;
  } catch {
    return null;
  }
}

async function deleteOwnedThread(
  conversations,
  session,
  threadId,
  reservation,
  releaseOnFailure = false,
  alreadyOwned = false,
) {
  if (!hasThreadReservation(session) || typeof session.isRunning !== "function" ||
      typeof session.getState !== "function") {
    throw new Error("多窗口会话预留或运行状态接口不完整，已拒绝删除历史会话。");
  }
  if (session.isRunning(threadId)) {
    throw new Error("该会话正在运行，不能删除。");
  }
  const deleteReservation = Number.isInteger(reservation?.claim) ? reservation : null;
  let deleted = false;
  const acquired = alreadyOwned
    ? (deleteReservation && renewOwnedThread(session, threadId, deleteReservation, () => {})
      ? threadId
      : null)
    : (deleteReservation ? acquireOwnedThread(session, [threadId], deleteReservation) : null);
  if (acquired !== threadId) {
    if (acquired) {
      releaseOwnedThread(session, acquired, deleteReservation, true);
    }
    throw new Error(alreadyOwned
      ? "该会话的窗口预留已失效，不能删除。"
      : "该会话已在另一个浏览器窗口打开，不能删除。");
  }
  const deleteRunEpoch = currentThreadRunEpoch(session, threadId);
  if (deleteRunEpoch === null) {
    throw new Error("Agent 运行纪元接口不完整，已拒绝删除历史会话。");
  }
  try {
    if (session.isRunning(threadId) || currentThreadRunEpoch(session, threadId) !== deleteRunEpoch) {
      throw new Error("该会话正在运行，不能删除。");
    }
    if (!renewOwnedThread(session, threadId, deleteReservation, () => {})) {
      throw new Error("该会话的窗口预留已失效，不能删除。");
    }
    await conversations.deleteThread(
      threadId,
      () => !session.isRunning(threadId) &&
        currentThreadRunEpoch(session, threadId) === deleteRunEpoch &&
        renewOwnedThread(session, threadId, deleteReservation, () => {}),
    );
    deleted = true;
  } finally {
    if (releaseOnFailure || deleted) {
      releaseOwnedThread(session, threadId, deleteReservation, !alreadyOwned);
    }
  }
}

async function deleteThreadForSelection(
  conversations,
  session,
  threadId,
  reservation,
  currentSelection,
) {
  const deletingCurrent = threadId === currentSelection.id;
  const deleteReservation = deletingCurrent
    ? reservationForSelection(reservation, currentSelection)
    : createReservationClaim(reservation);
  await deleteOwnedThread(
    conversations,
    session,
    threadId,
    deleteReservation,
    !deletingCurrent,
    deletingCurrent,
  );
}

export default function AgentPanel({ buildClient, conversations, store, router, runAgentTurn, session, isVisionModel, workspace, notes, toolNames = [], onOpenEnvironment, onOpenSettings, hidden = false }) {
  const [messages, setMessages] = useState([]); // 仅 user/assistant
  const [threads, setThreads] = useState([]); // 摘要列表
  const [currentId, setCurrentId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [liveSteps, setLiveSteps] = useState([]); // 本回合进行中的过程步骤（累积，不覆盖）
  const [error, setError] = useState(null);
  const [workspaceDir, setWorkspaceDir] = useState(null); // 当前会话绑定的工作目录
  const [mode, setMode] = useState(null); // 本会话执行模式："auto"=全自动一条龙 / "assist"=AI辅助逐阶段 / null=未选（首次新建会话让用户选）
  const [files, setFiles] = useState([]); // 工作目录文件列表（展开时填充）
  const [filesOpen, setFilesOpen] = useState(false);
  const listRef = useRef(null);
  const atBottomRef = useRef(true); // 用户是否贴在底部（贴底才自动跟随最新回复；手动上滑则不打扰）
  const autoApproveRef = useRef(false); // 本回合内「总是允许」后续工具调用
  const abortRef = useRef(null); // 本回合 AbortController（「停止」按钮中断自主执行）
  const stepsRef = useRef([]); // 过程步骤的可变副本（闭包里更新）
  const curTextRef = useRef(-1); // 当前正在流式追加的 text step 下标
  const curThinkRef = useRef(-1); // 当前正在流式追加的 think(思考) step 下标
  const [extRunning, setExtRunning] = useState(null); // 外部(MCP)驱动、本面板没在显示的会话（横幅提示用）
  const mountedRef = useRef(false);
  const selectionRef = useRef({ id: null, revision: 0, claim: null });
  const selectionIntentRef = useRef(0);
  const pendingSelectionIntentRef = useRef(null);
  const configIntentRef = useRef(0);
  const pendingConfigIntentRef = useRef(null);

  function selectCurrentThread(id, reservation = null) {
    selectionRef.current = {
      id,
      revision: selectionRef.current.revision + 1,
      claim: id ? reservation?.claim || null : null,
    };
    setCurrentId(id);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 多窗口预留的 owner token：同一 chrome 窗口内复用（切到别的侧栏再切回=文档重建，但宿主窗口不变）→
  // 重挂载传同一 token → 立即重认领自己那条会话，不受心跳 TTL 影响。取不到宿主窗口则退化为 per-mount 随机
  // token（仍靠引擎侧 TTL 回收过期预留）。修「切栏回来→该会话已在另一窗口打开」。
  const reservationRef = useRef(null);
  if (!reservationRef.current) {
    let host = null;
    try {
      host =
        (typeof window !== "undefined" &&
          (window.browsingContext?.topChromeWindow ||
            window.docShell?.chromeEventHandler?.ownerGlobal)) ||
        null;
    } catch {
      /* 宿主窗口不可达 → 退化 */
    }
    reservationRef.current = createReservationOwner(session, host);
  }

  const refreshThreads = useCallback(async () => {
    if (!conversations) {
      return [];
    }
    const list = await conversations.listThreads();
    setThreads(list);
    return list;
  }, [conversations]);

  // 初始化：载入线程列表，打开最近一个（无则建新）
  useEffect(() => {
    let cancelled = false;
    let pendingOwnedId = null;
    let pendingReservation = null;
    let pendingResumedRunning = false;
    const initialSelection = captureSelectionIntent(selectionRef, selectionIntentRef);
    (async () => {
      try {
        if (!conversations) {
          return;
        }
        if (!hasThreadReservation(session)) {
          throw new Error("多窗口会话预留 API 不完整，已拒绝加载未受保护的会话。");
        }
        const list = await refreshThreads();
        if (cancelled || !sameSelectionIntent(selectionRef, selectionIntentRef, initialSelection)) {
          return;
        }
        // 优先续接本窗口仍在运行的历史，再按更新时间认领空闲历史；其它 owner 的任务会被跳过。
        const existing = await acquirePreferredExistingThread(
          conversations,
          session,
          list.map(thread => thread.id),
          reservationRef.current,
          () => !cancelled && sameSelectionIntent(
            selectionRef,
            selectionIntentRef,
            initialSelection,
          ),
        );
        pendingReservation = existing?.reservation || null;
        pendingOwnedId = existing?.thread?.id || null;
        pendingResumedRunning = existing?.resumedRunning === true;
        let t = existing?.thread || null;
        // acquire helper 返回后会跨一个微任务；绑定前再复核一次，闭合此间启动的外部任务。
        if (t && !existing.resumedRunning && session.isRunning(t.id)) {
          releaseOwnedThread(session, t.id, pendingReservation, true);
          pendingOwnedId = null;
          pendingReservation = null;
          pendingResumedRunning = false;
          t = null;
        }
        if (!t) {
          const created = await createOwnedThread(
            conversations,
            session,
            reservationRef.current,
            () => !cancelled && sameSelectionIntent(
              selectionRef,
              selectionIntentRef,
              initialSelection,
            ),
          );
          t = created.thread;
          pendingReservation = created.reservation;
          pendingOwnedId = t.id;
          pendingResumedRunning = false;
        }
        if (cancelled) {
          releaseOwnedThread(session, t.id, pendingReservation, !pendingResumedRunning);
          pendingOwnedId = null;
          return;
        }
        const keepThread = !cancelled && t && keepOwnedThreadForSelection(
          selectionRef,
          selectionIntentRef,
          initialSelection,
          t,
          session,
          pendingReservation,
          true,
          !pendingResumedRunning,
        );
        pendingOwnedId = null;
        if (keepThread) {
          selectCurrentThread(t.id, pendingReservation);
          setMessages(t.messages || []);
          bindWorkspace(effectiveWorkspace(t));
          setMode((t && t.mode) || null);
          refreshThreads();
        }
      } catch (e) {
        if (pendingOwnedId) {
          releaseOwnedThread(session, pendingOwnedId, pendingReservation, !pendingResumedRunning);
          pendingOwnedId = null;
        }
        if (!cancelled && sameSelectionIntent(selectionRef, selectionIntentRef, initialSelection)) {
          setError("加载历史失败：" + (e?.message || e));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (pendingOwnedId) {
        releaseOwnedThread(session, pendingOwnedId, pendingReservation, !pendingResumedRunning);
        pendingOwnedId = null;
      }
    };
  }, [conversations, refreshThreads, session]);

  // 续看：mount/切线程时若该线程仍在后台跑，置 busy → 启动下面的轮询续看（引擎从未中断）。
  useEffect(() => {
    if (session && currentId && session.isRunning(currentId)) {
      setBusy(true);
    }
  }, [session, currentId]);

  // 多窗口隔离的**预留生命周期 + 心跳**：本侧栏显示 currentId 期间，定时 renew 续约证明本窗口还活着
  // （别的窗口在 TTL 内认领不到这条→不串对话）；切走/关闭时释放。**关键修复**：切到别的插件侧栏时
  // 文档被异常拆除、React unmount 清理常跑不成→旧版预留泄漏→切回报"已在另一窗口打开"。两道兜底：
  // ① 监听 `pagehide`（文档拆除时比 React unmount 更可靠地触发）停止续约；空闲 thread 即时释放，运行中
  // thread 保留不续时的 owner 锚点；② 引擎侧心跳 TTL：任务结束后旧锚点可回收，同窗口可立即重挂载。
  useEffect(() => {
    if (!session || !currentId) {
      return undefined;
    }
    const reservation = reservationRef.current;
    const leaseSelection = { ...selectionRef.current };
    const leaseReservation = reservationForSelection(reservation, leaseSelection);
    let heartbeat = null;
    let recovering = false;
    const recover = async () => {
      if (
        recovering ||
        pendingSelectionIntentRef.current !== null ||
        !sameSelection(selectionRef.current, leaseSelection)
      ) {
        return;
      }
      recovering = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      const recoveryOperation = beginSelectionIntent(
        selectionRef,
        selectionIntentRef,
        pendingSelectionIntentRef,
      );
      const recoveryRevision = selectionRef.current.revision + 1;
      selectionRef.current = { id: null, revision: recoveryRevision, claim: null };
      const recoverySelection = {
        ...selectionRef.current,
        intent: recoveryOperation.intent,
      };
      setCurrentId(current => current === currentId ? null : current);
      setMessages([]);
      setBusy(false);
      resetSteps();
      setActiveTool(null);
      setPendingConfirm(null);
      bindWorkspace(null);
      setMode(null);
      setError("当前会话的窗口预留已失效，正在创建当前窗口的独立会话。");
      try {
        const created = await createOwnedThread(
          conversations,
          session,
          reservation,
          () => mountedRef.current && sameSelectionIntent(
            selectionRef,
            selectionIntentRef,
            recoverySelection,
          ),
        );
        const thread = created.thread;
        if (
          !mountedRef.current ||
          !keepOwnedThreadForSelection(
            selectionRef,
            selectionIntentRef,
            recoverySelection,
            thread,
            session,
            created.reservation,
            true,
            true,
          )
        ) {
          return;
        }
        selectCurrentThread(thread.id, created.reservation);
        bindWorkspace(effectiveWorkspace(thread));
        setMode((thread && thread.mode) || null);
        setError("原会话已由另一个窗口接管，已为当前窗口创建独立会话。");
        refreshThreads();
      } catch (e) {
        if (mountedRef.current && sameSelectionIntent(
          selectionRef,
          selectionIntentRef,
          recoverySelection,
        )) {
          setError("当前会话的窗口预留已失效，且无法创建独立会话：" + (e?.message || e));
        }
      } finally {
        finishSelectionIntent(pendingSelectionIntentRef, recoverySelection);
      }
    };
    const renew = () => {
      if (!sameSelection(selectionRef.current, leaseSelection)) {
        return;
      }
      renewOwnedThread(session, currentId, leaseReservation, () => void recover());
    };
    renew(); // 立即续一次（覆盖 acquire 与首个心跳之间的空窗）
    if (!recovering && session.renewThread) {
      heartbeat = setInterval(renew, 3000);
    }
    const release = () => {
      if (
        !mountedRef.current ||
        selectionRef.current.id !== currentId ||
        sameSelection(selectionRef.current, leaseSelection)
      ) {
        releaseOwnedThread(session, currentId, leaseReservation);
      }
    };
    let win = null;
    try {
      win = typeof window !== "undefined" ? window : null;
    } catch {
      win = null;
    }
    if (win && win.addEventListener) {
      win.addEventListener("pagehide", release);
    }
    return () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (win && win.removeEventListener) {
        win.removeEventListener("pagehide", release);
      }
      release();
    };
  }, [session, currentId, conversations, refreshThreads]);

  // 流式渲染：**内容侧自有定时器轮询**常驻引擎状态来刷 UI。
  // 为何不靠引擎 push(订阅回调)：那是 system→content 跨 realm 的**同步**调用，且发生在引擎那个
  // "贯穿整轮、直到回合结束才结束"的流式任务栈里——React18 会把这些 setState 推迟到该任务结束
  // 才提交，于是整轮不刷新、回复完才一次性蹦出来(实测：整轮文本长度恒定、末尾才跳)。轮询的 setState
  // 发生在 content 自己的 timer 任务里(用完即了)，React 正常按拍提交=真流式。(settle 重载一直 work，
  // 也正因它在 content 的 .then 微任务里。)
  useEffect(() => {
    if (!session || !currentId || !busy) {
      return undefined;
    }
    let disposed = false;
    const effectSelection = { ...selectionRef.current };
    let timer = null;
    let lastCkpt = 0; // 已处理到的 checkpoint 序号（本轮起始为 0）
    const tick = async () => {
      if (disposed || !sameSelection(selectionRef.current, effectSelection)) {
        return;
      }
      const snap = session.getState(currentId);
      if (snap && snap.running) {
        // 上下文压缩落盘了一条 checkpoint 回复 → 从 store 重载历史(新气泡出现)，live 区随即显示新段。
        if ((snap.checkpointSeq || 0) > lastCkpt) {
          lastCkpt = snap.checkpointSeq;
          conversations
            .getThread(currentId)
            .then(t => {
              if (!disposed && sameSelection(selectionRef.current, effectSelection) && t) {
                setMessages(t.messages);
              }
            })
            .catch(() => {});
        }
        setLiveSteps(snap.steps);
        stepsRef.current = snap.steps;
        const rt = [...snap.steps].reverse().find(x => x.kind === "tool" && x.status === "running");
        setActiveTool(rt ? rt.name : null);
        if (snap.pendingConfirm) {
          const pc = snap.pendingConfirm;
          setPendingConfirm(prev =>
            prev && prev.call && prev.call.id === pc.id
              ? prev
              : { call: pc, resolve: (ok, all) => session.respondConfirm(currentId, pc.id, ok, all) }
          );
        } else {
          setPendingConfirm(prev => (prev ? null : prev));
        }
      } else if (snap && snap.settled) {
        // 回合结束：引擎已把最终/中断消息落盘 → 重载历史 + 收尾。
        let t = null;
        try {
          t = await conversations.getThread(currentId);
        } catch {
          /* 最终历史读取失败不阻塞状态收口 */
        }
        if (disposed || !sameSelection(selectionRef.current, effectSelection)) {
          return;
        }
        if (snap.error) {
          setError(snap.error);
        }
        if (t) {
          setMessages(t.messages);
        }
        setLiveSteps([]);
        stepsRef.current = [];
        curTextRef.current = -1;
        curThinkRef.current = -1;
        setActiveTool(null);
        setPendingConfirm(null);
        setBusy(false);
        refreshThreads();
        return;
      }
      timer = setTimeout(() => void tick(), 80); // ~12 拍/秒：流式够顺、开销低
    };
    timer = setTimeout(() => void tick(), 0);
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [session, currentId, busy, conversations, refreshThreads]);

  // ── 外部 / MCP 驱动可见性（当前线程自愈续看 + 其它窗口提示）──
  // ① 自愈：本面板已停在某条「引擎在跑」的会话（如 MCP 刚 createThread+run、挂载那刻 isRunning 还是
  //    false 没进 busy）却没开流式 → 这里补开 busy（启「续看」轮询）+ 异步补绑工作目录（治"已在 MCP
  //    会话上但界面静止、📁 没目录"——用户实测撞到的）。② 其它 thread 只提示其在原窗口运行；
  //    不尝试认领，避免破坏同 thread 的窗口独占。listRunning 是进程内 Map 遍历、开销极小。
  useEffect(() => {
    if (!session || !session.listRunning) {
      return undefined;
    }
    let timer = null;
    let stopped = false;
    let lastRunKey = "";
    const tick = async () => {
      try {
        if (stopped || selectionRef.current.id !== currentId) {
          return;
        }
        const observedSelection = { ...selectionRef.current };
        const running = session.listRunning() || [];
        // ① 自愈：停在一条在跑的会话却没 busy → 补绑目录 + 补开流式
        if (currentId && !busy && running.some(r => r.id === currentId)) {
          try {
            const t = await conversations.getThread(currentId);
            if (stopped || !sameSelection(selectionRef.current, observedSelection)) {
              return;
            }
            if (t) {
              bindWorkspace(effectiveWorkspace(t));
              setMode((t && t.mode) || null);
            }
          } catch (_e) { /* ignore */ }
          if (stopped || !sameSelection(selectionRef.current, observedSelection)) {
            return;
          }
          setBusy(true); // 启「续看」流式轮询 useEffect（deps 含 busy）
        }
        const others = running.filter(r => r && r.id && r.id !== currentId);
        const runKey = others.map(r => r.id).sort().join(",");
        if (runKey !== lastRunKey) {
          lastRunKey = runKey;
          if (others.length) {
            refreshThreads(); // 仅当「别的在跑会话集合」变了才刷列表，避免每 1.5s 无谓 setState
          }
        }
        if (stopped || !sameSelection(selectionRef.current, observedSelection)) {
          return;
        }
        if (!others.length) {
          setExtRunning(null);
        } else {
          setExtRunning(others[0]);
        }
      } catch (_e) { /* 探测失败不影响面板 */ }
      if (!stopped) {
        timer = setTimeout(tick, 1500);
      }
    };
    timer = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [session, currentId, busy, refreshThreads, conversations]);

  // 自动跟随最新回复：仅当用户贴在底部时才滚到底（含流式 liveSteps 增长）；
  // 用户手动上滑离开底部 → 不再打扰；滑回底部 → 恢复跟随。
  function onListScroll() {
    const el = listRef.current;
    if (el) {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    }
  }
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, busy, liveSteps]);

  async function ensureThread() {
    if (!mountedRef.current) {
      throw new Error("Agent 面板已关闭，已停止会话操作。");
    }
    if (pendingSelectionIntentRef.current !== null) {
      throw new Error("正在切换会话，请稍后重试。");
    }
    let operationSelection = captureSelectionIntent(selectionRef, selectionIntentRef);
    let ownsSelectionIntent = false;
    let reservationLost = false;
    try {
      if (operationSelection.id && ownsSelectedThreadForIntent(
        session,
        selectionRef,
        selectionIntentRef,
        operationSelection,
        reservationForSelection(reservationRef.current, operationSelection),
      )) {
        return { id: operationSelection.id, reservationLost: false, selection: operationSelection };
      }
      if (!sameSelectionIntent(selectionRef, selectionIntentRef, operationSelection)) {
        throw new Error("会话选择意图已变化，已停止旧操作。");
      }
      operationSelection = beginSelectionIntent(
        selectionRef,
        selectionIntentRef,
        pendingSelectionIntentRef,
      );
      ownsSelectionIntent = true;
      if (operationSelection.id) {
        selectCurrentThread(null);
        operationSelection = captureSelectionIntent(selectionRef, selectionIntentRef);
        reservationLost = true;
      }

      const created = await createOwnedThread(
        conversations,
        session,
        reservationRef.current,
        () => mountedRef.current && sameSelectionIntent(
          selectionRef,
          selectionIntentRef,
          operationSelection,
        ),
      );
      const t = created.thread;
      if (!mountedRef.current) {
        releaseOwnedThread(session, t.id, created.reservation, true);
        throw new Error("Agent 面板已关闭，已释放迟到的新会话。");
      }
      if (!keepOwnedThreadForSelection(
        selectionRef,
        selectionIntentRef,
        operationSelection,
        t,
        session,
        created.reservation,
        true,
        true,
      )) {
        throw new Error("会话选择已变化，已释放迟到的新会话。");
      }
      selectCurrentThread(t.id, created.reservation);
      const selected = captureSelectionIntent(selectionRef, selectionIntentRef);
      if (reservationLost) {
        setMessages([]);
        setBusy(false);
        resetSteps();
        setActiveTool(null);
        setPendingConfirm(null);
      }
      bindWorkspace(effectiveWorkspace(t));
      setMode((t && t.mode) || null);
      return { id: t.id, reservationLost, selection: selected };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      error.selection = operationSelection;
      throw error;
    } finally {
      if (ownsSelectionIntent) {
        finishSelectionIntent(pendingSelectionIntentRef, operationSelection);
      }
    }
  }

  // ---- 工作目录：绑定到当前会话；**新会话默认不绑定目录**（为空，需用户手动「打开目录」）----
  // 只认会话自己持久化的 workspace，不再回退到任何"全局默认目录"。
  function effectiveWorkspace(t) {
    return (t && t.workspace) || null;
  }
  function bindWorkspace(path) {
    setWorkspaceDir(path || null);
    try {
      workspace && workspace.setRoot && workspace.setRoot(path || null);
    } catch {
      /* ignore */
    }
    if (path) {
      refreshFiles(path);
    } else {
      setFiles([]);
    }
  }
  async function refreshFiles(rootOverride) {
    const root = rootOverride ?? workspaceDir;
    if (!workspace || !workspace.list || !root) {
      setFiles([]);
      return;
    }
    try {
      // 按**本线程**的目录列文件（ctx 传 workspaceRoot，不用全局单例）→ 多窗口文件面板各看各的，不互串。
      const r = await workspace.list({ depth: 2 }, { workspaceRoot: root });
      setFiles((r && r.entries) || []);
    } catch {
      setFiles([]);
    }
  }
  // 用户选目录：绑定 + 仅持久化到**当前会话**（不再记为全局默认 → 新会话保持为空）
  async function setWorkspaceForThread(path) {
    const configIntent = beginThreadConfigIntent(configIntentRef, pendingConfigIntentRef);
    const workspaceSelection = captureSelectionIntent(selectionRef, selectionIntentRef);
    const workspaceReservation = reservationForSelection(reservationRef.current, workspaceSelection);
    try {
      if (workspaceSelection.id) {
        await setOwnedThreadWorkspace(
          conversations,
          workspaceSelection.id,
          path || null,
          () => sameThreadConfigIntent(configIntentRef, configIntent) &&
            ownsSelectedThreadForIntent(
              session,
              selectionRef,
              selectionIntentRef,
              workspaceSelection,
              workspaceReservation,
            ),
        );
        if (sameThreadConfigIntent(configIntentRef, configIntent) &&
            sameSelectionIntent(selectionRef, selectionIntentRef, workspaceSelection)) {
          bindWorkspace(path);
        }
      }
      refreshThreads();
    } catch {
      /* ignore */
    } finally {
      finishThreadConfigIntent(pendingConfigIntentRef, configIntent);
    }
  }
  function directoryPathFromPicker(fp) {
    let f = fp && fp.file;
    if (!f) {
      return null;
    }
    try {
      if (f.isDirectory && !f.isDirectory() && f.parent) {
        f = f.parent;
      }
    } catch {
      if (f.parent) {
        f = f.parent;
      }
    }
    return (f && f.path) || null;
  }
  function pickDirectory() {
    try {
      if (!_CC || !_CI || !_SVC) {
        setError("无法打开目录选择器（特权 API 不可用）");
        return;
      }
      const win = _SVC.wm.getMostRecentWindow("navigator:browser");
      const fp = _CC["@mozilla.org/filepicker;1"].createInstance(_CI.nsIFilePicker);
      fp.init(win.browsingContext, "选择工作目录", _CI.nsIFilePicker.modeGetFolder);
      fp.open(rv => {
        if (rv === _CI.nsIFilePicker.returnOK) {
          const path = directoryPathFromPicker(fp);
          if (path) {
            setWorkspaceForThread(path);
          }
        }
      });
    } catch (e) {
      setError("打开目录失败：" + (e?.message || e));
    }
  }
  function revealDir() {
    try {
      if (!_CC || !_CI || !workspaceDir) {
        return;
      }
      const f = _CC["@mozilla.org/file/local;1"].createInstance(_CI.nsIFile);
      f.initWithPath(workspaceDir);
      f.reveal();
    } catch {
      /* ignore */
    }
  }

  // ---- 过程步骤（思考流程）累积，避免流式正文被下一轮覆盖 ----
  function commitSteps(arr) {
    stepsRef.current = arr;
    setLiveSteps(arr);
  }
  function resetSteps() {
    stepsRef.current = [];
    curTextRef.current = -1;
    curThinkRef.current = -1;
    setLiveSteps([]);
  }
  function onStreamDelta(chunk) {
    const arr = stepsRef.current;
    const i = curTextRef.current;
    if (i >= 0 && arr[i] && arr[i].kind === "text") {
      const copy = arr.slice();
      copy[i] = { ...copy[i], text: copy[i].text + chunk };
      commitSteps(copy);
    } else {
      const copy = [...arr, { kind: "text", text: chunk }];
      curTextRef.current = copy.length - 1;
      curThinkRef.current = -1; // 正文开始 → 思考段落结束
      commitSteps(copy);
    }
  }
  // 思考型模型(v4-pro)的 reasoning_content 增量 → 累积成可见的「💭 思考」段
  function onReasoning(chunk) {
    const arr = stepsRef.current;
    const i = curThinkRef.current;
    if (i >= 0 && arr[i] && arr[i].kind === "think") {
      const copy = arr.slice();
      copy[i] = { ...copy[i], text: copy[i].text + chunk };
      commitSteps(copy);
    } else {
      const copy = [...arr, { kind: "think", text: chunk }];
      curThinkRef.current = copy.length - 1;
      curTextRef.current = -1;
      commitSteps(copy);
    }
  }
  function summarizeEnv(env) {
    if (!env) return "";
    if (!env.ok) return (env.error ? String(env.error) : "失败").slice(0, 80);
    const d = env.data;
    if (d == null) return "ok";
    if (typeof d === "object") {
      for (const k of ["count", "savedCount", "total", "enabled", "requests", "hits", "records", "urls"]) {
        if (d[k] != null) {
          return k + "=" + (Array.isArray(d[k]) ? d[k].length : JSON.stringify(d[k]).slice(0, 40));
        }
      }
      return "ok";
    }
    return String(d).slice(0, 60);
  }
  function onTurnEvent(ev) {
    if (ev.type === "round") {
      curTextRef.current = -1; // 新一轮 → 下一段流式正文另起一个 step（不覆盖上一轮）
      curThinkRef.current = -1;
    } else if (ev.type === "tool_call") {
      setActiveTool(ev.name);
      commitSteps([...stepsRef.current, { kind: "tool", id: ev.id, name: ev.name, status: "running" }]);
      curTextRef.current = -1;
      curThinkRef.current = -1;
    } else if (ev.type === "tool_result") {
      const arr = stepsRef.current.slice();
      const idx = arr.findIndex(s => s.kind === "tool" && s.id === ev.id && s.status === "running");
      if (idx >= 0) {
        const imgs =
          ev.env && Array.isArray(ev.env.media)
            ? ev.env.media.filter(m => m && m.type === "image" && m.dataUrl).map(m => m.dataUrl)
            : null;
        arr[idx] = {
          ...arr[idx],
          status: ev.env && ev.env.ok ? "ok" : "err",
          summary: summarizeEnv(ev.env),
          ...(imgs && imgs.length ? { images: imgs } : {}),
        };
        commitSteps(arr);
      }
      setActiveTool(null);
    } else if (ev.type === "final" || ev.type === "max_rounds") {
      setActiveTool(null);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    if (!hasThreadReservation(session) || !router) {
      setError("多窗口会话预留或 Agent 运行接口不可用，已拒绝发送。");
      return;
    }
    if (pendingSelectionIntentRef.current !== null) {
      setError("正在切换会话，请稍后重试。");
      return;
    }
    if (pendingConfigIntentRef.current !== null) {
      setError("正在修改会话配置，请稍后重试。");
      return;
    }
    setError(null);
    const userMsg = { role: "user", content: text };
    setInput("");
    resetSteps();
    atBottomRef.current = true; // 发送即贴底，跟随本次回复
    autoApproveRef.current = false;
    let sendSelection = captureSelectionIntent(selectionRef, selectionIntentRef);
    const commitState = { started: false };
    try {
      const ensured = await ensureThread();
      sendSelection = ensured.selection;
      if (ensured.reservationLost) {
        throw new Error("原会话已由另一个窗口接管，已为当前窗口创建独立会话，请重新发送。");
      }
      const tid = ensured.id;
      const sendReservation = reservationForSelection(reservationRef.current, sendSelection);
      const ensureStillOwned = () => {
        if (!mountedRef.current ||
            !ownsSelectedThreadForIntent(
              session,
              selectionRef,
              selectionIntentRef,
              sendSelection,
              sendReservation,
            )) {
          throw new Error("当前会话的窗口预留已失效，已停止发送且未启动任务，请重新发送。");
        }
      };
      ensureStillOwned();
      if (pendingConfigIntentRef.current !== null) {
        throw new Error("会话配置正在变化，已停止发送且未启动任务，请重新发送。");
      }
      const sendConfigIntent = captureThreadConfigIntent(configIntentRef);
      const canUseSendConfig = thread => {
        try {
          ensureStillOwned();
          return pendingConfigIntentRef.current === null &&
            sameThreadConfigIntent(configIntentRef, sendConfigIntent) &&
            !!thread;
        } catch {
          return false;
        }
      };
      // 模式注入：未选过 → 落定全自动（与"全自动就是当前模式"一致，并持久化，之后不再弹选择卡）。
      // 只在线性化点仍为空且配置代际未变化时写默认值；并发的用户选择优先。
      try {
        await setOwnedThreadMode(
          conversations,
          tid,
          "auto",
          thread => thread.mode == null && canUseSendConfig(thread),
        );
      } catch {
        // 已有模式、并发配置或落盘失败都交给下面的权威读取和 guard 判定。
      }
      const prepared = await prepareOwnedThreadRunConfig(
        conversations,
        tid,
        notes,
        thread => canUseSendConfig(thread),
      );
      const { digest: dg, runConfig } = prepared;
      setMode(runConfig.mode);
      let sys = runConfig.workspace
        ? SYSTEM +
          `\n\n【当前工作目录】${runConfig.workspace}\n用 fs_list/fs_read/fs_write 读写其中文件、run_node/run_python 在此目录执行脚本验证；jsvmp trace 自动镜像到其 jsvmp/ 子目录。把抓取的脚本、还原出的实现、笔记都存到这里。`
        : SYSTEM +
          `\n\n【当前工作目录】未设置。若任务需要读写文件或执行脚本，请提示用户点击侧边栏顶部「打开目录」选择一个本地目录。`;
      sys += "\n\n【浏览器环境】环境隔离、指纹配置和 MCP 指定环境由 env_* 工具链处理；Agent 对话页不做环境选择。";
      sys += runConfig.mode === "assist" ? ASSIST_BLOCK : AUTO_BLOCK;
      if (dg) {
        sys += `\n\n${dg}`;
      }
      const confirmMode = !!(store && store.getConfirmTools && store.getConfirmTools());
      await commitOwnedUserMessage(
        conversations,
        session,
        tid,
        userMsg,
        {
          systemPrompt: sys,
          confirmMode,
          assist: runConfig.mode === "assist",
          maxRounds: 80,
          maxPerTool: 40,
          workspaceRoot: runConfig.workspace,
          win: (typeof window !== "undefined" && window.browsingContext && window.browsingContext.topChromeWindow) || null,
        },
        thread => {
          try {
            ensureStillOwned();
            return pendingConfigIntentRef.current === null &&
              sameThreadConfigIntent(configIntentRef, sendConfigIntent) &&
              sameThreadRunConfig(thread, runConfig);
          } catch {
            return false;
          }
        },
        thread => {
          setMessages([...thread.messages]);
          setBusy(true);
        },
        commitState,
      );
    } catch (e) {
      if (!commitState.started) {
        setInput(current => restoreUnsentInput(current, text));
      }
      const errorSelection = e && e.selection ? e.selection : sendSelection;
      if (sameSelectionIntent(selectionRef, selectionIntentRef, errorSelection)) {
        setError((e?.message || String(e)) + (e?.body ? "\n— " + String(e.body).slice(0, 600) : ""));
        if (!commitState.started) {
          setBusy(false);
        }
      }
    }
  }

  // 「停止」按钮：让常驻引擎中断本回合（轮次边界 + 进行中的 LLM 请求都会停）。
  function stopRun() {
    try {
      if (session && currentId) {
        session.stop(currentId);
      } else if (abortRef.current) {
        abortRef.current.abort();
      }
    } catch {
      /* ignore */
    }
  }

  async function newChat() {
    const expectedSelection = beginSelectionIntent(
      selectionRef,
      selectionIntentRef,
      pendingSelectionIntentRef,
    );
    try {
      const created = await createOwnedThread(
        conversations,
        session,
        reservationRef.current,
        () => mountedRef.current && sameSelectionIntent(
          selectionRef,
          selectionIntentRef,
          expectedSelection,
        ),
      );
      const t = created.thread;
      if (!mountedRef.current) {
        releaseOwnedThread(session, t.id, created.reservation, true);
        return;
      }
      if (!keepOwnedThreadForSelection(
        selectionRef,
        selectionIntentRef,
        expectedSelection,
        t,
        session,
        created.reservation,
        true,
        true,
      )) {
        return;
      }
      selectCurrentThread(t.id, created.reservation);
      setMessages([]);
      setError(null);
      setShowHistory(false);
      bindWorkspace(effectiveWorkspace(t));
      setMode(null); // 新会话未选模式 → 空状态里弹「全自动 / AI辅助」选择卡
      // 清掉上一条会话的「正在跑」实时显示（busy/liveSteps/活动工具/确认）——否则旧会话还在后台跑时
      // 一点新建，新会话会赖着上一个 agent 的实时界面（旧引擎不中断、继续后台跑，切回去即续看）。
      setBusy(false);
      resetSteps();
      setActiveTool(null);
      setPendingConfirm(null);
      refreshThreads();
    } catch (e) {
      if (mountedRef.current && sameSelectionIntent(
        selectionRef,
        selectionIntentRef,
        expectedSelection,
      )) {
        setError(e?.message || String(e));
      }
    } finally {
      finishSelectionIntent(pendingSelectionIntentRef, expectedSelection);
    }
  }

  // 选模式：按会话持久化（一选定整条会话沿用，除非用户再点切换）。在 fresh 线程上选时先 ensureThread 落地线程。
  async function chooseMode(m) {
    const configIntent = beginThreadConfigIntent(configIntentRef, pendingConfigIntentRef);
    try {
      const { id: tid, selection } = await ensureThread();
      const selectionReservation = reservationForSelection(reservationRef.current, selection);
      if (!ownsSelectedThreadForIntent(
        session,
        selectionRef,
        selectionIntentRef,
        selection,
        selectionReservation,
      )) {
        throw new Error("当前会话的窗口预留已失效，未修改执行模式。");
      }
      await setOwnedThreadMode(
        conversations,
        tid,
        m,
        () => sameThreadConfigIntent(configIntentRef, configIntent) &&
          ownsSelectedThreadForIntent(
            session,
            selectionRef,
            selectionIntentRef,
            selection,
            selectionReservation,
          ),
      );
      if (sameThreadConfigIntent(configIntentRef, configIntent) &&
          sameSelectionIntent(selectionRef, selectionIntentRef, selection)) {
        setMode(m);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      finishThreadConfigIntent(pendingConfigIntentRef, configIntent);
    }
  }
  // 顶部 chip：手动切换模式（全自动 ⇄ AI辅助），随时可改。
  function toggleMode() {
    chooseMode(mode === "assist" ? "auto" : "assist");
  }

  async function openThread(id) {
    const expectedSelection = beginSelectionIntent(
      selectionRef,
      selectionIntentRef,
      pendingSelectionIntentRef,
    );
    let acquiredTarget = false;
    let targetReservation = null;
    let targetResumedRunning = false;
    let targetBound = false;
    try {
      if (!hasThreadReservation(session)) {
        setError("多窗口会话预留 API 不完整，已拒绝打开历史会话。");
        setShowHistory(false);
        return;
      }
      // 切到历史会话：先认领；若已被**别的窗口**打开 → 不切、提示（避免两窗口绑同一条线程串对话）。切回当前条不用认领。
      acquiredTarget = id !== expectedSelection.id;
      targetReservation = acquiredTarget
        ? null
        : reservationForSelection(reservationRef.current, expectedSelection);
      let t = null;
      if (acquiredTarget) {
        const existing = await acquirePreferredExistingThread(
          conversations,
          session,
          [id],
          reservationRef.current,
          () => mountedRef.current && sameSelectionIntent(
            selectionRef,
            selectionIntentRef,
            expectedSelection,
          ),
        );
        if (!existing) {
          setError("该会话已在另一个浏览器窗口打开，不能在此窗口同时打开（避免对话串）。");
          setShowHistory(false);
          return;
        }
        t = existing.thread;
        targetReservation = existing.reservation;
        targetResumedRunning = existing.resumedRunning === true;
      } else if (!ownsSelectedThreadForIntent(
        session,
        selectionRef,
        selectionIntentRef,
        expectedSelection,
        targetReservation,
      )) {
        setError("当前会话的窗口预留已失效，无法重新打开该会话。");
        setShowHistory(false);
        return;
      } else {
        t = await conversations.getThread(id);
      }
      // helper 返回后还会跨一个微任务；只有精确重挂载的 running thread 可以继续绑定。
      if (acquiredTarget && !targetResumedRunning && session.isRunning(id)) {
        setError("该任务已在原窗口运行，不能在此窗口接管。");
        setShowHistory(false);
        return;
      }
      if (!mountedRef.current) {
        if (acquiredTarget) {
          releaseOwnedThread(session, id, targetReservation, !targetResumedRunning);
        }
        return;
      }
      if (!sameSelectionIntent(selectionRef, selectionIntentRef, expectedSelection)) {
        return;
      }
      if (!t) {
        if (acquiredTarget) {
          releaseOwnedThread(session, id, targetReservation, !targetResumedRunning);
        }
        setError("历史会话不存在或已被删除。");
        setShowHistory(false);
        return;
      }
      if (!acquiredTarget && !renewOwnedThread(session, id, targetReservation, () => {})) {
        setError("该会话的窗口预留已失效，无法打开。");
        setShowHistory(false);
        return;
      }
      if (acquiredTarget) {
        selectCurrentThread(t.id, targetReservation);
        targetBound = true;
      }
      setMessages(t.messages);
      setError(null);
      bindWorkspace(effectiveWorkspace(t));
      setMode((t && t.mode) || null);
      // 切线程：先清掉上一条会话的实时显示，再按**目标线程**是否在后台跑同步 busy——
      // 切到没在跑的会话要清掉旧的"正在跑"界面；切到仍在后台跑的会话则续看。
      resetSteps();
      setActiveTool(null);
      setPendingConfirm(null);
      setBusy(!!(session && session.isRunning && session.isRunning(t.id)));
      setShowHistory(false);
    } catch (e) {
      if (mountedRef.current && sameSelectionIntent(
        selectionRef,
        selectionIntentRef,
        expectedSelection,
      )) {
        setError("打开历史会话失败：" + (e?.message || e));
        setShowHistory(false);
      }
    } finally {
      if (acquiredTarget && !targetBound) {
        releaseOwnedThread(session, id, targetReservation, !targetResumedRunning);
      }
      finishSelectionIntent(pendingSelectionIntentRef, expectedSelection);
    }
  }

  async function deleteThread(id, ev) {
    ev.stopPropagation();
    const deleteSelection = beginSelectionIntent(
      selectionRef,
      selectionIntentRef,
      pendingSelectionIntentRef,
    );
    try {
      const currentSelection = captureSelectionIntent(selectionRef, selectionIntentRef);
      await deleteThreadForSelection(conversations, session, id, reservationRef.current, currentSelection);
      const list = await refreshThreads();
      if (!sameSelectionIntent(selectionRef, selectionIntentRef, deleteSelection)) {
        return;
      }
      if (id === currentId) {
        if (list.length > 0) {
          openThread(list[0].id);
        } else {
          newChat();
        }
      }
    } catch (e) {
      if (sameSelectionIntent(selectionRef, selectionIntentRef, deleteSelection)) {
        setError("删除历史会话失败：" + (e?.message || e));
      }
    } finally {
      finishSelectionIntent(pendingSelectionIntentRef, deleteSelection);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    // hidden 时只用 display:none 隐藏（保持挂载）：打开设置不卸载本面板，
    // 进行中的回合(busy/liveSteps/abortRef/正在跑的 send)不丢，返回后继续可见。
    // 内联 display:none 以盖过 .agent-panel{display:flex} 的 CSS 优先级。
    <div className="agent-panel" style={hidden ? { display: "none" } : undefined}>
      <header className="agent-panel__bar">
        <span className="agent-panel__title" title={TITLE}>
          <span className="agent-panel__logo" aria-hidden="true" />
          {TITLE}
        </span>
        <span className="agent-panel__actions">
          <button type="button" onClick={() => setShowHistory(v => !v)} title="历史对话" aria-label="历史对话">{ICONS.history}</button>
          <button type="button" onClick={newChat} title="新对话" aria-label="新对话">{ICONS.plus}</button>
          <button type="button" className="agent-panel__envButton" onClick={onOpenEnvironment} title="环境管理" aria-label="环境管理">
            {ICONS.env}
            <span>环境管理</span>
          </button>
          <button type="button" onClick={onOpenSettings} title="设置" aria-label="设置">{ICONS.gear}</button>
        </span>
      </header>

      {extRunning && (
        <button
          type="button"
          onClick={() => { setExtRunning(null); newChat(); }}
          title="该任务在原窗口运行；点击在当前窗口新建独立任务"
          style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid rgba(106,140,255,0.3)", background: "rgba(106,140,255,0.15)", color: "#6a8cff", padding: "6px 12px", cursor: "pointer", fontSize: "12px" }}
        >
          ⚡ 该任务在原窗口运行（{extRunning.nSteps} 步）· 点击新建当前窗口任务
        </button>
      )}

      <div className="agent-ws">
        <button
          type="button"
          className={`agent-ws__open ${workspaceDir ? "is-set" : ""}`}
          onClick={pickDirectory}
          title={workspaceDir ? "工作目录：" + workspaceDir + "（点击切换）" : "选择一个本地目录作为该会话的工作目录（文件读写 / 执行脚本 / trace 都落这里）"}
        >
          <span aria-hidden="true">📁</span>
          <span className="agent-ws__path">{workspaceDir ? shortPath(workspaceDir) : "打开目录"}</span>
        </button>
        <button
          type="button"
          className={`agent-ws__mode is-${mode || "unset"}`}
          onClick={toggleMode}
          title={
            mode === "assist"
              ? "AI辅助模式：逐阶段停下跟你讨论选方向（点击切到全自动）"
              : mode === "auto"
              ? "全自动模式：一条龙跑到底（点击切到AI辅助）"
              : "点击选择执行模式（全自动 / AI辅助）"
          }
        >
          <span className="agent-ws__mode-ico" aria-hidden="true">
            {mode === "assist" ? ICONS.modeAssist : mode === "auto" ? ICONS.modeAuto : ICONS.modeUnset}
          </span>
          <span>{mode === "assist" ? "AI辅助" : mode === "auto" ? "全自动" : "选模式"}</span>
        </button>
        {workspaceDir && (
          <span className="agent-ws__tools">
            <button
              type="button"
              className="agent-ws__btn"
              onClick={() => {
                if (!filesOpen) {
                  refreshFiles();
                }
                setFilesOpen(v => !v);
              }}
              title="查看工作目录文件"
            >
              {filesOpen ? "▾" : "▸"} 文件{files.length ? `(${files.length})` : ""}
            </button>
            <button type="button" className="agent-ws__btn" onClick={revealDir} title="在访达中显示">↗</button>
          </span>
        )}
      </div>
      {filesOpen && workspaceDir && (
        <div className="agent-ws__files">
          {files.length === 0 ? (
            <div className="agent-ws__empty">（空目录）</div>
          ) : (
            files.map((f, i) => (
              <div key={i} className={`agent-ws__file is-${f.type}`} title={f.path}>
                <span aria-hidden="true">{f.type === "dir" ? "📂" : "📄"}</span>
                <span className="agent-ws__fpath">{f.path}</span>
                {f.size != null && <span className="agent-ws__fsize">{fmtSize(f.size)}</span>}
              </div>
            ))
          )}
          <button type="button" className="agent-ws__refresh" onClick={() => refreshFiles()}>刷新</button>
        </div>
      )}

      {showHistory && (
        <div className="agent-history">
          <div className="agent-history__head">
            <span>历史对话（{threads.length}）</span>
            <button type="button" onClick={() => setShowHistory(false)} title="关闭">×</button>
          </div>
          <div className="agent-history__list">
            {threads.length === 0 && <div className="agent-history__empty">暂无历史</div>}
            {threads.map(t => (
              <div
                key={t.id}
                className={`agent-history__item ${t.id === currentId ? "is-current" : ""}`}
                onClick={() => openThread(t.id)}
                title={t.title}
              >
                <div className="agent-history__item-main">
                  <div className="agent-history__item-title">{t.title}</div>
                  <div className="agent-history__item-meta">{fmtTime(t.updatedAt)} · {t.count} 条</div>
                </div>
                <button type="button" className="agent-history__del" onClick={ev => deleteThread(t.id, ev)} title="删除对话">{ICONS.close}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="agent-panel__messages" ref={listRef} onScroll={onListScroll}>
        {messages.length === 0 && (
          <div className="agent-panel__empty">
            {!mode && (
              <div className="agent-mode-pick">
                <div className="agent-mode-pick__title">这个会话怎么跟我配合？</div>
                <button type="button" className="agent-mode-pick__opt" onClick={() => chooseMode("auto")}>
                  <span className="agent-mode-pick__head"><span className="agent-mode-pick__ico" aria-hidden="true">{ICONS.modeAuto}</span>全自动</span>
                  <span className="agent-mode-pick__desc">给我目标接口/参数，我一条龙自主搞定（侦察→定位→验证→补环境→实打），中途不打扰你。</span>
                </button>
                <button type="button" className="agent-mode-pick__opt" onClick={() => chooseMode("assist")}>
                  <span className="agent-mode-pick__head"><span className="agent-mode-pick__ico" aria-hidden="true">{ICONS.modeAssist}</span>AI辅助</span>
                  <span className="agent-mode-pick__desc">我先给方案，之后每做完一个阶段（入口定位 / 字节trace / DOM-API trace / 构造实现）就停下汇报、给你方向选项，你来选、逐步推进。</span>
                </button>
                <div className="agent-mode-pick__hint">选完仍可随时点顶部模式标切换。</div>
              </div>
            )}
            {mode && <>问点什么开始……</>}
            {toolNames.length > 0 && (
              <div className="agent-panel__tools-hint">
                已接入 {toolNames.length} 个工具：执行JS / 网络捕获 / 存JS / 搜索 / 定位入口 / jsvmp
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role}`}>
            <div className="msg__role">{m.role === "user" ? "你" : "Agent助手"}</div>
            {m.role === "assistant" ? (
              <AssistantBody steps={m.steps} content={m.content} />
            ) : (
              <div className="msg__content">{m.content}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg msg--assistant">
            <div className="msg__role">Agent助手</div>
            {liveSteps.length > 0 ? (
              <div className="msg__content msg__content--live">
                <StepList steps={liveSteps} live />
              </div>
            ) : (
              <div className="msg__content msg--pending">
                {activeTool ? `…调用工具 ${activeTool}` : "…思考中"}
              </div>
            )}
          </div>
        )}
      </div>

      {pendingConfirm && (
        <div className="agent-confirm">
          <span className="agent-confirm__msg">
            Agent 要调用工具 <b>{pendingConfirm.call.name}</b>，允许？
          </span>
          <span className="agent-confirm__btns">
            <button type="button" onClick={() => { pendingConfirm.resolve(true); setPendingConfirm(null); }}>批准</button>
            <button type="button" onClick={() => { pendingConfirm.resolve(false); setPendingConfirm(null); }}>拒绝</button>
            <button
              type="button"
              title="本次及以后都不再询问（关闭确认模式，可在设置里重新开启）"
              onClick={() => {
                autoApproveRef.current = true; // 本回合后续工具不再询问
                if (store && store.setConfirmTools) {
                  store.setConfirmTools(false); // 持久关闭，下次启动也不问
                }
                pendingConfirm.resolve(true, true); // all=true → 引擎本轮后续工具自动批准
                setPendingConfirm(null);
              }}
            >
              总是允许
            </button>
          </span>
        </div>
      )}

      {error && <div className="agent-panel__error">⚠ {error}</div>}

      <div className="agent-panel__input">
        <textarea
          value={input}
          placeholder={busy ? "执行中…可继续输入，停止后或本轮结束再发送" : "输入消息，Enter 发送，Shift+Enter 换行"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        {busy ? (
          <button type="button" className="agent-panel__stop" onClick={stopRun} title="停止自主执行">
            停止
          </button>
        ) : (
          <button type="button" onClick={send} disabled={!input.trim()}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
