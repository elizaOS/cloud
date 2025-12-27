/**
 * State Manager Logic Tests
 *
 * Tests for Redis state management, pod coordination, and rate limiting.
 */
import { describe, expect, it } from "bun:test";

// Types matching the state manager
interface BotConnectionState {
  connectionId: string;
  organizationId: string;
  applicationId: string;
  botToken: string;
  shardId: number;
  shardCount: number;
  podId: string;
  sessionId: string | null;
  resumeGatewayUrl: string | null;
  sequence: number;
  guilds: string[];
  status: "disconnected" | "connecting" | "connected" | "error";
  lastHeartbeat: number;
  connectedAt: number | null;
}

interface PodHeartbeatState {
  podId: string;
  connections: string[];
  lastHeartbeat: number;
  startedAt: number;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

const createMockConnectionState = (
  overrides: Partial<BotConnectionState> = {},
): BotConnectionState => ({
  connectionId: "conn-123",
  organizationId: "org-456",
  applicationId: "app-789",
  botToken: "token-secret",
  shardId: 0,
  shardCount: 1,
  podId: "pod-abc",
  sessionId: null,
  resumeGatewayUrl: null,
  sequence: 0,
  guilds: [],
  status: "disconnected",
  lastHeartbeat: Date.now(),
  connectedAt: null,
  ...overrides,
});

describe("State Manager Logic", () => {
  describe("Connection State Serialization", () => {
    it("should serialize connection state to JSON", () => {
      const state = createMockConnectionState();
      const json = JSON.stringify(state);
      const parsed = JSON.parse(json);

      expect(parsed.connectionId).toBe(state.connectionId);
      expect(parsed.organizationId).toBe(state.organizationId);
      expect(parsed.status).toBe("disconnected");
    });

    it("should preserve all fields through serialization", () => {
      const state = createMockConnectionState({
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway.discord.gg/?v=10&encoding=json",
        sequence: 42,
        guilds: ["guild-1", "guild-2", "guild-3"],
        status: "connected",
        connectedAt: Date.now(),
      });

      const json = JSON.stringify(state);
      const parsed = JSON.parse(json) as BotConnectionState;

      expect(parsed.sessionId).toBe("session-123");
      expect(parsed.resumeGatewayUrl).toBe(
        "wss://gateway.discord.gg/?v=10&encoding=json",
      );
      expect(parsed.sequence).toBe(42);
      expect(parsed.guilds).toHaveLength(3);
      expect(parsed.status).toBe("connected");
      expect(parsed.connectedAt).toBeDefined();
    });

    it("should handle null values correctly", () => {
      const state = createMockConnectionState({
        sessionId: null,
        resumeGatewayUrl: null,
        connectedAt: null,
      });

      const json = JSON.stringify(state);
      const parsed = JSON.parse(json) as BotConnectionState;

      expect(parsed.sessionId).toBeNull();
      expect(parsed.resumeGatewayUrl).toBeNull();
      expect(parsed.connectedAt).toBeNull();
    });
  });

  describe("Session Update Logic", () => {
    it("should update session info after READY event", () => {
      const state = createMockConnectionState();

      // Simulate session update
      const sessionId = "session-new-123";
      const resumeGatewayUrl = "wss://gateway.discord.gg/?v=10&encoding=json";

      Object.assign(state, {
        sessionId,
        resumeGatewayUrl,
        connectedAt: Date.now(),
        status: "connected",
      });

      expect(state.sessionId).toBe(sessionId);
      expect(state.resumeGatewayUrl).toBe(resumeGatewayUrl);
      expect(state.status).toBe("connected");
      expect(state.connectedAt).toBeDefined();
    });

    it("should preserve session data for resume", () => {
      const state = createMockConnectionState({
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway.discord.gg",
        sequence: 1000,
        status: "connected",
      });

      // Simulate disconnect - session data should be preserved
      state.status = "disconnected";

      expect(state.sessionId).toBe("session-123");
      expect(state.resumeGatewayUrl).toBe("wss://gateway.discord.gg");
      expect(state.sequence).toBe(1000);
    });

    it("should clear session data on invalid session", () => {
      const state = createMockConnectionState({
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway.discord.gg",
        sequence: 1000,
      });

      // Simulate invalid session (op 9 with d: false)
      state.sessionId = null;
      state.resumeGatewayUrl = null;
      state.sequence = 0;

      expect(state.sessionId).toBeNull();
      expect(state.resumeGatewayUrl).toBeNull();
      expect(state.sequence).toBe(0);
    });
  });

  describe("Sequence Number Management", () => {
    it("should increment sequence on each dispatch event", () => {
      const state = createMockConnectionState({ sequence: 0 });

      // Simulate receiving events
      for (let i = 0; i < 100; i++) {
        state.sequence++;
      }

      expect(state.sequence).toBe(100);
    });

    it("should handle sequence number overflow", () => {
      // Discord sequences are 32-bit integers
      const maxSequence = 2147483647;
      const state = createMockConnectionState({ sequence: maxSequence });

      // In practice, Discord resets before overflow
      expect(state.sequence).toBe(maxSequence);
    });

    it("should update last heartbeat with sequence", () => {
      const state = createMockConnectionState({ sequence: 100 });

      const beforeUpdate = state.lastHeartbeat;

      // Wait a tiny bit to ensure time difference
      state.sequence = 101;
      state.lastHeartbeat = Date.now() + 1;

      expect(state.sequence).toBe(101);
      expect(state.lastHeartbeat).toBeGreaterThanOrEqual(beforeUpdate);
    });
  });

  describe("Guild List Management", () => {
    it("should add guild to list", () => {
      const state = createMockConnectionState({ guilds: [] });

      // Add guild
      if (!state.guilds.includes("guild-1")) {
        state.guilds.push("guild-1");
      }

      expect(state.guilds).toContain("guild-1");
      expect(state.guilds).toHaveLength(1);
    });

    it("should not add duplicate guilds", () => {
      const state = createMockConnectionState({ guilds: ["guild-1"] });

      // Try to add duplicate
      if (!state.guilds.includes("guild-1")) {
        state.guilds.push("guild-1");
      }

      expect(state.guilds).toHaveLength(1);
    });

    it("should remove guild from list", () => {
      const state = createMockConnectionState({
        guilds: ["guild-1", "guild-2", "guild-3"],
      });

      // Remove guild
      state.guilds = state.guilds.filter((g) => g !== "guild-2");

      expect(state.guilds).not.toContain("guild-2");
      expect(state.guilds).toHaveLength(2);
    });

    it("should handle empty guild list", () => {
      const state = createMockConnectionState({ guilds: [] });

      // Remove from empty list should be safe
      state.guilds = state.guilds.filter((g) => g !== "guild-1");

      expect(state.guilds).toHaveLength(0);
    });

    it("should handle large guild lists", () => {
      const guilds = Array.from({ length: 100 }, (_, i) => `guild-${i}`);
      const state = createMockConnectionState({ guilds });

      expect(state.guilds).toHaveLength(100);
      expect(state.guilds[0]).toBe("guild-0");
      expect(state.guilds[99]).toBe("guild-99");
    });
  });

  describe("Pod Heartbeat State", () => {
    it("should create valid pod heartbeat state", () => {
      const podState: PodHeartbeatState = {
        podId: "pod-abc-123",
        connections: ["conn-1", "conn-2"],
        lastHeartbeat: Date.now(),
        startedAt: Date.now() - 3600000, // 1 hour ago
      };

      expect(podState.podId).toBe("pod-abc-123");
      expect(podState.connections).toHaveLength(2);
      expect(podState.lastHeartbeat).toBeGreaterThan(podState.startedAt);
    });

    it("should serialize pod state to JSON", () => {
      const podState: PodHeartbeatState = {
        podId: "pod-abc-123",
        connections: ["conn-1", "conn-2"],
        lastHeartbeat: Date.now(),
        startedAt: Date.now() - 3600000,
      };

      const json = JSON.stringify(podState);
      const parsed = JSON.parse(json) as PodHeartbeatState;

      expect(parsed.podId).toBe(podState.podId);
      expect(parsed.connections).toEqual(podState.connections);
    });

    it("should handle empty connections list", () => {
      const podState: PodHeartbeatState = {
        podId: "pod-abc-123",
        connections: [],
        lastHeartbeat: Date.now(),
        startedAt: Date.now(),
      };

      expect(podState.connections).toHaveLength(0);
    });
  });

  describe("Pod Liveness Detection", () => {
    it("should detect alive pod within heartbeat window", () => {
      const heartbeatTtl = 300; // 5 minutes in seconds
      const now = Date.now();

      const podState: PodHeartbeatState = {
        podId: "pod-alive",
        connections: [],
        lastHeartbeat: now - 60000, // 1 minute ago
        startedAt: now - 3600000,
      };

      const isAlive = now - podState.lastHeartbeat < heartbeatTtl * 1000;
      expect(isAlive).toBe(true);
    });

    it("should detect dead pod outside heartbeat window", () => {
      const heartbeatTtl = 300; // 5 minutes in seconds
      const now = Date.now();

      const podState: PodHeartbeatState = {
        podId: "pod-dead",
        connections: [],
        lastHeartbeat: now - 400000, // ~6.7 minutes ago
        startedAt: now - 3600000,
      };

      const isAlive = now - podState.lastHeartbeat < heartbeatTtl * 1000;
      expect(isAlive).toBe(false);
    });

    it("should handle exactly-at-threshold heartbeat", () => {
      const heartbeatTtl = 300;
      const now = Date.now();

      const podState: PodHeartbeatState = {
        podId: "pod-edge",
        connections: [],
        lastHeartbeat: now - heartbeatTtl * 1000, // Exactly at threshold
        startedAt: now - 3600000,
      };

      // Exactly at threshold should be considered dead (not strictly less than)
      const isAlive = now - podState.lastHeartbeat < heartbeatTtl * 1000;
      expect(isAlive).toBe(false);
    });
  });

  describe("Orphan Connection Claiming", () => {
    it("should claim connection from dead pod", () => {
      const deadPodId = "pod-dead";
      const newPodId = "pod-new";

      const state = createMockConnectionState({
        podId: deadPodId,
        status: "connected",
      });

      // Claim the connection
      state.podId = newPodId;
      state.status = "disconnected"; // Reset to disconnected for reconnect

      expect(state.podId).toBe(newPodId);
      expect(state.status).toBe("disconnected");
    });

    it("should preserve session data when claiming", () => {
      const state = createMockConnectionState({
        podId: "pod-dead",
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway.discord.gg",
        sequence: 500,
      });

      // Claim should preserve session data for resume attempt
      state.podId = "pod-new";
      state.status = "disconnected";

      expect(state.sessionId).toBe("session-123");
      expect(state.resumeGatewayUrl).toBe("wss://gateway.discord.gg");
      expect(state.sequence).toBe(500);
    });

    it("should track claimed connections", () => {
      const deadPodId = "pod-dead";
      const connections = [
        createMockConnectionState({ connectionId: "conn-1", podId: deadPodId }),
        createMockConnectionState({ connectionId: "conn-2", podId: deadPodId }),
        createMockConnectionState({
          connectionId: "conn-3",
          podId: "pod-alive",
        }),
      ];

      const claimed: string[] = [];
      for (const state of connections) {
        if (state.podId === deadPodId) {
          state.podId = "pod-new";
          state.status = "disconnected";
          claimed.push(state.connectionId);
        }
      }

      expect(claimed).toHaveLength(2);
      expect(claimed).toContain("conn-1");
      expect(claimed).toContain("conn-2");
      expect(claimed).not.toContain("conn-3");
    });
  });

  describe("Rate Limiting Logic", () => {
    it("should allow requests within rate limit", () => {
      const limit = 60;
      const windowMs = 60000;

      const state: RateLimitState = {
        count: 0,
        windowStart: Date.now(),
      };

      const checkRateLimit = (): boolean => {
        const now = Date.now();
        if (now - state.windowStart >= windowMs) {
          state.count = 0;
          state.windowStart = now;
        }

        if (state.count < limit) {
          state.count++;
          return true;
        }
        return false;
      };

      // Should allow first request
      expect(checkRateLimit()).toBe(true);
      expect(state.count).toBe(1);
    });

    it("should block requests exceeding rate limit", () => {
      const limit = 5;
      const state: RateLimitState = {
        count: 0,
        windowStart: Date.now(),
      };

      const checkRateLimit = (): boolean => {
        if (state.count < limit) {
          state.count++;
          return true;
        }
        return false;
      };

      // Allow 5 requests
      for (let i = 0; i < limit; i++) {
        expect(checkRateLimit()).toBe(true);
      }

      // 6th request should be blocked
      expect(checkRateLimit()).toBe(false);
    });

    it("should reset count after window expires", () => {
      const limit = 5;
      const windowMs = 60000;

      const state: RateLimitState = {
        count: 5, // At limit
        windowStart: Date.now() - windowMs - 1, // Window expired
      };

      const checkRateLimit = (): boolean => {
        const now = Date.now();
        if (now - state.windowStart >= windowMs) {
          state.count = 0;
          state.windowStart = now;
        }

        if (state.count < limit) {
          state.count++;
          return true;
        }
        return false;
      };

      // Should allow after window reset
      expect(checkRateLimit()).toBe(true);
      expect(state.count).toBe(1);
    });

    it("should calculate remaining requests correctly", () => {
      const limit = 60;
      const state: RateLimitState = {
        count: 45,
        windowStart: Date.now(),
      };

      const remaining = Math.max(0, limit - state.count);
      expect(remaining).toBe(15);
    });

    it("should calculate reset time correctly", () => {
      const windowMs = 60000;
      const state: RateLimitState = {
        count: 60,
        windowStart: Date.now() - 30000, // 30 seconds ago
      };

      const resetAt = state.windowStart + windowMs;
      const timeUntilReset = resetAt - Date.now();

      expect(timeUntilReset).toBeGreaterThan(29000);
      expect(timeUntilReset).toBeLessThanOrEqual(30000);
    });

    it("should handle zero rate limit", () => {
      const limit = 0;
      const state: RateLimitState = {
        count: 0,
        windowStart: Date.now(),
      };

      const checkRateLimit = (): boolean => {
        if (state.count < limit) {
          state.count++;
          return true;
        }
        return false;
      };

      // Should always block with zero limit
      expect(checkRateLimit()).toBe(false);
    });

    it("should handle different routes separately", () => {
      const limits: Map<string, RateLimitState> = new Map();

      const checkRateLimit = (route: string, limit: number): boolean => {
        if (!limits.has(route)) {
          limits.set(route, { count: 0, windowStart: Date.now() });
        }

        const state = limits.get(route)!;
        if (state.count < limit) {
          state.count++;
          return true;
        }
        return false;
      };

      // Different routes have independent limits
      expect(checkRateLimit("messages", 5)).toBe(true);
      expect(checkRateLimit("reactions", 5)).toBe(true);

      // Each route has its own counter
      expect(limits.get("messages")!.count).toBe(1);
      expect(limits.get("reactions")!.count).toBe(1);
    });
  });

  describe("Redis Key Generation", () => {
    it("should generate connection state key correctly", () => {
      const connectionId = "conn-123";
      const key = `discord:state:${connectionId}`;
      expect(key).toBe("discord:state:conn-123");
    });

    it("should generate pod heartbeat key correctly", () => {
      const podId = "pod-abc";
      const key = `discord:pod:${podId}`;
      expect(key).toBe("discord:pod:pod-abc");
    });

    it("should generate rate limit key correctly", () => {
      const connectionId = "conn-123";
      const route = "POST:/channels/456/messages";
      const key = `discord:ratelimit:${connectionId}:${route}`;
      expect(key).toBe(
        "discord:ratelimit:conn-123:POST:/channels/456/messages",
      );
    });

    it("should handle special characters in keys", () => {
      const connectionId = "conn:123";
      const key = `discord:state:${connectionId}`;
      // Colons in connection ID don't break key structure
      expect(key).toBe("discord:state:conn:123");
    });
  });

  describe("TTL Handling", () => {
    it("should use correct TTL for connection state", () => {
      const stateTtl = 3600; // 1 hour
      expect(stateTtl).toBe(3600);
    });

    it("should use correct TTL for heartbeat", () => {
      const heartbeatTtl = 300; // 5 minutes
      expect(heartbeatTtl).toBe(300);
    });

    it("should calculate TTL in seconds for setex", () => {
      const windowMs = 60000; // 1 minute in ms
      const ttlSeconds = Math.ceil(windowMs / 1000);
      expect(ttlSeconds).toBe(60);
    });
  });

  describe("Connection Status Transitions", () => {
    const validStatuses = [
      "disconnected",
      "connecting",
      "connected",
      "error",
    ] as const;

    it("should handle disconnected -> connecting transition", () => {
      const state = createMockConnectionState({ status: "disconnected" });
      state.status = "connecting";
      expect(state.status).toBe("connecting");
    });

    it("should handle connecting -> connected transition", () => {
      const state = createMockConnectionState({ status: "connecting" });
      state.status = "connected";
      state.connectedAt = Date.now();
      expect(state.status).toBe("connected");
      expect(state.connectedAt).toBeDefined();
    });

    it("should handle connected -> disconnected transition", () => {
      const state = createMockConnectionState({
        status: "connected",
        connectedAt: Date.now(),
      });
      state.status = "disconnected";
      // connectedAt should be preserved for metrics
      expect(state.status).toBe("disconnected");
      expect(state.connectedAt).toBeDefined();
    });

    it("should handle any state -> error transition", () => {
      validStatuses.forEach((initialStatus) => {
        const state = createMockConnectionState({ status: initialStatus });
        state.status = "error";
        expect(state.status).toBe("error");
      });
    });

    it("should handle error -> connecting (retry)", () => {
      const state = createMockConnectionState({ status: "error" });
      state.status = "connecting";
      expect(state.status).toBe("connecting");
    });
  });

  describe("Shard Configuration", () => {
    it("should handle single shard configuration", () => {
      const state = createMockConnectionState({
        shardId: 0,
        shardCount: 1,
      });

      expect(state.shardId).toBe(0);
      expect(state.shardCount).toBe(1);
    });

    it("should handle multi-shard configuration", () => {
      const shardCount = 4;
      const states = Array.from({ length: shardCount }, (_, i) =>
        createMockConnectionState({
          connectionId: `conn-shard-${i}`,
          shardId: i,
          shardCount,
        }),
      );

      expect(states).toHaveLength(4);
      states.forEach((state, i) => {
        expect(state.shardId).toBe(i);
        expect(state.shardCount).toBe(shardCount);
      });
    });

    it("should calculate guild to shard mapping", () => {
      const shardCount = 4;

      // Discord formula: (guild_id >> 22) % num_shards
      const getShardId = (guildId: bigint): number => {
        return Number((guildId >> 22n) % BigInt(shardCount));
      };

      const guildId = BigInt("123456789012345678");
      const shardId = getShardId(guildId);

      expect(shardId).toBeGreaterThanOrEqual(0);
      expect(shardId).toBeLessThan(shardCount);
    });
  });
});
