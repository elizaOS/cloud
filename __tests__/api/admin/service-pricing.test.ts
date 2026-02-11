
/**
 * Integration tests for admin service pricing endpoints.
 *
 * Covers:
 * - Auth: admin vs non-admin access
 * - PUT upsert behavior
 * - Cache invalidation effects
 * - Error handling (proper status codes for non-auth errors)
 */

import { NextRequest } from "next/server";
import { WalletRequiredError, AdminRequiredError } from "@/lib/auth-errors";

// Mock dependencies
jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/services/admin", () => ({
  adminService: {
    getRecentViolations: jest.fn(),
    getUsersFlaggedForReview: jest.fn(),
    getBannedUsers: jest.fn(),
    listAdmins: jest.fn(),
  },
}));

jest.mock("@/lib/repositories/service-pricing", () => ({
  servicePricingRepository: {
    listByService: jest.fn(),
    upsert: jest.fn(),
    getAuditHistory: jest.fn(),
  },
}));

jest.mock("@/lib/services/cache", () => ({
  cacheService: {
    invalidate: jest.fn(),
  },
}));

jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/lib/repositories/service-pricing";
import { cacheService } from "@/lib/services/cache";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockListByService = servicePricingRepository.listByService as jest.MockedFunction<any>;
const mockUpsert = servicePricingRepository.upsert as jest.MockedFunction<any>;
const mockCacheInvalidate = cacheService.invalidate as jest.MockedFunction<any>;

// Import handlers after mocks
let GET: any, PUT: any;

beforeAll(async () => {
  const mod = await import("@/app/api/v1/admin/service-pricing/route");
  GET = mod.GET;
  PUT = mod.PUT;
});

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options);
}

describe("Admin Service Pricing API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 when wallet is not connected", async () => {
      mockRequireAdmin.mockRejectedValue(new WalletRequiredError());

      const req = makeRequest("/api/v1/admin/service-pricing?service_id=test");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Wallet");
    });

    it("returns 403 when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new AdminRequiredError());

      const req = makeRequest("/api/v1/admin/service-pricing?service_id=test");
      const res = await GET(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Admin");
    });

    it("returns 200 for authenticated admin", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", organization_id: "org-1" },
        role: "admin",
      } as any);
      mockListByService.mockResolvedValue([]);

      const req = makeRequest("/api/v1/admin/service-pricing?service_id=test");
      const res = await GET(req);

      expect(res.status).toBe(200);
    });
  });

  describe("GET - List pricing", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", organization_id: "org-1" },
        role: "admin",
      } as any);
    });

    it("returns 400 when service_id is missing", async () => {
      const req = makeRequest("/api/v1/admin/service-pricing");
      const res = await GET(req);

      expect(res.status).toBe(400);
    });

    it("returns pricing data for valid service_id", async () => {
      mockListByService.mockResolvedValue([
        {
          id: "p1",
          method: "chat",
          cost: "0.01",
          description: "Chat method",
          metadata: {},
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const req = makeRequest("/api/v1/admin/service-pricing?service_id=openai");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.service_id).toBe("openai");
      expect(body.pricing).toHaveLength(1);
      expect(body.pricing[0].cost).toBe(0.01);
    });

    it("returns 500 on database error, not 401", async () => {
      mockListByService.mockRejectedValue(new Error("Connection refused"));

      const req = makeRequest("/api/v1/admin/service-pricing?service_id=test");
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
    });
  });

  describe("PUT - Upsert pricing", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", organization_id: "org-1" },
        role: "admin",
      } as any);
    });

    it("creates new pricing entry", async () => {
      mockUpsert.mockResolvedValue({
        id: "p1",
        service_id: "openai",
        method: "chat",
        cost: "0.05",
      });
      mockCacheInvalidate.mockResolvedValue(undefined);

      const req = makeRequest("/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({
          service_id: "openai",
          method: "chat",
          cost: 0.05,
          reason: "initial pricing",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PUT(req);

      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("invalidates cache after successful upsert", async () => {
      mockUpsert.mockResolvedValue({
        id: "p1",
        service_id: "openai",
        method: "chat",
        cost: "0.05",
      });
      mockCacheInvalidate.mockResolvedValue(undefined);

      const req = makeRequest("/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({
          service_id: "openai",
          method: "chat",
          cost: 0.05,
          reason: "update pricing",
        }),
        headers: { "Content-Type": "application/json" },
      });
      await PUT(req);

      expect(mockCacheInvalidate).toHaveBeenCalled();
    });

    it("returns 500 on database error during upsert", async () => {
      mockUpsert.mockRejectedValue(new Error("DB write failed"));

      const req = makeRequest("/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({
          service_id: "openai",
          method: "chat",
          cost: 0.05,
          reason: "update",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PUT(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
    });
  });
});
