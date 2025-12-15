import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";
import type { BotConnectionState, PodHeartbeatState } from "./types";

const STATE_TTL = 3600;
const HEARTBEAT_TTL = 300;
const HEARTBEAT_INTERVAL_MS = 30000;

export class DiscordStateManager {
  private static instance: DiscordStateManager;
  private redis: Redis | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private podId: string;

  private constructor() {
    this.podId =
      process.env.POD_NAME ?? process.env.HOSTNAME ?? `pod-${Date.now()}`;
    this.initializeRedis();
  }

  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    const restUrl = process.env.KV_REST_API_URL;
    const restToken = process.env.KV_REST_API_TOKEN;

    if (redisUrl) {
      this.redis = Redis.fromEnv();
    } else if (restUrl && restToken) {
      this.redis = new Redis({ url: restUrl, token: restToken });
    }

    logger.info("[Discord State Manager] Initialized", {
      enabled: !!this.redis,
    });
  }

  static getInstance(): DiscordStateManager {
    if (!DiscordStateManager.instance) {
      DiscordStateManager.instance = new DiscordStateManager();
    }
    return DiscordStateManager.instance;
  }

  private parseJson<T>(data: string | T): T {
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  private get isEnabled(): boolean {
    return !!this.redis;
  }

  async saveConnectionState(state: BotConnectionState): Promise<void> {
    if (!this.redis) {
      logger.warn(
        "[Discord State Manager] Cannot save state - Redis unavailable",
        { connectionId: state.connectionId },
      );
      return;
    }
    await this.redis.setex(
      `discord:state:${state.connectionId}`,
      STATE_TTL,
      JSON.stringify(state),
    );
    logger.debug("[Discord State Manager] Saved state", {
      connectionId: state.connectionId,
    });
  }

  async getConnectionState(
    connectionId: string,
  ): Promise<BotConnectionState | null> {
    if (!this.redis) {
      logger.debug(
        "[Discord State Manager] Cannot get state - Redis unavailable",
        { connectionId },
      );
      return null;
    }
    const data = await this.redis.get<string>(`discord:state:${connectionId}`);
    return data ? this.parseJson<BotConnectionState>(data) : null;
  }

  async clearConnectionState(connectionId: string): Promise<void> {
    if (!this.redis) {
      logger.debug(
        "[Discord State Manager] Cannot clear state - Redis unavailable",
        { connectionId },
      );
      return;
    }
    await this.redis.del(`discord:state:${connectionId}`);
  }

  async updateSequence(connectionId: string, sequence: number): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state) {
      state.sequence = sequence;
      state.lastHeartbeat = Date.now();
      await this.saveConnectionState(state);
    } else {
      logger.debug(
        "[Discord State Manager] Cannot update sequence - state not found",
        { connectionId, sequence },
      );
    }
  }

  async updateSession(
    connectionId: string,
    sessionId: string,
    resumeGatewayUrl: string,
  ): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state) {
      Object.assign(state, {
        sessionId,
        resumeGatewayUrl,
        connectedAt: Date.now(),
        status: "connected",
      });
      await this.saveConnectionState(state);
    } else {
      logger.warn(
        "[Discord State Manager] Cannot update session - state not found",
        { connectionId, sessionId },
      );
    }
  }

  async addGuild(connectionId: string, guildId: string): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state && !state.guilds.includes(guildId)) {
      state.guilds.push(guildId);
      await this.saveConnectionState(state);
    } else if (!state) {
      logger.debug(
        "[Discord State Manager] Cannot add guild - state not found",
        { connectionId, guildId },
      );
    }
  }

  async removeGuild(connectionId: string, guildId: string): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state) {
      state.guilds = state.guilds.filter((g) => g !== guildId);
      await this.saveConnectionState(state);
    } else {
      logger.debug(
        "[Discord State Manager] Cannot remove guild - state not found",
        { connectionId, guildId },
      );
    }
  }

  startPodHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(
      () => this.sendPodHeartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
    this.sendPodHeartbeat();
    logger.info("[Discord State Manager] Heartbeat started", {
      podId: this.podId,
    });
  }

  stopPodHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async sendPodHeartbeat(): Promise<void> {
    if (!this.redis) return;

    const connections = await this.getPodConnections();
    const existing = await this.redis.get<string>(`discord:pod:${this.podId}`);
    const startedAt = existing
      ? this.parseJson<PodHeartbeatState>(existing).startedAt
      : Date.now();

    const state: PodHeartbeatState = {
      podId: this.podId,
      connections,
      lastHeartbeat: Date.now(),
      startedAt,
    };

    await this.redis.setex(
      `discord:pod:${this.podId}`,
      HEARTBEAT_TTL,
      JSON.stringify(state),
    );
    await this.redis.sadd("discord:active_pods", this.podId);
    await this.redis.expire("discord:active_pods", HEARTBEAT_TTL);
  }

  private async getPodConnections(): Promise<string[]> {
    if (!this.redis) return [];

    const connections: string[] = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await this.redis.scan(cursor, {
        match: "discord:state:*",
        count: 100,
      });
      cursor =
        typeof newCursor === "string" ? parseInt(newCursor, 10) : newCursor;

      for (const key of keys) {
        const data = await this.redis.get<string>(key);
        if (data) {
          const state = this.parseJson<BotConnectionState>(data);
          if (state.podId === this.podId) connections.push(state.connectionId);
        }
      }
    } while (cursor !== 0);

    return connections;
  }

  async getActivePods(): Promise<string[]> {
    if (!this.redis) return [];
    return (await this.redis.smembers("discord:active_pods")) ?? [];
  }

  async getPodStatus(podId: string): Promise<PodHeartbeatState | null> {
    if (!this.redis) return null;
    const data = await this.redis.get<string>(`discord:pod:${podId}`);
    return data ? this.parseJson<PodHeartbeatState>(data) : null;
  }

  async isPodAlive(podId: string): Promise<boolean> {
    const status = await this.getPodStatus(podId);
    return status
      ? Date.now() - status.lastHeartbeat < HEARTBEAT_TTL * 1000
      : false;
  }

  async findDeadPods(): Promise<string[]> {
    const activePods = await this.getActivePods();
    const results = await Promise.all(
      activePods.map(async (id) => ({ id, alive: await this.isPodAlive(id) })),
    );
    return results.filter((r) => !r.alive).map((r) => r.id);
  }

  async claimOrphanedConnections(deadPodId: string): Promise<string[]> {
    if (!this.redis) return [];

    const claimed: string[] = [];
    let cursor = 0;

    do {
      const [newCursor, keys] = await this.redis.scan(cursor, {
        match: "discord:state:*",
        count: 100,
      });
      cursor =
        typeof newCursor === "string" ? parseInt(newCursor, 10) : newCursor;

      for (const key of keys) {
        const data = await this.redis.get<string>(key);
        if (data) {
          const state = this.parseJson<BotConnectionState>(data);
          if (state.podId === deadPodId) {
            state.podId = this.podId;
            state.status = "disconnected";
            await this.saveConnectionState(state);
            claimed.push(state.connectionId);
            logger.info("[Discord State Manager] Claimed orphan", {
              connectionId: state.connectionId,
            });
          }
        }
      }
    } while (cursor !== 0);

    await this.redis.srem("discord:active_pods", deadPodId);
    await this.redis.del(`discord:pod:${deadPodId}`);
    return claimed;
  }

  async checkRateLimit(
    connectionId: string,
    route: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!this.redis) {
      logger.warn(
        "[Discord State Manager] Rate limiting bypassed - Redis unavailable",
        {
          connectionId,
          route,
          limit,
        },
      );
      return {
        allowed: true,
        remaining: limit,
        resetAt: Date.now() + windowMs,
      };
    }

    const key = `discord:ratelimit:${connectionId}:${route}`;
    const now = Date.now();
    const data = await this.redis.get<string>(key);

    let count = 0;
    let windowStart = now;

    if (data) {
      const parsed = this.parseJson<{ count: number; windowStart: number }>(
        data,
      );
      if (now - parsed.windowStart < windowMs) {
        count = parsed.count;
        windowStart = parsed.windowStart;
      }
    }

    const allowed = count < limit;
    const newCount = allowed ? count + 1 : count;

    await this.redis.setex(
      key,
      Math.ceil(windowMs / 1000),
      JSON.stringify({ count: newCount, windowStart }),
    );

    return {
      allowed,
      remaining: Math.max(0, limit - newCount),
      resetAt: windowStart + windowMs,
    };
  }

  getPodId(): string {
    return this.podId;
  }

  isRedisEnabled(): boolean {
    return this.isEnabled;
  }
}

export const discordStateManager = DiscordStateManager.getInstance();
