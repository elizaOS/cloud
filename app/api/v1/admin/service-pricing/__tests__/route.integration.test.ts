
/**
 * Integration tests for Service Pricing Admin API
 * 
 * Covers:
 * - Auth: admin vs non-admin access
 * - PUT upsert behavior
 * - Cache invalidation effects
 */

import { NextRequest } from "next/server";

// Mock dependencies before imports
jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/db/repositories", () => ({
  servicePricingRepository: {
    list: jest.fn(),
    upsert: jest.fn(),
    listAuditHistory: jest.fn(),
  },
}));

jest.mock("@/lib/services/proxy/pricing", () => ({
  invalidateServicePricingCache: jest.fn(),
}));

jest.mock("@/lib/cache/client", () => ({
  cache: {
    delete: jest.fn(),
  },
}));

jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { GET, PUT } from "../route";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockList = servicePricingRepository.list as jest.MockedFunction<typeof servicePricingRepository.list>;
const mockUpsert = servicePricingRepository.upsert as jest.MockedFunction<typeof servicePricingRepository.upsert>;
const mockInvalidateCache = invalidateServicePricingCache as jest.MockedFunction<typeof invalidateServicePricingCache>;

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

describe("Service Pricing Admin API - Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Auth: admin vs non-admin", () => {
    it("GET returns 401 for unauthenticated requests", async () => {
      mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("GET returns 403 for non-admin users", async () => {
      mockRequireAdmin.mockRejectedValue(new ForbiddenError("Admin access required"));
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);
      expect(response.status).toBe(403);
    });

    it("GET returns 200 for admin users", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user1", wallet_address: "0x123", organization_id: "org1" },
        role: "admin",
      } as any);
      mockList.mockResolvedValue([]);
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it("PUT returns 401 for unauthenticated requests", async () => {
      mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));
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
      mockRequireAdmin.mockRejectedValue(new ForbiddenError("Admin access required"));
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
      mockRequireAdmin.mockResolvedValue({
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
        expect.any(String),
        expect.any(String),
      );
    });

    it("rejects invalid JSON body", async () => {
      const request = new NextRequest(
        new URL("http://localhost/api/v1/admin/service-pricing"),
        {
          method: "PUT",
          body: "not json",
          headers: { "Content-Type": "application/json" },
        },
      );
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
      mockRequireAdmin.mockResolvedValue({
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

    it("handles cache invalidation failure gracefully", async () => {
      mockUpsert.mockResolvedValue({
        id: "1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.001",
      } as any);
      mockInvalidateCache.mockRejectedValue(new Error("Redis unavailable"));

      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "Update pricing",
      });
      // Should still succeed - cache invalidation failure shouldn't break the upsert
      const response = await PUT(request);
      expect(response.status).toBe(200);
    });
  });
});
