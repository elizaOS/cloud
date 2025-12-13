/**
 * Discord Gateway State Manager
 *
 * Manages connection state in Redis for resilience across pod restarts.
 */

import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";
import type { BotConnectionState, PodHeartbeatState } from "./types";

const STATE_TTL = 3600; // 1 hour
const HEARTBEAT_TTL = 300; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

/**
 * Discord Gateway State Manager
 *
 * Uses Redis to store connection state for session resume and pod coordination.
 */
export class DiscordStateManager {
  private static instance: DiscordStateManager;
  private redis: Redis | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private podId: string;

  private constructor() {
    this.podId = process.env.POD_NAME ?? process.env.HOSTNAME ?? `pod-${Date.now()}`;
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

    logger.info("[Discord State Manager] Initialized", { enabled: !!this.redis });
  }

  static getInstance(): DiscordStateManager {
    if (!DiscordStateManager.instance) {
      DiscordStateManager.instance = new DiscordStateManager();
    }
    return DiscordStateManager.instance;
  }

  /** Helper to parse JSON from Redis (handles both string and object responses) */
  private parseJson<T>(data: string | T): T {
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  /** Check if Redis is available */
  private get isEnabled(): boolean {
    return !!this.redis;
  }

  // ===========================================================================
  // CONNECTION STATE
  // ===========================================================================

  /** Save connection state for resume. */
  async saveConnectionState(state: BotConnectionState): Promise<void> {
    if (!this.redis) return;
    await this.redis.setex(`discord:state:${state.connectionId}`, STATE_TTL, JSON.stringify(state));
    logger.debug("[Discord State Manager] Saved state", { connectionId: state.connectionId });
  }

  /** Get connection state for resume. */
  async getConnectionState(connectionId: string): Promise<BotConnectionState | null> {
    if (!this.redis) return null;
    const data = await this.redis.get<string>(`discord:state:${connectionId}`);
    return data ? this.parseJson<BotConnectionState>(data) : null;
  }

  /** Clear connection state. */
  async clearConnectionState(connectionId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(`discord:state:${connectionId}`);
  }

  /** Update sequence number. */
  async updateSequence(connectionId: string, sequence: number): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state) {
      state.sequence = sequence;
      state.lastHeartbeat = Date.now();
      await this.saveConnectionState(state);
    }
  }

  /** Update session info after READY event. */
  async updateSession(connectionId: string, sessionId: string, resumeGatewayUrl: string): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state) {
      Object.assign(state, { sessionId, resumeGatewayUrl, connectedAt: Date.now(), status: "connected" });
      await this.saveConnectionState(state);
    }
  }

  /** Add guild to connection's guild list. */
  async addGuild(connectionId: string, guildId: string): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state && !state.guilds.includes(guildId)) {
      state.guilds.push(guildId);
      await this.saveConnectionState(state);
    }
  }

  /** Remove guild from connection's guild list. */
  async removeGuild(connectionId: string, guildId: string): Promise<void> {
    const state = await this.getConnectionState(connectionId);
    if (state) {
      state.guilds = state.guilds.filter((g) => g !== guildId);
      await this.saveConnectionState(state);
    }
  }

  // ===========================================================================
  // POD COORDINATION
  // ===========================================================================

  /**
   * Start pod heartbeat.
   */
  startPodHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendPodHeartbeat().catch((err) => {
        logger.error("[Discord State Manager] Pod heartbeat failed", { error: err });
      });
    }, POD_HEARTBEAT_INTERVAL);

    // Send initial heartbeat
    this.sendPodHeartbeat();

    logger.info("[Discord State Manager] Pod heartbeat started", { podId: this.podId });
  }

  /**
   * Stop pod heartbeat.
   */
  stopPodHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    logger.info("[Discord State Manager] Pod heartbeat stopped", { podId: this.podId });
  }

  /**
   * Send pod heartbeat.
   */
  private async sendPodHeartbeat(): Promise<void> {
    if (!this.enabled || !this.redis) return;

    // Get current connections for this pod
    const connections = await this.getPodConnections();

    const state: PodHeartbeatState = {
      podId: this.podId,
      connections,
      lastHeartbeat: Date.now(),
      startedAt: Date.now(), // Will be overwritten if existing
    };

    const key = `discord:pod:${this.podId}`;

    // Check if pod already registered
    const existing = await this.redis.get<string>(key);
    if (existing) {
      const existingState: PodHeartbeatState =
        typeof existing === "string" ? JSON.parse(existing) : existing;
      state.startedAt = existingState.startedAt;
    }

    await this.redis.setex(key, HEARTBEAT_TTL, JSON.stringify(state));

    // Add to active pods set
    await this.redis.sadd("discord:active_pods", this.podId);
    await this.redis.expire("discord:active_pods", HEARTBEAT_TTL);
  }

  /**
   * Get connections assigned to this pod.
   */
  private async getPodConnections(): Promise<string[]> {
    if (!this.enabled || !this.redis) return [];

    // Scan for connection states assigned to this pod
    const pattern = "discord:state:*";
    const connections: string[] = [];

    let cursor = 0;
    do {
      const result = await this.redis.scan(cursor, { match: pattern, count: 100 });
      cursor = typeof result[0] === "string" ? parseInt(result[0], 10) : result[0];

      for (const key of result[1]) {
        const data = await this.redis.get<string>(key);
        if (data) {
          const state: BotConnectionState =
            typeof data === "string" ? JSON.parse(data) : data;
          if (state.podId === this.podId) {
            connections.push(state.connectionId);
          }
        }
      }
    } while (cursor !== 0);

    return connections;
  }

  /**
   * Get all active pods.
   */
  async getActivePods(): Promise<string[]> {
    if (!this.enabled || !this.redis) return [];

    const pods = await this.redis.smembers("discord:active_pods");
    return pods ?? [];
  }

  /**
   * Get pod status.
   */
  async getPodStatus(podId: string): Promise<PodHeartbeatState | null> {
    if (!this.enabled || !this.redis) return null;

    const key = `discord:pod:${podId}`;
    const data = await this.redis.get<string>(key);

    if (!data) return null;

    return typeof data === "string" ? JSON.parse(data) : data;
  }

  /**
   * Check if a pod is alive (has recent heartbeat).
   */
  async isPodAlive(podId: string): Promise<boolean> {
    const status = await this.getPodStatus(podId);
    if (!status) return false;

    const age = Date.now() - status.lastHeartbeat;
    return age < HEARTBEAT_TTL * 1000;
  }

  /**
   * Find dead pods (no heartbeat).
   */
  async findDeadPods(): Promise<string[]> {
    const activePods = await this.getActivePods();
    const deadPods: string[] = [];

    for (const podId of activePods) {
      const isAlive = await this.isPodAlive(podId);
      if (!isAlive) {
        deadPods.push(podId);
      }
    }

    return deadPods;
  }

  /**
   * Claim orphaned connections from dead pods.
   */
  async claimOrphanedConnections(deadPodId: string): Promise<string[]> {
    if (!this.enabled || !this.redis) return [];

    const claimedConnections: string[] = [];
    const pattern = "discord:state:*";

    let cursor = 0;
    do {
      const result = await this.redis.scan(cursor, { match: pattern, count: 100 });
      cursor = typeof result[0] === "string" ? parseInt(result[0], 10) : result[0];

      for (const key of result[1]) {
        const data = await this.redis.get<string>(key);
        if (data) {
          const state: BotConnectionState =
            typeof data === "string" ? JSON.parse(data) : data;

          if (state.podId === deadPodId) {
            // Claim this connection
            state.podId = this.podId;
            state.status = "disconnected";
            await this.saveConnectionState(state);
            claimedConnections.push(state.connectionId);

            logger.info("[Discord State Manager] Claimed orphaned connection", {
              connectionId: state.connectionId,
              fromPod: deadPodId,
              toPod: this.podId,
            });
          }
        }
      }
    } while (cursor !== 0);

    // Remove dead pod from active set
    await this.redis.srem("discord:active_pods", deadPodId);
    await this.redis.del(`discord:pod:${deadPodId}`);

    return claimedConnections;
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  /**
   * Check and update rate limit for Discord API calls.
   */
  async checkRateLimit(
    connectionId: string,
    route: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!this.enabled || !this.redis) {
      return { allowed: true, remaining: limit, resetAt: Date.now() + windowMs };
    }

    const key = `discord:ratelimit:${connectionId}:${route}`;
    const now = Date.now();

    // Get current count and window start
    const data = await this.redis.get<string>(key);
    let count = 0;
    let windowStart = now;

    if (data) {
      const parsed: { count: number; windowStart: number } =
        typeof data === "string" ? JSON.parse(data) : data;
      
      // Check if we're still in the same window
      if (now - parsed.windowStart < windowMs) {
        count = parsed.count;
        windowStart = parsed.windowStart;
      }
    }

    const allowed = count < limit;
    const newCount = allowed ? count + 1 : count;

    // Update rate limit state
    await this.redis.setex(
      key,
      Math.ceil(windowMs / 1000),
      JSON.stringify({ count: newCount, windowStart })
    );

    return {
      allowed,
      remaining: Math.max(0, limit - newCount),
      resetAt: windowStart + windowMs,
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get current pod ID.
   */
  getPodId(): string {
    return this.podId;
  }

  /**
   * Check if state management is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const discordStateManager = DiscordStateManager.getInstance();

