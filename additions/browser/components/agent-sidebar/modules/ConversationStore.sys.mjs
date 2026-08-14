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
const RECOVERY_SUFFIX = ".recovery";
const RECOVERY_SCHEMA_VERSION = 1;
const NEW_TITLE = "新对话";

function isOptionalString(value) {
  return value === undefined || value === null || typeof value === "string";
}

function isValidConversationStep(step) {
  if (!step || typeof step !== "object" || Array.isArray(step) ||
      (step.kind !== "text" && step.kind !== "think" && step.kind !== "tool")) {
    return false;
  }
  if (step.kind === "text" || step.kind === "think") {
    return typeof step.text === "string";
  }
  return isOptionalString(step.id) && isOptionalString(step.name) &&
    isOptionalString(step.status) && isOptionalString(step.summary) &&
    (!Object.hasOwn(step, "images") ||
      (Array.isArray(step.images) && step.images.every(image => typeof image === "string"))) &&
    (!Object.hasOwn(step, "shot") || (Number.isInteger(step.shot) && step.shot >= 0));
}

function cloneConversationSnapshot(value) {
  let snapshot;
  try {
    snapshot = JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error("conversation recovery snapshot is malformed");
  }
  if (!snapshot || !Array.isArray(snapshot.threads)) {
    throw new Error("conversation recovery snapshot is malformed");
  }
  const ids = new Set();
  for (const thread of snapshot.threads) {
    if (!thread || typeof thread !== "object" || Array.isArray(thread) ||
         typeof thread.id !== "string" || !thread.id || ids.has(thread.id) ||
         typeof thread.title !== "string" ||
         !Number.isFinite(thread.createdAt) || !Number.isFinite(thread.updatedAt) ||
         !isOptionalString(thread.workspace) ||
         (thread.mode !== undefined && thread.mode !== null &&
           thread.mode !== "auto" && thread.mode !== "assist") ||
         !isOptionalString(thread.envId) ||
         (thread.modelStrategy !== undefined && thread.modelStrategy !== null &&
           thread.modelStrategy !== "balanced" && thread.modelStrategy !== "premium") ||
         !Array.isArray(thread.messages)) {
      throw new Error("conversation recovery snapshot is malformed");
    }
    for (const message of thread.messages) {
      if (!message || typeof message !== "object" || Array.isArray(message) ||
          typeof message.role !== "string" || !message.role.trim() ||
          typeof message.content !== "string" ||
          (Object.hasOwn(message, "steps") && (!Array.isArray(message.steps) ||
            message.steps.some(step => !isValidConversationStep(step))))) {
        throw new Error("conversation recovery snapshot is malformed");
      }
    }
    ids.add(thread.id);
  }
  return snapshot;
}

function sameConversationSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

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

  async _recoveryPath() {
    return (await this._filePath()) + RECOVERY_SUFFIX;
  }

  async _readRecoverySnapshot() {
    if (this._memoryOnly) {
      return null;
    }
    const path = await this._recoveryPath();
    if (!(await IOUtils.exists(path))) {
      return null;
    }
    const record = await IOUtils.readJSON(path);
    if (record?.schemaVersion !== RECOVERY_SCHEMA_VERSION) {
      throw new Error("conversation recovery schema is unsupported");
    }
    const phase = record.phase || "rollback";
    if (phase !== "rollback" && phase !== "committed") {
      throw new Error("conversation recovery phase is unsupported");
    }
    return {
      phase,
      snapshot: cloneConversationSnapshot(record.snapshot),
      rollbackSnapshot: phase === "committed" && record.rollbackSnapshot !== undefined
        ? cloneConversationSnapshot(record.rollbackSnapshot)
        : null,
    };
  }

  async _writeRecoverySnapshot(snapshot = this._mem, phase = "rollback", rollbackSnapshot = null) {
    if (this._memoryOnly) {
      return;
    }
    const path = await this._recoveryPath();
    const record = {
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      phase,
      snapshot: cloneConversationSnapshot(snapshot),
    };
    if (phase === "committed" && rollbackSnapshot) {
      record.rollbackSnapshot = cloneConversationSnapshot(rollbackSnapshot);
    }
    await IOUtils.writeJSON(
      path,
      record,
      { tmpPath: path + ".tmp" },
    );
  }

  async _clearRecoverySnapshot() {
    if (!this._memoryOnly) {
      this._recoverySavePending = true;
      await IOUtils.remove(await this._recoveryPath(), { ignoreAbsent: true });
    }
    this._recoverySavePending = false;
  }

  async _prepareRecoverySnapshot(snapshot) {
    if (this._memoryOnly) {
      return false;
    }
    await this._writeRecoverySnapshot(snapshot, "rollback");
    return true;
  }

  async _persistRecoveredSnapshot(recoveryPrepared = false) {
    this._recoverySavePending = true;
    let recoveryWriteError = null;
    if (!recoveryPrepared) {
      try {
        await this._writeRecoverySnapshot();
      } catch (e) {
        recoveryWriteError = e;
      }
    }
    try {
      await this._save();
    } catch (saveError) {
      if (recoveryWriteError) {
        throw new Error(
          `conversation durable recovery and canonical rollback both failed: ${String(recoveryWriteError?.message || recoveryWriteError)}; ${String(saveError?.message || saveError)}`,
          { cause: saveError },
        );
      }
      throw saveError;
    }
    try {
      await this._clearRecoverySnapshot();
    } catch (clearError) {
      try {
        await this._writeRecoverySnapshot(this._mem, "rollback");
      } catch (recoveryError) {
        throw new Error(
          `conversation rollback cleanup and recovery refresh both failed: ${String(clearError?.message || clearError)}; ${String(recoveryError?.message || recoveryError)}`,
          { cause: clearError },
        );
      }
      throw clearError;
    }
  }

  async _load() {
    if (this._loadPromise) {
      return this._loadPromise;
    }
    if (this._mem && !this._recoverySavePending) {
      return this._mem;
    }
    const loading = (async () => {
      if (this._mem) {
        await this._save();
        await this._clearRecoverySnapshot();
        return this._mem;
      }
      if (this._memoryOnly) {
        return (this._mem = { threads: [] });
      }
      const recovery = await this._readRecoverySnapshot();
      if (recovery) {
        let recoverySnapshot = recovery.snapshot;
        if (recovery.phase === "committed" && recovery.rollbackSnapshot) {
          try {
            const canonical = cloneConversationSnapshot(
              await IOUtils.readJSON(await this._filePath()),
            );
            if (sameConversationSnapshot(canonical, recovery.rollbackSnapshot)) {
              recoverySnapshot = canonical;
            }
          } catch {
            // canonical 缺失或损坏时，仍以已验证的 committed journal 为准。
          }
        }
        this._mem = recoverySnapshot;
        this._recoverySavePending = true;
        await this._save();
        await this._clearRecoverySnapshot();
        return this._mem;
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

  _queue(operation) {
    const pending = this._mutationQueue.then(operation);
    this._mutationQueue = pending.catch(() => {});
    return pending;
  }

  _mutate(operation) {
    return this._queue(async () => {
      if (this._loadPromise || this._recoverySavePending) {
        await this._load();
      }
      return operation();
    });
  }

  _read(operation) {
    return this._queue(async () => operation(await this._load()));
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
    return this._read(d => d.threads
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
      .sort((a, b) => b.updatedAt - a.updatedAt));
  }

  async getThread(id) {
    return this._read(d => {
      const thread = d.threads.find(t => t.id === id && !this._creatingIds.has(t.id));
      return thread ? JSON.parse(JSON.stringify(thread)) : null;
    });
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
      const guardedCommit = canAppend !== null || onCommit !== null;
      if (guardedCommit) {
        requireAuthorization(canAppend, "append", id, t);
      }
      const rollbackSnapshot = guardedCommit ? cloneConversationSnapshot(d) : null;
      const recoveryPrepared = guardedCommit
        ? await this._prepareRecoverySnapshot(rollbackSnapshot)
        : false;
      if (recoveryPrepared) {
        try {
          requireAuthorization(canAppend, "append", id, t);
        } catch (e) {
          await this._clearRecoverySnapshot();
          throw e;
        }
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
        if (rollback() && recoveryPrepared) {
          try {
            await this._persistRecoveredSnapshot(true);
          } catch (rollbackError) {
            throw new Error(
              `conversation append provisional recovery failed: ${id}: ${String(rollbackError?.message || rollbackError)}`,
              { cause: e },
            );
          }
        }
        throw e;
      }
      let recoveryCommitted = false;
      try {
        if (guardedCommit) {
          requireAuthorization(canAppend, "append", id, t);
        }
        if (recoveryPrepared) {
          await this._writeRecoverySnapshot(d, "committed", rollbackSnapshot);
          recoveryCommitted = true;
          requireAuthorization(canAppend, "append", id, t);
        }
        if (onCommit) {
          onCommit(t);
        }
      } catch (e) {
        const rolledBack = rollback();
        let rollbackJournalError = null;
        if (recoveryCommitted) {
          try {
            await this._writeRecoverySnapshot(rollbackSnapshot, "rollback");
          } catch (journalError) {
            this._recoverySavePending = true;
            rollbackJournalError = journalError;
          }
        }
        if (rolledBack) {
          try {
            await this._persistRecoveredSnapshot(recoveryPrepared && !rollbackJournalError);
          } catch (rollbackError) {
            throw new Error(
              `conversation append rollback save failed: ${id}: ${String(rollbackJournalError?.message || rollbackJournalError || "journal ok")}; ${String(rollbackError?.message || rollbackError)}`,
              { cause: e },
            );
          }
        } else if (rollbackJournalError) {
          throw new Error(
            `conversation append rollback journal failed: ${id}: ${String(rollbackJournalError?.message || rollbackJournalError)}`,
            { cause: e },
          );
        }
        throw e;
      }
      if (recoveryPrepared) {
        await this._clearRecoverySnapshot();
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
        const rollbackSnapshot = cloneConversationSnapshot(d);
        const recoveryPrepared = await this._prepareRecoverySnapshot(rollbackSnapshot);
        if (recoveryPrepared) {
          try {
            requireAuthorization(canDelete, "deletion", id, removed);
          } catch (e) {
            await this._clearRecoverySnapshot();
            throw e;
          }
        }
        d.threads.splice(removedIndex, 1);
        let deletionSaved = false;
        let recoveryCommitted = false;
        try {
          await this._save();
          deletionSaved = true;
          // 保存期间 director 仍可能启动任务；完成写入后再同步复核一次，作为删除线性化点。
          requireAuthorization(canDelete, "deletion", id, removed);
          if (recoveryPrepared) {
            await this._writeRecoverySnapshot(d, "committed", rollbackSnapshot);
            recoveryCommitted = true;
            requireAuthorization(canDelete, "deletion", id, removed);
            await this._clearRecoverySnapshot();
            requireAuthorization(canDelete, "deletion", id, removed);
          }
        } catch (e) {
          if (!d.threads.some(t => t.id === id)) {
            d.threads.splice(Math.min(removedIndex, d.threads.length), 0, removed);
          }
          let rollbackJournalError = null;
          if (recoveryCommitted) {
            try {
              await this._writeRecoverySnapshot(rollbackSnapshot, "rollback");
            } catch (journalError) {
              this._recoverySavePending = true;
              rollbackJournalError = journalError;
            }
          }
          if (deletionSaved || recoveryPrepared) {
            try {
              await this._persistRecoveredSnapshot(recoveryPrepared && !rollbackJournalError);
            } catch (rollbackError) {
              throw new Error(
                `conversation deletion rollback save failed: ${id}: ${String(rollbackJournalError?.message || rollbackJournalError || "journal ok")}; ${String(rollbackError?.message || rollbackError)}`,
                { cause: e },
              );
            }
          } else if (rollbackJournalError) {
            throw new Error(
              `conversation deletion rollback journal failed: ${id}: ${String(rollbackJournalError?.message || rollbackJournalError)}`,
              { cause: e },
            );
          }
          throw e;
        }
      }
    });
  }
}

/** 默认单例（Firefox 用；测试可 new ConversationStore({memoryOnly:true})）。 */
export const conversationStore = new ConversationStore();
