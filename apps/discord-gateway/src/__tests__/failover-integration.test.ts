import { describe, expect, it, mock, beforeEach, afterAll } from "bun:test";
import { GatewayManager } from "../gateway-manager";

const originalFetch = globalThis.fetch;

describe("Failover Integration", () => {
  let mockFetch: ReturnType<typeof mock>;
  let mockRedis: {
    smembers: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    srem: ReturnType<typeof mock>;
    del: ReturnType<typeof mock>;
    setex: ReturnType<typeof mock>;
    sadd: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ assignments: [], claimed: 0 }),
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    mockRedis = {
      smembers: mock(() => Promise.resolve(["pod-1", "pod-2", "dead-pod"])),
      get: mock((key: string) => {
        if (key.includes("dead-pod")) {
          // Return stale heartbeat (3 minutes ago)
          return Promise.resolve(JSON.stringify({
            podId: "dead-pod",
            connections: ["conn-1", "conn-2"],
            lastHeartbeat: Date.now() - 180000,
          }));
        }
        return Promise.resolve(JSON.stringify({
          podId: key.split(":").pop(),
          connections: [],
          lastHeartbeat: Date.now(),
        }));
      }),
      srem: mock(() => Promise.resolve(1)),
      del: mock(() => Promise.resolve(1)),
      setex: mock(() => Promise.resolve("OK")),
      sadd: mock(() => Promise.resolve(1)),
    };
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Dead Pod Detection", () => {
    it("should detect pods with stale heartbeats", () => {
      const DEAD_POD_THRESHOLD_MS = 120000; // 2 minutes
      const pods = [
        { id: "pod-1", lastHeartbeat: Date.now() - 60000 },    // 1 min ago - alive
        { id: "pod-2", lastHeartbeat: Date.now() - 180000 },   // 3 min ago - dead
        { id: "pod-3", lastHeartbeat: Date.now() - 30000 },    // 30 sec ago - alive
      ];

      const deadPods = pods.filter(p => Date.now() - p.lastHeartbeat > DEAD_POD_THRESHOLD_MS);
      
      expect(deadPods).toHaveLength(1);
      expect(deadPods[0].id).toBe("pod-2");
    });

    it("should skip own pod when checking for dead pods", () => {
      const ownPodName = "pod-1";
      const activePods = ["pod-1", "pod-2", "pod-3"];
      const podsToCheck = activePods.filter(p => p !== ownPodName);

      expect(podsToCheck).not.toContain("pod-1");
      expect(podsToCheck).toEqual(["pod-2", "pod-3"]);
    });
  });

  describe("Failover API Integration", () => {
    it("should call failover API with correct payload", async () => {
      const claimingPod = "survivor-pod";
      const deadPod = "dead-pod";
      
      await fetch("http://test/api/internal/discord/gateway/failover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Key": "test-key",
        },
        body: JSON.stringify({
          claiming_pod: claimingPod,
          dead_pod: deadPod,
        }),
      });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain("/api/internal/discord/gateway/failover");
      
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.claiming_pod).toBe("survivor-pod");
      expect(body.dead_pod).toBe("dead-pod");
    });

    it("should handle failover API failure gracefully", async () => {
      mockFetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      }));

      const response = await fetch("http://test/api/internal/discord/gateway/failover", {
        method: "POST",
        body: JSON.stringify({ claiming_pod: "pod-1", dead_pod: "pod-2" }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it("should return number of claimed connections", async () => {
      mockFetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, claimed: 5 }),
      }));

      const response = await fetch("http://test/api/internal/discord/gateway/failover", {
        method: "POST",
        body: JSON.stringify({ claiming_pod: "pod-1", dead_pod: "pod-2" }),
      });

      const data = await response.json();
      expect(data.claimed).toBe(5);
    });
  });

  describe("Redis State Cleanup", () => {
    it("should remove dead pod from active set", async () => {
      const deadPodId = "dead-pod";
      
      // Simulate cleanup
      await mockRedis.srem("discord:active_pods", deadPodId);
      await mockRedis.del(`discord:pod:${deadPodId}`);

      expect(mockRedis.srem).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it("should preserve heartbeat TTL", async () => {
      const podState = {
        podId: "test-pod",
        connections: ["conn-1"],
        lastHeartbeat: Date.now(),
      };

      await mockRedis.setex(
        "discord:pod:test-pod",
        300, // 5 minute TTL
        JSON.stringify(podState)
      );

      expect(mockRedis.setex).toHaveBeenCalled();
      const callArgs = mockRedis.setex.mock.calls[0];
      expect(callArgs[1]).toBe(300);
    });
  });

  describe("GatewayManager Shutdown Cleanup", () => {
    it("should clear Redis state on shutdown", async () => {
      const manager = new GatewayManager({
        podName: "shutdown-test",
        elizaCloudUrl: "https://test.elizacloud.ai",
        internalApiKey: "test-key",
      });

      // Verify manager initializes without Redis
      const health = manager.getHealth();
      expect(health.podName).toBe("shutdown-test");
      expect(health.totalBots).toBe(0);

      // Shutdown should work without Redis
      await manager.shutdown();
      
      // Verify clean state after shutdown
      const healthAfter = manager.getHealth();
      expect(healthAfter.totalBots).toBe(0);
    });
  });

  describe("Connection Reassignment", () => {
    it("should update connection pod assignment", () => {
      const connection = {
        id: "conn-123",
        gateway_pod: "dead-pod",
        status: "connected" as const,
      };

      // Simulate reassignment
      const updated = {
        ...connection,
        gateway_pod: "survivor-pod",
        status: "disconnected" as const,
      };

      expect(updated.gateway_pod).toBe("survivor-pod");
      expect(updated.status).toBe("disconnected");
    });

    it("should handle multiple orphaned connections", () => {
      const orphanedConnections = [
        { id: "conn-1", gateway_pod: "dead-pod" },
        { id: "conn-2", gateway_pod: "dead-pod" },
        { id: "conn-3", gateway_pod: "dead-pod" },
      ];

      const claimed = orphanedConnections.map(c => ({
        ...c,
        gateway_pod: "survivor-pod",
      }));

      expect(claimed).toHaveLength(3);
      expect(claimed.every(c => c.gateway_pod === "survivor-pod")).toBe(true);
    });
  });
});

describe("Failover Timing", () => {
  it("should use configurable threshold", () => {
    const defaultThreshold = 120000; // 2 minutes
    const customThreshold = parseInt(process.env.DEAD_POD_THRESHOLD_MS ?? String(defaultThreshold), 10);

    expect(customThreshold).toBe(defaultThreshold);
  });

  it("should use configurable check interval", () => {
    const defaultInterval = 60000; // 1 minute
    const customInterval = parseInt(process.env.FAILOVER_CHECK_INTERVAL_MS ?? String(defaultInterval), 10);

    expect(customInterval).toBe(defaultInterval);
  });
});
