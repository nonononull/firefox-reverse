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

function authorizeIfProvided(guard, operation, id, value) {
  if (guard !== undefined && guard !== null) {
    requireAuthorization(guard, operation, id, value);
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
    this._loadPromise = null;
    this._mutationQueue = Promise.resolve();
    this._recoverySavePending = false;
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
    if (this._loadPromise) {
      return this._loadPromise;
    }
    const loading = (async () => {
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
    })();
    this._loadPromise = loading;
    try {
      return await loading;
    } finally {
      if (this._loadPromise === loading) {
        this._loadPromise = null;
      }
    }
  }

  _mutate(operation) {
    const pending = this._mutationQueue.then(async () => {
      if (this._recoverySavePending) {
        await this._save();
        this._recoverySavePending = false;
      }
      return operation();
    });
    this._mutationQueue = pending.catch(() => {});
    return pending;
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
    return this._mutate(async () => {
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
      authorizeIfProvided(canCreate, "creation", t.id, t);
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
    });
  }

  /** 绑定/更新会话的工作目录。 */
  async setThreadWorkspace(id, workspace, canSet) {
    return this._mutate(async () => {
      const d = await this._load();
      const t = d.threads.find(x => x.id === id);
      if (t) {
        authorizeIfProvided(canSet, "workspace update", id, t);
        const previous = { workspace: t.workspace, updatedAt: t.updatedAt };
        const nextWorkspace = workspace || null;
        t.workspace = nextWorkspace;
        const mutationUpdatedAt = nextTs();
        t.updatedAt = mutationUpdatedAt;
        try {
          await this._save();
        } catch (e) {
          if (t.workspace === nextWorkspace && t.updatedAt === mutationUpdatedAt) {
            t.workspace = previous.workspace;
            t.updatedAt = previous.updatedAt;
          }
          throw e;
        }
      }
      return t;
    });
  }

  /** 设置/更新会话的执行模式（auto=全自动 / assist=AI辅助逐阶段）。按会话持久化，一选定整条会话沿用。 */
  async setThreadMode(id, mode, canSet) {
    return this._mutate(async () => {
      const d = await this._load();
      const t = d.threads.find(x => x.id === id);
      if (t) {
        authorizeIfProvided(canSet, "mode update", id, t);
        const previous = { mode: t.mode, updatedAt: t.updatedAt };
        const nextMode = mode || null;
        t.mode = nextMode;
        const mutationUpdatedAt = nextTs();
        t.updatedAt = mutationUpdatedAt;
        try {
          await this._save();
        } catch (e) {
          if (t.mode === nextMode && t.updatedAt === mutationUpdatedAt) {
            t.mode = previous.mode;
            t.updatedAt = previous.updatedAt;
          }
          throw e;
        }
      }
      return t;
    });
  }

  /** 绑定/更新会话的浏览器环境。 */
  async setThreadEnvironment(id, envId) {
    return this._mutate(async () => {
      const d = await this._load();
      const t = d.threads.find(x => x.id === id);
      if (t) {
        const previous = { envId: t.envId, updatedAt: t.updatedAt };
        const nextEnvId = envId || null;
        t.envId = nextEnvId;
        const mutationUpdatedAt = nextTs();
        t.updatedAt = mutationUpdatedAt;
        try {
          await this._save();
        } catch (e) {
          if (t.envId === nextEnvId && t.updatedAt === mutationUpdatedAt) {
            t.envId = previous.envId;
            t.updatedAt = previous.updatedAt;
          }
          throw e;
        }
      }
      return t;
    });
  }

  /** 设置/更新会话的模型策略。 */
  async setThreadModelStrategy(id, strategy) {
    return this._mutate(async () => {
      const d = await this._load();
      const t = d.threads.find(x => x.id === id);
      if (t) {
        const previous = { modelStrategy: t.modelStrategy, updatedAt: t.updatedAt };
        const nextStrategy = strategy === "premium" ? "premium" : "balanced";
        t.modelStrategy = nextStrategy;
        const mutationUpdatedAt = nextTs();
        t.updatedAt = mutationUpdatedAt;
        try {
          await this._save();
        } catch (e) {
          if (t.modelStrategy === nextStrategy && t.updatedAt === mutationUpdatedAt) {
            t.modelStrategy = previous.modelStrategy;
            t.updatedAt = previous.updatedAt;
          }
          throw e;
        }
      }
      return t;
    });
  }

  /** 追加一条消息；首条 user 消息自动作为标题。 */
  async appendMessage(id, msg, canAppend = null, onCommit = null) {
    return this._mutate(async () => {
      const d = await this._load();
      const t = d.threads.find(x => x.id === id);
      if (!t) {
        throw new Error("conversation thread not found: " + id);
      }
      if (canAppend !== null || onCommit !== null) {
        requireAuthorization(canAppend, "append", id, t);
      }
      const previous = {
        messageCount: t.messages.length,
        title: t.title,
        updatedAt: t.updatedAt,
      };
      const appended = { role: msg.role, content: msg.content, ...(msg.steps ? { steps: msg.steps } : {}) };
      t.messages.push(appended);
      const mutationUpdatedAt = nextTs();
      t.updatedAt = mutationUpdatedAt;
      if (t.title === NEW_TITLE && msg.role === "user" && msg.content) {
        t.title = msg.content.replace(/\s+/g, " ").trim().slice(0, 30) || NEW_TITLE;
      }
      const rollback = () => {
        if (t.messages.length === previous.messageCount + 1 &&
            t.messages.at(-1) === appended && t.updatedAt === mutationUpdatedAt) {
          t.messages.length = previous.messageCount;
          t.title = previous.title;
          t.updatedAt = previous.updatedAt;
          return true;
        }
        return false;
      };
      try {
        await this._save();
      } catch (e) {
        rollback();
        throw e;
      }
      try {
        if (canAppend !== null || onCommit !== null) {
          requireAuthorization(canAppend, "append", id, t);
        }
        if (onCommit) {
          onCommit(t);
        }
      } catch (e) {
        if (rollback()) {
          try {
            await this._save();
          } catch (rollbackError) {
            this._recoverySavePending = true;
            throw new Error(
              `conversation append rollback save failed: ${id}: ${String(rollbackError?.message || rollbackError)}`,
              { cause: e },
            );
          }
        }
        throw e;
      }
      return t;
    });
  }

  async renameThread(id, title) {
    return this._mutate(async () => {
      const d = await this._load();
      const t = d.threads.find(x => x.id === id);
      if (t) {
        const previous = { title: t.title, updatedAt: t.updatedAt };
        const nextTitle = title || NEW_TITLE;
        t.title = nextTitle;
        const mutationUpdatedAt = nextTs();
        t.updatedAt = mutationUpdatedAt;
        try {
          await this._save();
        } catch (e) {
          if (t.title === nextTitle && t.updatedAt === mutationUpdatedAt) {
            t.title = previous.title;
            t.updatedAt = previous.updatedAt;
          }
          throw e;
        }
      }
      return t;
    });
  }

  async deleteThread(id, canDelete) {
    return this._mutate(async () => {
      const d = await this._load();
      // 删除没有 director 兼容入口，必须在线程列表实际变更前持有 UI reservation。
      requireAuthorization(canDelete, "deletion", id, d.threads.find(t => t.id === id) || null);
      const removedIndex = d.threads.findIndex(t => t.id === id);
      const removed = removedIndex >= 0 ? d.threads[removedIndex] : null;
      if (removed) {
        d.threads.splice(removedIndex, 1);
        let deletionSaved = false;
        try {
          await this._save();
          deletionSaved = true;
          // 保存期间 director 仍可能启动任务；完成写入后再同步复核一次，作为删除线性化点。
          requireAuthorization(canDelete, "deletion", id, removed);
        } catch (e) {
          if (!d.threads.some(t => t.id === id)) {
            d.threads.splice(Math.min(removedIndex, d.threads.length), 0, removed);
          }
          if (deletionSaved) {
            try {
              await this._save();
            } catch (rollbackError) {
              this._recoverySavePending = true;
              throw new Error(
                `conversation deletion rollback save failed: ${id}: ${String(rollbackError?.message || rollbackError)}`,
                { cause: e },
              );
            }
          }
          throw e;
        }
      }
    });
  }
}

/** 默认单例（Firefox 用；测试可 new ConversationStore({memoryOnly:true})）。 */
export const conversationStore = new ConversationStore();
