/**
 * Integration tests for Service Pricing Admin API
 *
 * Covers:
 * - Auth: admin vs non-admin access
 * - PUT upsert behavior
 * - Cache invalidation effects
 */

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminWithResponse: vi.fn(),
}));

vi.mock("@/db/repositories", () => ({
  servicePricingRepository: {
    listByService: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/services/proxy/pricing", () => ({
  invalidateServicePricingCache: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { servicePricingRepository } from "@/db/repositories";
import { requireAdminWithResponse } from "@/lib/api/admin-auth";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { GET, PUT } from "../route";

const mockRequireAdminWithResponse = vi.mocked(requireAdminWithResponse);
const mockListByService = vi.mocked(servicePricingRepository.listByService);
const mockUpsert = vi.mocked(servicePricingRepository.upsert);
const mockInvalidateCache = vi.mocked(invalidateServicePricingCache);

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  const u = new URL(url, "http://localhost");
  if (body) {
    return new NextRequest(u, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }
  return new NextRequest(u, { method });
}

describe("Service Pricing Admin API - Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Auth: admin vs non-admin", () => {
    it("GET returns 401 for unauthenticated requests", async () => {
      mockRequireAdminWithResponse.mockResolvedValue(
        NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      );
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("GET returns 403 for non-admin users", async () => {
      mockRequireAdminWithResponse.mockResolvedValue(
        NextResponse.json({ error: "Admin access required" }, { status: 403 }),
      );
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);
      expect(response.status).toBe(403);
    });

    it("GET returns 200 for admin users", async () => {
      mockRequireAdminWithResponse.mockResolvedValue({
        user: { id: "user1", wallet_address: "0x123", organization_id: "org1" },
        role: "admin",
      } as any);
      mockListByService.mockResolvedValue([]);
      const request = createRequest(
        "GET",
        "http://localhost/api/v1/admin/service-pricing?service_id=solana-rpc",
      );
      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it("PUT returns 401 for unauthenticated requests", async () => {
      mockRequireAdminWithResponse.mockResolvedValue(
        NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      );
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "test",
        method: "test",
        cost: 0.01,
        reason: "test",
      });
      const response = await PUT(request);
      expect(response.status).toBe(401);
    });

    it("PUT returns 403 for non-admin users", async () => {
      mockRequireAdminWithResponse.mockResolvedValue(
        NextResponse.json({ error: "Admin access required" }, { status: 403 }),
      );
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "test",
        method: "test",
        cost: 0.01,
        reason: "test",
      });
      const response = await PUT(request);
      expect(response.status).toBe(403);
    });
  });

  describe("PUT upsert behavior", () => {
    beforeEach(() => {
      mockRequireAdminWithResponse.mockResolvedValue({
        user: { id: "user1", wallet_address: "0x123", organization_id: "org1" },
        role: "admin",
      } as any);
      mockInvalidateCache.mockResolvedValue(undefined);
    });

    it("creates new pricing entry", async () => {
      mockUpsert.mockResolvedValue({
        id: "1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.001",
      } as any);

      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "Initial pricing",
      });
      const response = await PUT(request);
      expect(response.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledWith(
        "solana-rpc",
        "getBalance",
        0.001,
        "user1",
        "Initial pricing",
        undefined,
        undefined,
      );
    });

    it("rejects invalid JSON body", async () => {
      const request = new NextRequest(new URL("http://localhost/api/v1/admin/service-pricing"), {
        method: "PUT",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);
      expect(response.status).toBe(400);
    });

    it("rejects missing required fields", async () => {
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "test",
        // missing method, cost, reason
      });
      const response = await PUT(request);
      expect(response.status).toBe(400);
    });

    it("rejects negative cost", async () => {
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "test",
        method: "test",
        cost: -1,
        reason: "test",
      });
      const response = await PUT(request);
      expect(response.status).toBe(400);
    });
  });

  describe("Cache invalidation", () => {
    beforeEach(() => {
      mockRequireAdminWithResponse.mockResolvedValue({
        user: { id: "user1", wallet_address: "0x123", organization_id: "org1" },
        role: "admin",
      } as any);
    });

    it("invalidates cache on successful upsert", async () => {
      mockUpsert.mockResolvedValue({
        id: "1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.001",
      } as any);
      mockInvalidateCache.mockResolvedValue(undefined);

      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "Update pricing",
      });
      const response = await PUT(request);
      expect(response.status).toBe(200);
      expect(mockInvalidateCache).toHaveBeenCalledWith("solana-rpc");
    });

    it("handles post-update cache invalidation failure gracefully", async () => {
      mockUpsert.mockResolvedValue({
        id: "1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.001",
      } as any);
      mockInvalidateCache
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Redis unavailable"));

      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "Update pricing",
      });
      // Post-update invalidation failure is visible but should not roll back the write.
      const response = await PUT(request);
      expect(response.status).toBe(200);
    });
  });
});
