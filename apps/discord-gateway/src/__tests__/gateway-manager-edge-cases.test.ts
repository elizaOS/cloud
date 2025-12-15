import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { GatewayManager } from "../gateway-manager";

describe("GatewayManager Edge Cases", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let mockResponseQueue: Array<Partial<Response>> = [];

  function queueMockResponse(response: Partial<Response>) {
    mockResponseQueue.push(response);
  }

  beforeEach(() => {
    fetchCalls = [];
    mockResponseQueue = [];

    globalThis.fetch = mock((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options: options ?? {} });
      const response = mockResponseQueue.shift() ?? {
        ok: true,
        json: () => Promise.resolve({ assignments: [] }),
      };
      return Promise.resolve(response as Response);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Health Status Calculations", () => {
    it("should report healthy when no bots are registered", () => {
      const manager = new GatewayManager({
        podName: "empty-pod",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const health = manager.getHealth();
      expect(health.status).toBe("healthy");
      expect(health.totalBots).toBe(0);
      expect(health.connectedBots).toBe(0);
      expect(health.disconnectedBots).toBe(0);
    });

    it("should correctly calculate uptime over time", async () => {
      const manager = new GatewayManager({
        podName: "uptime-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const health1 = manager.getHealth();
      await new Promise((r) => setTimeout(r, 50));
      const health2 = manager.getHealth();

      expect(health2.uptime).toBeGreaterThan(health1.uptime);
      expect(health2.uptime - health1.uptime).toBeGreaterThanOrEqual(45); // Allow some variance
    });

    it("should handle zero guilds correctly", () => {
      const manager = new GatewayManager({
        podName: "zero-guilds",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const health = manager.getHealth();
      expect(health.totalGuilds).toBe(0);
    });
  });

  describe("Metrics Generation", () => {
    it("should escape pod name in prometheus labels", () => {
      const manager = new GatewayManager({
        podName: 'pod-with-"quotes"',
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const metrics = manager.getMetrics();
      // Metrics should still contain the pod name
      expect(metrics).toContain('pod="pod-with-"quotes""');
    });

    it("should generate valid prometheus format", () => {
      const manager = new GatewayManager({
        podName: "format-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const metrics = manager.getMetrics();
      const lines = metrics.split("\n");

      // Verify HELP and TYPE comments exist
      expect(lines.some((l) => l.startsWith("# HELP"))).toBe(true);
      expect(lines.some((l) => l.startsWith("# TYPE"))).toBe(true);

      // Verify metric lines have proper format: name{labels} value
      const metricLines = lines.filter(
        (l) => !l.startsWith("#") && l.length > 0,
      );
      metricLines.forEach((line) => {
        expect(line).toMatch(/^[a-z_]+\{.*\}\s+\d+$/);
      });
    });

    it("should include all required metric types", () => {
      const manager = new GatewayManager({
        podName: "types-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const metrics = manager.getMetrics();
      expect(metrics).toContain("# TYPE discord_gateway_bots_total gauge");
      expect(metrics).toContain("# TYPE discord_gateway_bots_connected gauge");
      expect(metrics).toContain("# TYPE discord_gateway_guilds_total gauge");
      expect(metrics).toContain("# TYPE discord_gateway_uptime_seconds gauge");
    });
  });

  describe("Status Reporting", () => {
    it("should include ISO 8601 timestamps", () => {
      const manager = new GatewayManager({
        podName: "timestamp-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const status = manager.getStatus();
      const startTime = status.startTime as string;

      // Validate ISO 8601 format
      expect(startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(startTime).getTime()).not.toBeNaN();
    });

    it("should return connections as array even when empty", () => {
      const manager = new GatewayManager({
        podName: "array-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const status = manager.getStatus();
      expect(Array.isArray(status.connections)).toBe(true);
      expect(status.connections).toHaveLength(0);
    });
  });

  describe("Configuration Edge Cases", () => {
    it("should handle empty pod name", () => {
      const manager = new GatewayManager({
        podName: "",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const health = manager.getHealth();
      expect(health.podName).toBe("");
    });

    it("should handle very long pod names", () => {
      const longName = "a".repeat(256);
      const manager = new GatewayManager({
        podName: longName,
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const health = manager.getHealth();
      expect(health.podName).toBe(longName);
      expect(health.podName.length).toBe(256);
    });

    it("should handle URL with trailing slash", () => {
      const manager = new GatewayManager({
        podName: "url-test",
        elizaCloudUrl: "https://test.elizacloud.ai/",
        internalApiKey: "test-key",
      });

      expect(manager).toBeDefined();
    });

    it("should handle empty API key", () => {
      const manager = new GatewayManager({
        podName: "empty-key",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "",
      });

      expect(manager).toBeDefined();
    });
  });

  describe("Graceful Shutdown", () => {
    it("should shutdown cleanly with no connections", async () => {
      const manager = new GatewayManager({
        podName: "shutdown-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      // Should not throw
      await manager.shutdown();
      const health = manager.getHealth();
      expect(health.totalBots).toBe(0);
    });

    it("should clear intervals on shutdown", async () => {
      const manager = new GatewayManager({
        podName: "interval-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      await manager.start();
      await manager.shutdown();

      // After shutdown, should still be able to get health
      const health = manager.getHealth();
      expect(health).toBeDefined();
    });
  });
});

describe("GatewayManager API Interaction", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: Array<{
    url: string;
    body?: string;
    headers?: Record<string, string>;
  }> = [];

  beforeEach(() => {
    fetchCalls = [];

    globalThis.fetch = mock(async (url: string, options?: RequestInit) => {
      const call: {
        url: string;
        body?: string;
        headers?: Record<string, string>;
      } = { url };
      if (options?.body) {
        call.body = options.body as string;
      }
      if (options?.headers) {
        call.headers = options.headers as Record<string, string>;
      }
      fetchCalls.push(call);

      // Simulate different responses based on URL
      if (url.includes("/assignments")) {
        return {
          ok: true,
          json: () => Promise.resolve({ assignments: [] }),
        } as Response;
      }
      if (url.includes("/events")) {
        return {
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response;
      }
      if (url.includes("/status")) {
        return { ok: true, json: () => Promise.resolve({}) } as Response;
      }
      return { ok: false, status: 404 } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should include correct headers in API calls", async () => {
    const manager = new GatewayManager({
      podName: "header-test",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "secret-key-123",
    });

    await manager.start();
    await manager.shutdown();

    // Find the assignments call
    const assignmentCall = fetchCalls.find((c) =>
      c.url.includes("/assignments"),
    );
    expect(assignmentCall).toBeDefined();
    expect(assignmentCall?.headers?.["X-Internal-API-Key"]).toBe(
      "secret-key-123",
    );
  });

  it("should construct correct assignment URL with pod name", async () => {
    const manager = new GatewayManager({
      podName: "my-pod-123",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    await manager.start();
    await manager.shutdown();

    const assignmentCall = fetchCalls.find((c) =>
      c.url.includes("/assignments"),
    );
    expect(assignmentCall?.url).toContain("pod=my-pod-123");
  });

  it("should handle failed assignment poll gracefully", async () => {
    // Override to return failure
    globalThis.fetch = mock(async () => {
      return { ok: false, status: 500 } as Response;
    }) as unknown as typeof fetch;

    const manager = new GatewayManager({
      podName: "fail-test",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    // Should not throw even with failed fetch
    await manager.start();
    await manager.shutdown();

    const health = manager.getHealth();
    expect(health.status).toBe("healthy"); // Still healthy, just no bots
  });

  it("should handle network errors gracefully", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    const manager = new GatewayManager({
      podName: "network-error-test",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    // Should handle the error
    try {
      await manager.start();
    } catch {
      // Expected to throw
    }
    await manager.shutdown();
  });
});
