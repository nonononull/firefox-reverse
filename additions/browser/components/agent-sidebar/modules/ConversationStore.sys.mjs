/* ConversationStore.sys.mjs — Agent 多线程对话历史持久化。
 *
 * - Firefox：落盘到 profile 下 <profile>/firefox-reverse-agent/conversations.json
 *   （用 IOUtils/PathUtils，system ESM 全局可用）。比 prefs 更适合大体量历史。
 * - Node 自测：无 IOUtils → 退化为内存，仍可 import 验证。
 * 全部 API 异步。数据结构：{ threads: [{ id, title, createdAt, updatedAt, workspace, envId, modelStrategy, messages:[{role,content}] }] }
 *   workspace = 该会话绑定的本地工作目录绝对路径（null=未设；**新会话默认为空/不绑定**，需用户手动打开目录）。
 *   envId = 该会话准备使用的 Firefox-Reverse 环境 id（null=未选）。
 *   modelStrategy = "balanced" | "premium"，先作为 Agent 调度上下文，后续可映射到具体 provider/model。
 */

const DIR_NAME = "firefox-reverse-agent";
const FILE_NAME = "conversations.json";
const NEW_TITLE = "新对话";

function requireAuthorization(guard, operation, id, value) {
  if (typeof guard !== "function") {
    throw new Error(`conversation ${operation} requires an ownership guard: ${id}`);
  }
  if (guard(value) !== true) {
    throw new Error(`conversation ${operation} authorization lost: ${id}`);
  }
}

function hasIO() {
  return typeof IOUtils !== "undefined" && typeof PathUtils !== "undefined";
}

// 单调递增时间戳：保证连续操作（同一毫秒内）也严格递增 → 列表排序确定。
let _clock = 0;
function nextTs() {
  _clock = Math.max(Date.now(), _clock + 1);
  return _clock;
}

export class ConversationStore {
  constructor(opts = {}) {
    this._mem = null; // { threads: [...] }
    this._path = opts.path || null;
    this._memoryOnly = opts.memoryOnly ?? !hasIO();
    this._creatingIds = new Set();
  }

  get isPersistent() {
    return !this._memoryOnly;
  }

  async _filePath() {
    if (this._path) {
      return this._path;
    }
    const dir = PathUtils.join(PathUtils.profileDir, DIR_NAME);
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    this._path = PathUtils.join(dir, FILE_NAME);
    return this._path;
  }

  async _load() {
    if (this._mem) {
      return this._mem;
    }
    if (this._memoryOnly) {
      return (this._mem = { threads: [] });
    }
    try {
      const data = await IOUtils.readJSON(await this._filePath());
      this._mem = data && Array.isArray(data.threads) ? data : { threads: [] };
    } catch {
      this._mem = { threads: [] }; // 文件不存在/损坏 → 空
    }
    return this._mem;
  }

  async _save() {
    if (this._memoryOnly) {
      return;
    }
    const p = await this._filePath();
    await IOUtils.writeJSON(p, this._mem, { tmpPath: p + ".tmp" });
  }

