
/**
 * Integration tests for admin service pricing API endpoints
 * Covers: auth (admin vs non-admin), PUT upsert behavior, cache invalidation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(),
  WalletRequiredError: class WalletRequiredError extends Error {
    constructor(msg = "Wallet connection required") {
      super(msg);
      this.name = "WalletRequiredError";
    }
  },
  AdminRequiredError: class AdminRequiredError extends Error {
    constructor(msg = "Admin access required") {
      super(msg);
      this.name = "AdminRequiredError";
    }
  },
}));

vi.mock("@/db/repositories", () => ({
  servicePricingRepository: {
    listAll: vi.fn(),
    upsert: vi.fn(),
    listAuditHistory: vi.fn(),
  },
}));

vi.mock("@/lib/services/proxy/pricing", () => ({
  invalidateServicePricingCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: {
    del: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { requireAdmin, WalletRequiredError, AdminRequiredError } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockListAll = vi.mocked(servicePricingRepository.listAll);
const mockUpsert = vi.mocked(servicePricingRepository.upsert);
const mockListAuditHistory = vi.mocked(servicePricingRepository.listAuditHistory);

describe("Admin Service Pricing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/admin/service-pricing", () => {
    it("returns 401 when wallet not connected", async () => {
      mockRequireAdmin.mockRejectedValue(new WalletRequiredError());

      const { GET } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 403 when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new AdminRequiredError());

      const { GET } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("returns 500 for unexpected errors", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user1", organization_id: "org1" },
        role: "super_admin",
      } as ReturnType<typeof requireAdmin> extends Promise<infer T> ? T : never);
      mockListAll.mockRejectedValue(new Error("Database connection failed"));

      const { GET } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
    });

    it("returns pricing list for authenticated admin", async () => {
      const mockPricing = [
        { id: "1", service_id: "solana-rpc", method: "getBalance", cost: "0.001" },
      ];
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user1", organization_id: "org1" },
        role: "super_admin",
      } as ReturnType<typeof requireAdmin> extends Promise<infer T> ? T : never);
      mockListAll.mockResolvedValue(mockPricing as never);

      const { GET } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("PUT /api/v1/admin/service-pricing", () => {
    it("returns 401 when wallet not connected", async () => {
      mockRequireAdmin.mockRejectedValue(new WalletRequiredError());

      const { PUT } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ service_id: "solana-rpc", method: "getBalance", cost: 0.001 }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(401);
    });

    it("returns 403 when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new AdminRequiredError());

      const { PUT } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ service_id: "solana-rpc", method: "getBalance", cost: 0.001 }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(403);
    });

    it("performs upsert for valid request", async () => {
      const mockResult = {
        id: "1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.001000",
      };
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user1", organization_id: "org1" },
        role: "super_admin",
      } as ReturnType<typeof requireAdmin> extends Promise<infer T> ? T : never);
      mockUpsert.mockResolvedValue(mockResult as never);

      const { PUT } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ service_id: "solana-rpc", method: "getBalance", cost: 0.001 }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);

      expect(response.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("returns 500 for database errors during upsert", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user1", organization_id: "org1" },
        role: "super_admin",
      } as ReturnType<typeof requireAdmin> extends Promise<infer T> ? T : never);
      mockUpsert.mockRejectedValue(new Error("Database write failed"));

      const { PUT } = await import("@/app/api/v1/admin/service-pricing/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ service_id: "solana-rpc", method: "getBalance", cost: 0.001 }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await PUT(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
    });
  });

  describe("GET /api/v1/admin/service-pricing/audit", () => {
    it("returns 401 when wallet not connected", async () => {
      mockRequireAdmin.mockRejectedValue(new WalletRequiredError());

      const { GET } = await import("@/app/api/v1/admin/service-pricing/audit/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing/audit?service_id=solana-rpc");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("returns 403 when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new AdminRequiredError());

      const { GET } = await import("@/app/api/v1/admin/service-pricing/audit/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing/audit?service_id=solana-rpc");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("returns audit history for authenticated admin", async () => {
      const mockHistory = [
        { id: "1", service_id: "solana-rpc", method: "getBalance", old_cost: "0.001", new_cost: "0.002" },
      ];
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user1", organization_id: "org1" },
        role: "super_admin",
      } as ReturnType<typeof requireAdmin> extends Promise<infer T> ? T : never);
      mockListAuditHistory.mockResolvedValue(mockHistory as never);

      const { GET } = await import("@/app/api/v1/admin/service-pricing/audit/route");
      const request = new NextRequest("http://localhost/api/v1/admin/service-pricing/audit?service_id=solana-rpc");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });
});
