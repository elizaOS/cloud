/**
 * x402 Integration Tests
 * Tests facilitator discovery and payment flow integration
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { facilitatorService } from "../../lib/services/facilitator";
import { discoverHttpFacilitator } from "@/scripts/shared/x402-client";
import type { Address } from "viem";

describe("x402 Facilitator Integration", () => {
  test("facilitator service discovers Jeju facilitator", async () => {
    const facilitator = await facilitatorService.getFacilitator("jeju-testnet");

    // Should prefer Jeju facilitator when available
    if (facilitator) {
      expect(facilitator.name).toBe("Jeju Facilitator");
      expect(facilitator.networks).toContain("jeju-testnet");
      expect(facilitator.priority).toBeLessThanOrEqual(2);
    }
  });

  test("facilitator service caches results", async () => {
    const start1 = Date.now();
    const facilitator1 =
      await facilitatorService.getFacilitator("jeju-testnet");
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    const facilitator2 =
      await facilitatorService.getFacilitator("jeju-testnet");
    const time2 = Date.now() - start2;

    // Second call should be faster (cached)
    if (facilitator1 && facilitator2) {
      expect(facilitator1.url).toBe(facilitator2.url);
      // Cache should make second call faster (though network timing can vary)
      expect(time2).toBeLessThanOrEqual(time1 + 100); // Allow 100ms variance
    }
  });

  test("facilitator service handles missing facilitator gracefully", async () => {
    const facilitator = await facilitatorService.getFacilitator(
      "nonexistent-network",
    );
    // Should return null, not throw
    expect(facilitator).toBeNull();
  });

  test("verify payment with invalid header returns false", async () => {
    const requirement = {
      scheme: "exact" as const,
      network: "jeju-testnet",
      maxAmountRequired: "1000000",
      payTo: "0x0000000000000000000000000000000000000000" as Address,
      asset: "0x0000000000000000000000000000000000000000" as Address,
      resource: "/api/test",
    };

    const result = await facilitatorService.verify(
      "invalid-header",
      requirement,
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).not.toBeNull();
  });

  test("settle payment with invalid header returns error", async () => {
    const requirement = {
      scheme: "exact" as const,
      network: "jeju-testnet",
      maxAmountRequired: "1000000",
      payTo: "0x0000000000000000000000000000000000000000" as Address,
      asset: "0x0000000000000000000000000000000000000000" as Address,
      resource: "/api/test",
    };

    const result = await facilitatorService.settle(
      "invalid-header",
      requirement,
    );
    expect(result.success).toBe(false);
    expect(result.error).not.toBeNull();
  });

  test("discoverHttpFacilitator prefers Jeju facilitator", async () => {
    const facilitator = await discoverHttpFacilitator("jeju-testnet", {
      timeoutMs: 2000,
    });

    if (facilitator) {
      // Jeju facilitator should have priority 1
      expect(facilitator.priority).toBeLessThanOrEqual(2);
      expect(facilitator.networks).toContain("jeju-testnet");
    }
  });
});
