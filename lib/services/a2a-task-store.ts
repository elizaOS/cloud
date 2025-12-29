/**
 * DWS Cache-backed A2A task storage with fallback to in-memory for serverless.
 */

import { DWSCache } from "@/lib/services/dws/cache";
import { logger } from "@/lib/utils/logger";
import type { Task } from "@/lib/types/a2a";

export interface TaskStoreEntry {
  task: Task;
  userId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

const TASK_TTL_SECONDS = 3600;
const TASK_KEY_PREFIX = "task:";
const TASK_ORG_INDEX_PREFIX = "org:";

let dwsCache: DWSCache | null = null;
let initialized = false;

function getCacheClient(): DWSCache | null {
  if (initialized) return dwsCache;
  initialized = true;

  if (process.env.CACHE_ENABLED === "false") {
    logger.warn(
      "[A2A TaskStore] Cache disabled, using in-memory fallback",
    );
    dwsCache = null;
    return null;
  }

  try {
    dwsCache = new DWSCache({
      namespace: "a2a-tasks",
      defaultTTL: TASK_TTL_SECONDS,
    });
    logger.info("[A2A TaskStore] ✓ DWS cache task store initialized");
    return dwsCache;
  } catch {
    logger.warn(
      "[A2A TaskStore] ⚠️ DWS cache not available, using in-memory fallback",
    );
    dwsCache = null;
    return null;
  }
}

const memoryStore = new Map<string, TaskStoreEntry>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const oneHourAgo = Date.now() - TASK_TTL_SECONDS * 1000;
    for (const [id, entry] of memoryStore.entries()) {
      if (new Date(entry.updatedAt).getTime() < oneHourAgo) {
        memoryStore.delete(id);
      }
    }
  }, 300000);
}

class A2ATaskStoreService {
  async get(
    taskId: string,
    organizationId: string,
  ): Promise<TaskStoreEntry | null> {
    const client = getCacheClient();
    const key = `${TASK_KEY_PREFIX}${taskId}`;

    if (client) {
      const value = await client.get<string>(key);
      if (!value) return null;

      const entry: TaskStoreEntry =
        typeof value === "string" ? JSON.parse(value) : value;

      // Verify organization access
      if (entry.organizationId !== organizationId) {
        logger.warn("[A2A TaskStore] Task access denied - org mismatch", {
          taskId,
          requestedOrg: organizationId,
          actualOrg: entry.organizationId,
        });
        return null;
      }

      return entry;
    }

    // Fallback to memory
    const entry = memoryStore.get(taskId);
    if (!entry || entry.organizationId !== organizationId) return null;
    return entry;
  }

  async set(taskId: string, entry: TaskStoreEntry): Promise<void> {
    const client = getCacheClient();
    const key = `${TASK_KEY_PREFIX}${taskId}`;
    const orgIndexKey = `${TASK_ORG_INDEX_PREFIX}${entry.organizationId}`;

    if (client) {
      const serialized = JSON.stringify(entry);

      // Store task with TTL
      await client.setex(key, TASK_TTL_SECONDS, serialized);

      // Add to organization's task list using a hash
      await client.hset(orgIndexKey, taskId, String(Date.now()));

      // Set TTL on org index
      await client.expire(orgIndexKey, TASK_TTL_SECONDS * 2);

      logger.debug("[A2A TaskStore] Task stored in DWS cache", { taskId });
    } else {
      // Fallback to memory
      memoryStore.set(taskId, entry);
      logger.debug("[A2A TaskStore] Task stored in memory", { taskId });
    }
  }

  async update(
    taskId: string,
    organizationId: string,
    updater: (entry: TaskStoreEntry) => TaskStoreEntry,
  ): Promise<TaskStoreEntry | null> {
    const existing = await this.get(taskId, organizationId);
    if (!existing) return null;

    const updated = updater({
      ...existing,
      updatedAt: new Date().toISOString(),
    });

    await this.set(taskId, updated);
    return updated;
  }

  async delete(taskId: string, organizationId: string): Promise<boolean> {
    const client = getCacheClient();
    const key = `${TASK_KEY_PREFIX}${taskId}`;

    // Verify ownership first
    const existing = await this.get(taskId, organizationId);
    if (!existing) return false;

    if (client) {
      await client.del(key);

      // Remove from org index
      const orgIndexKey = `${TASK_ORG_INDEX_PREFIX}${organizationId}`;
      await client.hdel(orgIndexKey, taskId);

      logger.debug("[A2A TaskStore] Task deleted from DWS cache", { taskId });
    } else {
      memoryStore.delete(taskId);
      logger.debug("[A2A TaskStore] Task deleted from memory", { taskId });
    }

    return true;
  }

  async listByOrganization(
    organizationId: string,
    limit = 50,
  ): Promise<TaskStoreEntry[]> {
    const client = getCacheClient();

    if (client) {
      const orgIndexKey = `${TASK_ORG_INDEX_PREFIX}${organizationId}`;

      // Get all task IDs from hash
      const taskIdsMap = await client.hgetall(orgIndexKey);
      
      if (!taskIdsMap || Object.keys(taskIdsMap).length === 0) return [];

      // Sort by timestamp and take limit
      const taskIds = Object.entries(taskIdsMap)
        .sort(([, a], [, b]) => parseInt(b, 10) - parseInt(a, 10))
        .slice(0, limit)
        .map(([id]) => id);

      // Fetch all tasks
      const keys = taskIds.map((id) => `${TASK_KEY_PREFIX}${id}`);
      const values = await client.mget<string>(...keys);

      const entries: TaskStoreEntry[] = [];
      for (const value of values) {
        if (value) {
          const entry: TaskStoreEntry =
            typeof value === "string" ? JSON.parse(value) : value;
          entries.push(entry);
        }
      }

      return entries;
    }

    // Fallback to memory
    const entries: TaskStoreEntry[] = [];
    for (const entry of memoryStore.values()) {
      if (entry.organizationId === organizationId) {
        entries.push(entry);
      }
    }

    return entries
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, limit);
  }

  async updateTaskState(
    taskId: string,
    organizationId: string,
    state: Task["status"]["state"],
    message?: Task["status"]["message"],
  ): Promise<Task | null> {
    const result = await this.update(taskId, organizationId, (entry) => ({
      ...entry,
      task: {
        ...entry.task,
        status: {
          state,
          message,
          timestamp: new Date().toISOString(),
        },
      },
    }));

    return result?.task ?? null;
  }

  async addArtifact(
    taskId: string,
    organizationId: string,
    artifact: Task["artifacts"] extends (infer A)[] | undefined ? A : never,
  ): Promise<Task | null> {
    const result = await this.update(taskId, organizationId, (entry) => ({
      ...entry,
      task: {
        ...entry.task,
        artifacts: [...(entry.task.artifacts || []), artifact],
      },
    }));

    return result?.task ?? null;
  }

  async addMessageToHistory(
    taskId: string,
    organizationId: string,
    message: Task["history"] extends (infer M)[] | undefined ? M : never,
  ): Promise<void> {
    await this.update(taskId, organizationId, (entry) => ({
      ...entry,
      task: {
        ...entry.task,
        history: [...(entry.task.history || []), message],
      },
    }));
  }

  isCacheAvailable(): boolean {
    return getCacheClient() !== null;
  }
}

export const a2aTaskStoreService = new A2ATaskStoreService();
