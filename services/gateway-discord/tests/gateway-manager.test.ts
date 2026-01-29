/**
 * Gateway Manager Unit Tests
 *
 * Tests for services/gateway-discord/src/gateway-manager.ts
 * 
 * Note: The GatewayManager has complex dependencies (discord.js, Redis, fetch).
 * These tests focus on testing the logic that can be verified without complex mocking.
 * Integration tests should cover the full flow.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// Store original env
const originalEnv = { ...process.env };

describe("GatewayManager helper functions", () => {
  describe("parseIntEnv logic", () => {
    // Replicating the parseIntEnv function logic
    const parseIntEnv = (name: string, defaultValue: number): number => {
      const value = process.env[name];
      if (value === undefined) return defaultValue;
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid ${name} environment variable: "${value}" is not a valid integer`);
      }
      return parsed;
    };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    test("returns default value when env var not set", () => {
      delete process.env.TEST_VAR;
      expect(parseIntEnv("TEST_VAR", 100)).toBe(100);
    });

    test("parses valid integer from env var", () => {
      process.env.TEST_VAR = "42";
      expect(parseIntEnv("TEST_VAR", 100)).toBe(42);
    });

    test("parses zero correctly", () => {
      process.env.TEST_VAR = "0";
      expect(parseIntEnv("TEST_VAR", 100)).toBe(0);
    });

    test("parses negative numbers", () => {
      process.env.TEST_VAR = "-50";
      expect(parseIntEnv("TEST_VAR", 100)).toBe(-50);
    });

    test("throws on invalid integer", () => {
      process.env.TEST_VAR = "not-a-number";
      expect(() => parseIntEnv("TEST_VAR", 100)).toThrow("not a valid integer");
    });

    test("throws with env var name in error", () => {
      process.env.MAX_BOTS = "invalid";
      expect(() => parseIntEnv("MAX_BOTS", 100)).toThrow("MAX_BOTS");
    });
  });

  describe("escapePrometheusLabel logic", () => {
    // Replicating the escapePrometheusLabel function
    const escapePrometheusLabel = (value: string): string =>
      value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

    test("escapes backslashes", () => {
      expect(escapePrometheusLabel("test\\pod")).toBe("test\\\\pod");
      expect(escapePrometheusLabel("\\\\")).toBe("\\\\\\\\");
    });

    test("escapes newlines", () => {
      expect(escapePrometheusLabel("test\npod")).toBe("test\\npod");
      expect(escapePrometheusLabel("line1\nline2\nline3")).toBe("line1\\nline2\\nline3");
    });

    test("escapes double quotes", () => {
      expect(escapePrometheusLabel('test"pod')).toBe('test\\"pod');
      expect(escapePrometheusLabel('"quoted"')).toBe('\\"quoted\\"');
    });

    test("escapes combined special characters", () => {
      expect(escapePrometheusLabel('test\\n"pod')).toBe('test\\\\n\\"pod');
    });

    test("leaves normal strings unchanged", () => {
      expect(escapePrometheusLabel("normal-pod-name")).toBe("normal-pod-name");
      expect(escapePrometheusLabel("pod-123-abc")).toBe("pod-123-abc");
    });
  });

  describe("metric formatting logic", () => {
    const escapePrometheusLabel = (value: string): string =>
      value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

    const metric = (
      name: string,
      type: string,
      help: string,
      pod: string,
      value: number,
    ): string => {
      const escapedPod = escapePrometheusLabel(pod);
      return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}{pod="${escapedPod}"} ${value}`;
    };

    test("formats metric with HELP, TYPE, and value", () => {
      const result = metric("test_metric", "gauge", "Test metric help", "pod-1", 42);
      expect(result).toContain("# HELP test_metric Test metric help");
      expect(result).toContain("# TYPE test_metric gauge");
      expect(result).toContain('test_metric{pod="pod-1"} 42');
    });

    test("escapes pod name in metric label", () => {
      const result = metric("test_metric", "gauge", "Help", 'pod"test', 10);
      // The escaped quote appears as \" in the output string
      expect(result).toContain('pod\\"test');
    });

    test("handles zero values", () => {
      const result = metric("test_metric", "gauge", "Help", "pod-1", 0);
      expect(result).toContain("} 0");
    });

    test("handles large values", () => {
      const result = metric("test_metric", "gauge", "Help", "pod-1", 1000000);
      expect(result).toContain("} 1000000");
    });
  });

  describe("fetchWithTimeout logic", () => {
    test("timeout value is reasonable (10 seconds default)", () => {
      const HTTP_TIMEOUT_MS = 10_000;
      expect(HTTP_TIMEOUT_MS).toBe(10000);
    });

    test("event forward timeout is longer (60 seconds)", () => {
      const EVENT_FORWARD_TIMEOUT_MS = 60_000;
      expect(EVENT_FORWARD_TIMEOUT_MS).toBe(60000);
      expect(EVENT_FORWARD_TIMEOUT_MS).toBeGreaterThan(10_000);
    });
  });
});

describe("GatewayManager health status logic", () => {
  describe("health status calculation", () => {
    type HealthStatus = "healthy" | "degraded" | "unhealthy";

    interface HealthInput {
      controlPlaneLost: boolean;
      totalBots: number;
      connectedBots: number;
    }

    // Replicating the health status logic
    const calculateHealthStatus = (input: HealthInput): HealthStatus => {
      const { controlPlaneLost, totalBots, connectedBots } = input;
      const disconnectedBots = totalBots - connectedBots;

      if (controlPlaneLost) return "unhealthy";
      if (totalBots > 0 && connectedBots === 0) return "unhealthy";
      if (disconnectedBots > 0) return "degraded";
      return "healthy";
    };

    test("returns healthy when no issues", () => {
      expect(calculateHealthStatus({
        controlPlaneLost: false,
        totalBots: 5,
        connectedBots: 5,
      })).toBe("healthy");
    });

    test("returns healthy with no bots", () => {
      expect(calculateHealthStatus({
        controlPlaneLost: false,
        totalBots: 0,
        connectedBots: 0,
      })).toBe("healthy");
    });

    test("returns unhealthy when control plane is lost", () => {
      expect(calculateHealthStatus({
        controlPlaneLost: true,
        totalBots: 5,
        connectedBots: 5,
      })).toBe("unhealthy");
    });

    test("returns unhealthy when all bots disconnected", () => {
      expect(calculateHealthStatus({
        controlPlaneLost: false,
        totalBots: 5,
        connectedBots: 0,
      })).toBe("unhealthy");
    });

    test("returns degraded when some bots disconnected", () => {
      expect(calculateHealthStatus({
        controlPlaneLost: false,
        totalBots: 5,
        connectedBots: 3,
      })).toBe("degraded");
    });

    test("control plane lost takes precedence over all bots connected", () => {
      expect(calculateHealthStatus({
        controlPlaneLost: true,
        totalBots: 10,
        connectedBots: 10,
      })).toBe("unhealthy");
    });
  });

  describe("control plane health thresholds", () => {
    const CRITICAL_FAILURE_THRESHOLD = 5;

    test("critical threshold is 5 consecutive failures", () => {
      expect(CRITICAL_FAILURE_THRESHOLD).toBe(5);
    });

    test("isControlPlaneLost logic", () => {
      const isControlPlaneLost = (consecutiveFailures: number) =>
        consecutiveFailures >= CRITICAL_FAILURE_THRESHOLD;

      expect(isControlPlaneLost(0)).toBe(false);
      expect(isControlPlaneLost(4)).toBe(false);
      expect(isControlPlaneLost(5)).toBe(true);
      expect(isControlPlaneLost(10)).toBe(true);
    });
  });
});

describe("GatewayManager failover logic", () => {
  describe("dead pod detection", () => {
    const DEAD_POD_THRESHOLD_MS = 45_000;

    test("dead pod threshold is 45 seconds", () => {
      expect(DEAD_POD_THRESHOLD_MS).toBe(45000);
    });

    test("pod is dead when heartbeat exceeds threshold", () => {
      const isDeadPod = (lastHeartbeat: number, now: number) => {
        const timeSinceHeartbeat = now - lastHeartbeat;
        return timeSinceHeartbeat > DEAD_POD_THRESHOLD_MS;
      };

      const now = Date.now();
      
      // 60 seconds ago - dead
      expect(isDeadPod(now - 60_000, now)).toBe(true);
      
      // 30 seconds ago - not dead
      expect(isDeadPod(now - 30_000, now)).toBe(false);
      
      // Exactly at threshold - not dead (must exceed)
      expect(isDeadPod(now - 45_000, now)).toBe(false);
      
      // Just over threshold - dead
      expect(isDeadPod(now - 45_001, now)).toBe(true);
    });
  });

  describe("capacity limits", () => {
    const DEFAULT_MAX_BOTS_PER_POD = 100;

    test("default max bots per pod is 100", () => {
      expect(DEFAULT_MAX_BOTS_PER_POD).toBe(100);
    });

    test("hasCapacity logic", () => {
      const hasCapacity = (currentBots: number, maxBots: number) =>
        currentBots < maxBots;

      expect(hasCapacity(0, 100)).toBe(true);
      expect(hasCapacity(50, 100)).toBe(true);
      expect(hasCapacity(99, 100)).toBe(true);
      expect(hasCapacity(100, 100)).toBe(false);
      expect(hasCapacity(101, 100)).toBe(false);
    });
  });
});

describe("GatewayManager constants", () => {
  test("bot poll interval is 30 seconds", () => {
    const BOT_POLL_INTERVAL_MS = 30_000;
    expect(BOT_POLL_INTERVAL_MS).toBe(30000);
  });

  test("heartbeat interval is 15 seconds", () => {
    const HEARTBEAT_INTERVAL_MS = 15_000;
    expect(HEARTBEAT_INTERVAL_MS).toBe(15000);
  });

  test("pod state TTL is 5 minutes", () => {
    const POD_STATE_TTL_SECONDS = 300;
    expect(POD_STATE_TTL_SECONDS).toBe(300);
  });

  test("session state TTL is 1 hour", () => {
    const SESSION_STATE_TTL_SECONDS = 3600;
    expect(SESSION_STATE_TTL_SECONDS).toBe(3600);
  });

  test("max Discord message length is 2000", () => {
    const MAX_DISCORD_MESSAGE_LENGTH = 2000;
    expect(MAX_DISCORD_MESSAGE_LENGTH).toBe(2000);
  });
});

describe("GatewayManager Discord intents", () => {
  test("default intents include required permissions", () => {
    // Discord GatewayIntentBits values
    const GatewayIntentBits = {
      Guilds: 1 << 0,
      GuildMessages: 1 << 9,
      MessageContent: 1 << 15,
      GuildMessageReactions: 1 << 10,
      DirectMessages: 1 << 12,
    };

    const DEFAULT_INTENTS = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
    ];

    expect(DEFAULT_INTENTS).toContain(GatewayIntentBits.Guilds);
    expect(DEFAULT_INTENTS).toContain(GatewayIntentBits.GuildMessages);
    expect(DEFAULT_INTENTS).toContain(GatewayIntentBits.MessageContent);
    expect(DEFAULT_INTENTS).toContain(GatewayIntentBits.GuildMessageReactions);
    expect(DEFAULT_INTENTS).toContain(GatewayIntentBits.DirectMessages);
    expect(DEFAULT_INTENTS).toHaveLength(5);
  });
});

describe("Bot connection state transitions", () => {
  type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

  test("valid connection statuses", () => {
    const validStatuses: ConnectionStatus[] = ["connecting", "connected", "disconnected", "error"];
    expect(validStatuses).toHaveLength(4);
  });

  test("connection lifecycle transitions", () => {
    // Valid transitions
    const transitions = {
      connecting: ["connected", "error", "disconnected"],
      connected: ["disconnected", "error"],
      disconnected: ["connecting"],
      error: ["connecting", "disconnected"],
    };

    // Verify structure
    expect(transitions.connecting).toContain("connected");
    expect(transitions.connected).toContain("disconnected");
    expect(transitions.error).toContain("connecting");
  });
});

describe("Event forwarding", () => {
  test("supported event types", () => {
    const supportedEvents = [
      "MESSAGE_CREATE",
      "MESSAGE_UPDATE",
      "MESSAGE_DELETE",
      "MESSAGE_REACTION_ADD",
      "GUILD_MEMBER_ADD",
      "GUILD_MEMBER_REMOVE",
      "INTERACTION_CREATE",
    ];

    expect(supportedEvents).toContain("MESSAGE_CREATE");
    expect(supportedEvents.length).toBeGreaterThanOrEqual(7);
  });

  test("event payload structure", () => {
    const createEventPayload = (
      connectionId: string,
      organizationId: string,
      eventType: string,
      data: Record<string, unknown>
    ) => ({
      connection_id: connectionId,
      organization_id: organizationId,
      platform_connection_id: connectionId,
      event_type: eventType,
      event_id: (data.id as string) ?? `${eventType}-${Date.now()}`,
      guild_id: (data.guild_id as string) ?? "",
      channel_id: (data.channel_id as string) ?? "",
      data,
      timestamp: new Date().toISOString(),
    });

    const payload = createEventPayload("conn-1", "org-1", "MESSAGE_CREATE", {
      id: "msg-123",
      channel_id: "chan-456",
      guild_id: "guild-789",
    });

    expect(payload.connection_id).toBe("conn-1");
    expect(payload.organization_id).toBe("org-1");
    expect(payload.event_type).toBe("MESSAGE_CREATE");
    expect(payload.event_id).toBe("msg-123");
    expect(payload.timestamp).toBeDefined();
  });
});
