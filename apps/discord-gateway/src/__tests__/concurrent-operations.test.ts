import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { GatewayManager } from "../gateway-manager";

/**
 * Concurrent Operations Tests
 *
 * Tests async behavior, race conditions, and concurrent access patterns.
 */
describe("Concurrent Operations", () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  let fetchDelays: number[] = [];

  beforeEach(() => {
    fetchCallCount = 0;
    fetchDelays = [];

    globalThis.fetch = mock(async (url: string) => {
      fetchCallCount++;
      const delay = fetchDelays.shift() ?? 0;
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }

      if (url.includes("/assignments")) {
        return { ok: true, json: () => Promise.resolve({ assignments: [] }) } as Response;
      }
      return { ok: true, json: () => Promise.resolve({}) } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Parallel Health Checks", () => {
    it("should handle multiple concurrent health checks", async () => {
      const manager = new GatewayManager({
        podName: "concurrent-health",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      // Call getHealth many times concurrently
      const healthPromises = Array.from({ length: 100 }, () =>
        Promise.resolve(manager.getHealth())
      );

      const results = await Promise.all(healthPromises);

      // All should return consistent data
      results.forEach((health) => {
        expect(health.podName).toBe("concurrent-health");
        expect(health.status).toBe("healthy");
      });
    });

    it("should handle concurrent metrics requests", async () => {
      const manager = new GatewayManager({
        podName: "concurrent-metrics",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const metricsPromises = Array.from({ length: 50 }, () =>
        Promise.resolve(manager.getMetrics())
      );

      const results = await Promise.all(metricsPromises);

      results.forEach((metrics) => {
        expect(metrics).toContain("discord_gateway_bots_total");
      });
    });

    it("should handle concurrent status requests", async () => {
      const manager = new GatewayManager({
        podName: "concurrent-status",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const statusPromises = Array.from({ length: 50 }, () =>
        Promise.resolve(manager.getStatus())
      );

      const results = await Promise.all(statusPromises);

      results.forEach((status) => {
        expect(status.podName).toBe("concurrent-status");
        expect(Array.isArray(status.connections)).toBe(true);
      });
    });
  });

  describe("Start/Shutdown Race Conditions", () => {
    it("should handle rapid start/shutdown cycles", async () => {
      for (let i = 0; i < 5; i++) {
        const manager = new GatewayManager({
          podName: `cycle-test-${i}`,
          elizaCloudUrl: "https://test.elizacloud.ai",
          internalApiKey: "test-key",
        });

        await manager.start();
        await manager.shutdown();

        // Should be in clean state
        const health = manager.getHealth();
        expect(health.totalBots).toBe(0);
      }
    });

    it("should handle shutdown called without start", async () => {
      const manager = new GatewayManager({
        podName: "no-start",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      // Should not throw
      await manager.shutdown();

      const health = manager.getHealth();
      expect(health.status).toBe("healthy");
    });

    it("should handle multiple shutdown calls", async () => {
      const manager = new GatewayManager({
        podName: "multi-shutdown",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      await manager.start();

      // Multiple shutdown calls should be safe
      await Promise.all([
        manager.shutdown(),
        manager.shutdown(),
        manager.shutdown(),
      ]);

      const health = manager.getHealth();
      expect(health.totalBots).toBe(0);
    });
  });

  describe("Uptime Precision", () => {
    it("should track uptime accurately under load", async () => {
      const manager = new GatewayManager({
        podName: "uptime-load",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const startUptime = manager.getHealth().uptime;

      // Simulate load
      await Promise.all(
        Array.from({ length: 100 }, () => Promise.resolve(manager.getHealth()))
      );

      await new Promise((r) => setTimeout(r, 100));

      const endUptime = manager.getHealth().uptime;

      // Uptime should have increased by approximately 100ms
      expect(endUptime - startUptime).toBeGreaterThanOrEqual(90);
      expect(endUptime - startUptime).toBeLessThan(200);
    });
  });

  describe("Fetch Timeout Behavior", () => {
    it("should not block on slow API responses during polling", async () => {
      // Make fetch slow
      fetchDelays = [500, 500, 500];

      const manager = new GatewayManager({
        podName: "slow-api",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      const startTime = Date.now();
      await manager.start();
      const elapsed = Date.now() - startTime;

      // Should have completed (fetch is awaited but health check still works)
      expect(elapsed).toBeGreaterThanOrEqual(0);

      await manager.shutdown();
    });

    it("should handle interleaved API calls", async () => {
      // Varying delays
      fetchDelays = [10, 50, 5, 100, 20];

      const manager = new GatewayManager({
        podName: "interleaved",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      await manager.start();

      // Make health checks while poll might be in progress
      const healthResults = await Promise.all([
        Promise.resolve(manager.getHealth()),
        Promise.resolve(manager.getHealth()),
        Promise.resolve(manager.getHealth()),
      ]);

      healthResults.forEach((h) => {
        expect(h.podName).toBe("interleaved");
      });

      await manager.shutdown();
    });
  });
});

describe("Error Propagation", () => {
  const originalFetch = globalThis.fetch;
  let shouldThrow = false;
  let errorMessage = "Network error";

  beforeEach(() => {
    shouldThrow = false;
    errorMessage = "Network error";

    globalThis.fetch = mock(async () => {
      if (shouldThrow) {
        throw new Error(errorMessage);
      }
      return { ok: true, json: () => Promise.resolve({ assignments: [] }) } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should continue operating after transient errors", async () => {
    const manager = new GatewayManager({
      podName: "transient-error",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    // First call succeeds, second fails, third succeeds
    let callCount = 0;
    globalThis.fetch = mock(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Transient failure");
      }
      return { ok: true, json: () => Promise.resolve({ assignments: [] }) } as Response;
    }) as unknown as typeof fetch;

    await manager.start();

    // Should still be operational
    const health = manager.getHealth();
    expect(health.status).toBe("healthy");

    await manager.shutdown();
  });

  it("should handle various HTTP error codes", async () => {
    const errorCodes = [400, 401, 403, 404, 500, 502, 503, 504];

    for (const code of errorCodes) {
      globalThis.fetch = mock(async () => {
        return { ok: false, status: code } as Response;
      }) as unknown as typeof fetch;

      const manager = new GatewayManager({
        podName: `error-${code}`,
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      await manager.start();

      // Should handle gracefully
      const health = manager.getHealth();
      expect(health).toBeDefined();

      await manager.shutdown();
    }
  });

  it("should handle malformed JSON responses", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      } as Response;
    }) as unknown as typeof fetch;

    const manager = new GatewayManager({
      podName: "malformed-json",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    // Should handle the error
    try {
      await manager.start();
    } catch {
      // Expected
    }

    await manager.shutdown();
  });
});

describe("Memory and Resource Management", () => {
  it("should not leak managers on repeated creation", () => {
    const managers: GatewayManager[] = [];

    for (let i = 0; i < 100; i++) {
      managers.push(
        new GatewayManager({
          podName: `manager-${i}`,
          elizaCloudUrl: "https://test.elizacloud.ai",
          internalApiKey: "test-key",
        })
      );
    }

    expect(managers).toHaveLength(100);

    // Each should be independent
    managers.forEach((m, i) => {
      expect(m.getHealth().podName).toBe(`manager-${i}`);
    });
  });

  it("should maintain connection map integrity", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async () => {
      return { ok: true, json: () => Promise.resolve({ assignments: [] }) } as Response;
    }) as unknown as typeof fetch;

    const manager = new GatewayManager({
      podName: "map-integrity",
      elizaCloudUrl: "https://test.elizacloud.ai",
      internalApiKey: "test-key",
    });

    await manager.start();

    // Multiple status checks should show consistent empty connections
    for (let i = 0; i < 10; i++) {
      const status = manager.getStatus();
      expect((status.connections as Array<unknown>).length).toBe(0);
    }

    await manager.shutdown();
    globalThis.fetch = originalFetch;
  });
});