  /** 线程摘要列表（按更新时间倒序），不含 messages。 */
  async listThreads() {
    const d = await this._load();
    return d.threads
      .filter(t => !this._creatingIds.has(t.id))
      .map(t => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        workspace: t.workspace || null,
        mode: t.mode || null,
        envId: t.envId || null,
        modelStrategy: t.modelStrategy || "balanced",
        count: t.messages.length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getThread(id) {
    const d = await this._load();
    return d.threads.find(t => t.id === id && !this._creatingIds.has(t.id)) || null;
  }

  async createThread(title = NEW_TITLE, workspace = null, mode = null, canCreate) {
    const d = await this._load();
    const now = nextTs();
    const t = {
      id: "t" + now.toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      createdAt: now,
      updatedAt: now,
      workspace: workspace || null,
      mode: mode || null, // "auto"=全自动一条龙 / "assist"=AI辅助逐阶段 / null=未选（用时默认 auto）
      envId: null,
      modelStrategy: "balanced",
      messages: [],
    };
    requireAuthorization(canCreate, "creation", t.id, t);
    this._creatingIds.add(t.id);
    d.threads.push(t);
    try {
      await this._save();
    } catch (e) {
      d.threads = d.threads.filter(candidate => candidate !== t);
      throw e;
    } finally {
      this._creatingIds.delete(t.id);
    }
    return t;
  }

  /** 绑定/更新会话的工作目录。 */
  async setThreadWorkspace(id, workspace, canSet) {
    const d = await this._load();
    const t = d.threads.find(x => x.id === id);
    if (t) {
      requireAuthorization(canSet, "workspace update", id, t);
      t.workspace = workspace || null;
      t.updatedAt = nextTs();
      await this._save();
    }
    return t;
  }

  /** 设置/更新会话的执行模式（auto=全自动 / assist=AI辅助逐阶段）。按会话持久化，一选定整条会话沿用。 */
  async setThreadMode(id, mode, canSet) {
    const d = await this._load();
    const t = d.threads.find(x => x.id === id);
    if (t) {
      requireAuthorization(canSet, "mode update", id, t);
      t.mode = mode || null;
      t.updatedAt = nextTs();
      await this._save();
    }
    return t;
  }

  /** 绑定/更新会话的浏览器环境。 */
  async setThreadEnvironment(id, envId) {
    const d = await this._load();
    const t = d.threads.find(x => x.id === id);
    if (t) {
      t.envId = envId || null;
      t.updatedAt = nextTs();
      await this._save();
    }
    return t;
  }

  /** 设置/更新会话的模型策略。 */
  async setThreadModelStrategy(id, strategy) {
    const d = await this._load();
    const t = d.threads.find(x => x.id === id);
    if (t) {
      t.modelStrategy = strategy === "premium" ? "premium" : "balanced";
      t.updatedAt = nextTs();
      await this._save();
    }
    return t;
  }

  /** 追加一条消息；首条 user 消息自动作为标题。 */
  async appendMessage(id, msg, canAppend = null, onCommit = null) {
    const d = await this._load();
    const t = d.threads.find(x => x.id === id);
    if (!t) {
      throw new Error("conversation thread not found: " + id);
    }
    const guarded = msg.role === "user" || canAppend !== null || onCommit !== null;
    if (guarded) {
      requireAuthorization(canAppend, "append", id, t);
    }
    const previous = {
      messageCount: t.messages.length,
      title: t.title,
      updatedAt: t.updatedAt,
    };
    t.messages.push({ role: msg.role, content: msg.content, ...(msg.steps ? { steps: msg.steps } : {}) });
    t.updatedAt = nextTs();
    if (t.title === NEW_TITLE && msg.role === "user" && msg.content) {
      t.title = msg.content.replace(/\s+/g, " ").trim().slice(0, 30) || NEW_TITLE;
    }
    try {
      if (onCommit) {
        onCommit(t);
      }
    } catch (e) {
      t.messages.length = previous.messageCount;
      t.title = previous.title;
      t.updatedAt = previous.updatedAt;
      throw e;
    }
    await this._save();
    return t;
  }

  async renameThread(id, title) {
    const d = await this._load();
    const t = d.threads.find(x => x.id === id);
    if (t) {
      t.title = title || NEW_TITLE;
      t.updatedAt = nextTs();
      await this._save();
    }
  }

  async deleteThread(id, canDelete) {
    const d = await this._load();
    // guard 必须在线程列表实际变更前执行；调用方失去 reservation 时保持原数据不动。
    requireAuthorization(canDelete, "deletion", id, d.threads.find(t => t.id === id) || null);
    const removedIndex = d.threads.findIndex(t => t.id === id);
    const removed = removedIndex >= 0 ? d.threads[removedIndex] : null;
    if (removed) {
      d.threads.splice(removedIndex, 1);
      try {
        await this._save();
      } catch (e) {
        if (!d.threads.some(t => t.id === id)) {
          d.threads.splice(Math.min(removedIndex, d.threads.length), 0, removed);
        }
        throw e;
      }
    }
  }
}

/** 默认单例（Firefox 用；测试可 new ConversationStore({memoryOnly:true})）。 */
export const conversationStore = new ConversationStore();
