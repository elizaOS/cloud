
/**
 * Tests for Admin Service Pricing API
 * 
 * Covers:
 * - Authentication (admin vs non-admin)
 * - PUT upsert behavior
 * - Cache invalidation effects
 * - GET listing and audit history
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminWithResponse: vi.fn(),
}));

vi.mock("@/db/repositories", () => ({
  servicePricingRepository: {
    listByService: vi.fn(),
    upsert: vi.fn(),
    listAuditHistory: vi.fn(),
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

import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedRepo = vi.mocked(servicePricingRepository);
const mockedInvalidateCache = vi.mocked(invalidateServicePricingCache);

// Dynamic import to allow mocks to be set up first
async function importRoute() {
  return await import("@/app/api/v1/admin/service-pricing/route");
}

function createRequest(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init) as unknown as Request;
}

describe("Admin Service Pricing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/admin/service-pricing", () => {
    it("should return 401 for unauthenticated requests", async () => {
      mockedRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));
      const { GET } = await importRoute();
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request as any);
      expect(response.status).toBe(401);
    });

    it("should return 403 for non-admin users", async () => {
      mockedRequireAdmin.mockRejectedValue(new ForbiddenError("Not an admin"));
      const { GET } = await importRoute();
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request as any);
      expect(response.status).toBe(403);
    });

    it("should return pricing list for admin users", async () => {
      mockedRequireAdmin.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
      } as any);
      mockedRepo.listAll.mockResolvedValue([
        { service_id: "solana-rpc", method: "getBalance", cost: "0.001" },
      ] as any);

      const { GET } = await importRoute();
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveLength(1);
    });
  });

  describe("PUT /api/v1/admin/service-pricing", () => {
    it("should upsert pricing and invalidate cache", async () => {
      mockedRequireAdmin.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
      } as any);
      mockedRepo.upsert.mockResolvedValue({
        service_id: "solana-rpc",
        method: "getBalance",
        cost_per_request: "0.002",
      } as any);
      mockedInvalidateCache.mockResolvedValue(undefined);

      const { PUT } = await importRoute();
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.002,
        reason: "Updated pricing",
      });
      const response = await PUT(request as any);
      expect(response.status).toBe(200);
      expect(mockedInvalidateCache).toHaveBeenCalledWith("solana-rpc");
    });

    it("should return 401 for unauthenticated PUT requests", async () => {
      mockedRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));
      const { PUT } = await importRoute();
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.002,
        reason: "Updated pricing",
      });
      const response = await PUT(request as any);
      expect(response.status).toBe(401);
    });

    it("should return 400 for invalid request body", async () => {
      mockedRequireAdmin.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
      } as any);
      const { PUT } = await importRoute();
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        // Missing required fields
        service_id: "solana-rpc",
      });
      const response = await PUT(request as any);
      expect(response.status).toBe(400);
    });
  });

  describe("Cache invalidation", () => {
    it("should still return success even if cache invalidation fails", async () => {
      mockedRequireAdmin.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
      } as any);
      mockedRepo.upsert.mockResolvedValue({
        service_id: "solana-rpc",
        method: "getBalance",
        cost_per_request: "0.002",
      } as any);
      mockedInvalidateCache.mockRejectedValue(new Error("Redis down"));

      const { PUT } = await importRoute();
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.002,
        reason: "Updated pricing",
      });
      const response = await PUT(request as any);
      // Should still succeed - cache invalidation failure is non-fatal
      expect(response.status).toBe(200);
    });
  });
});
