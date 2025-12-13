import { describe, expect, it, mock, beforeEach } from "bun:test";
import { GatewayManager } from "../gateway-manager";

// Mock fetch globally
const mockFetch = mock(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ assignments: [] }),
}));
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe("GatewayManager", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should initialize with config", () => {
    const manager = new GatewayManager({
      podName: "test-pod",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    expect(manager).toBeDefined();
    const health = manager.getHealth();
    expect(health.podName).toBe("test-pod");
    expect(health.totalBots).toBe(0);
    expect(health.status).toBe("healthy");
  });

  it("should return correct health status", () => {
    const manager = new GatewayManager({
      podName: "health-test-pod",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    const health = manager.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.totalBots).toBe(0);
    expect(health.connectedBots).toBe(0);
    expect(health.disconnectedBots).toBe(0);
    expect(health.totalGuilds).toBe(0);
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should generate prometheus metrics", () => {
    const manager = new GatewayManager({
      podName: "metrics-test-pod",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    const metrics = manager.getMetrics();
    expect(metrics).toContain("discord_gateway_bots_total");
    expect(metrics).toContain("discord_gateway_bots_connected");
    expect(metrics).toContain("discord_gateway_guilds_total");
    expect(metrics).toContain("discord_gateway_uptime_seconds");
    expect(metrics).toContain('pod="metrics-test-pod"');
  });

  it("should return detailed status", () => {
    const manager = new GatewayManager({
      podName: "status-test-pod",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    const status = manager.getStatus();
    expect(status.podName).toBe("status-test-pod");
    expect(status.startTime).toBeDefined();
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(status.connections)).toBe(true);
    expect(status.connections).toHaveLength(0);
  });

  it("should handle Redis configuration", () => {
    // With both URL and token
    const managerWithToken = new GatewayManager({
      podName: "redis-test-pod",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
      redisUrl: "https://redis.upstash.io",
      redisToken: "test-token",
    });
    expect(managerWithToken).toBeDefined();

    // Without Redis
    const managerWithoutRedis = new GatewayManager({
      podName: "no-redis-pod",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });
    expect(managerWithoutRedis).toBeDefined();
  });
});
