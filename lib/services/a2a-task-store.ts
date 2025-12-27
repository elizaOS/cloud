/**
 * Redis-backed A2A task storage with fallback to in-memory for serverless.
 */

import { Redis } from "@upstash/redis";
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
const TASK_KEY_PREFIX = "a2a:task:";
const TASK_ORG_INDEX_PREFIX = "a2a:org:";

let redis: Redis | null = null;
let initialized = false;

function getRedisClient(): Redis | null {
  if (initialized) return redis;
  initialized = true;

  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  const restUrl = process.env.KV_REST_API_URL;
  const restToken = process.env.KV_REST_API_TOKEN;

  if (redisUrl) {
    redis = Redis.fromEnv();
    logger.info(
      "[A2A TaskStore] ✓ Redis task store initialized (native protocol)",
    );
  } else if (restUrl && restToken) {
    redis = new Redis({ url: restUrl, token: restToken });
    logger.info("[A2A TaskStore] ✓ Redis task store initialized (REST API)");
  } else {
    logger.warn(
      "[A2A TaskStore] ⚠️ Redis not available, using in-memory fallback",
    );
    redis = null;
  }

  return redis;
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
    const client = getRedisClient();
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
    const client = getRedisClient();
    const key = `${TASK_KEY_PREFIX}${taskId}`;
    const orgIndexKey = `${TASK_ORG_INDEX_PREFIX}${entry.organizationId}`;

    if (client) {
      const serialized = JSON.stringify(entry);

      // Store task with TTL
      await client.setex(key, TASK_TTL_SECONDS, serialized);

      // Add to organization's task index (for listing)
      await client.zadd(orgIndexKey, {
        score: Date.now(),
        member: taskId,
      });

      // Set TTL on org index
      await client.expire(orgIndexKey, TASK_TTL_SECONDS * 2);

      logger.debug("[A2A TaskStore] Task stored in Redis", { taskId });
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
    const client = getRedisClient();
    const key = `${TASK_KEY_PREFIX}${taskId}`;

    // Verify ownership first
    const existing = await this.get(taskId, organizationId);
    if (!existing) return false;

    if (client) {
      await client.del(key);

      // Remove from org index
      const orgIndexKey = `${TASK_ORG_INDEX_PREFIX}${organizationId}`;
      await client.zrem(orgIndexKey, taskId);

      logger.debug("[A2A TaskStore] Task deleted from Redis", { taskId });
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
    const client = getRedisClient();

    if (client) {
      const orgIndexKey = `${TASK_ORG_INDEX_PREFIX}${organizationId}`;

      // Get recent task IDs from sorted set
      const taskIds = await client.zrange(orgIndexKey, -limit, -1);

      if (!taskIds.length) return [];

      // Fetch all tasks
      const keys = taskIds.map((id) => `${TASK_KEY_PREFIX}${id}`);
      const values = await client.mget<string[]>(...keys);

      const entries: TaskStoreEntry[] = [];
      for (const value of values) {
        if (value) {
          const entry: TaskStoreEntry =
            typeof value === "string" ? JSON.parse(value) : value;
          entries.push(entry);
        }
      }

      return entries.reverse(); // Most recent first
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

  isRedisAvailable(): boolean {
    return getRedisClient() !== null;
  }
}

export const a2aTaskStoreService = new A2ATaskStoreService();
