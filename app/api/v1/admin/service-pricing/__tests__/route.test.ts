
import { NextRequest } from "next/server";

// Mock dependencies before imports
jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/db/repositories", () => ({
  servicePricingRepository: {
    listAll: jest.fn(),
    upsert: jest.fn(),
  },
}));

jest.mock("@/lib/services/proxy/pricing", () => ({
  invalidateServicePricingCache: jest.fn(),
}));

jest.mock("@/lib/cache/client", () => ({
  cache: {
    del: jest.fn(),
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

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;

function createRequest(method: string, url: string, body?: object): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost"), init);
}

describe("Service Pricing Admin API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/v1/admin/service-pricing", () => {
    it("returns 401 for unauthenticated requests", async () => {
      const { AuthenticationError } = await import("@/lib/api/errors");
      mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));

      const { GET } = await import("../route");
      const req = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin users", async () => {
      const { ForbiddenError } = await import("@/lib/api/errors");
      mockRequireAdmin.mockRejectedValue(new ForbiddenError("Admin access required"));

      const { GET } = await import("../route");
      const req = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const res = await GET(req);

      expect(res.status).toBe(403);
    });

    it("returns pricing list for admin users", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", wallet_address: "0x123", organization_id: "org-1" } as any,
        role: "admin",
        isAdmin: true,
      });
      (servicePricingRepository.listAll as jest.Mock).mockResolvedValue([]);

      const { GET } = await import("../route");
      const req = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const res = await GET(req);

      expect(res.status).toBe(200);
    });
  });

  describe("PUT /api/v1/admin/service-pricing", () => {
    it("returns 401 for unauthenticated requests", async () => {
      const { AuthenticationError } = await import("@/lib/api/errors");
      mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));

      const { PUT } = await import("../route");
      const req = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "test",
      });
      const res = await PUT(req);

      expect(res.status).toBe(401);
    });

    it("upserts pricing and invalidates cache", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", wallet_address: "0x123", organization_id: "org-1" } as any,
        role: "admin",
        isAdmin: true,
      });
      (servicePricingRepository.upsert as jest.Mock).mockResolvedValue({
        id: "pricing-1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost_per_request: "0.001",
      });
      (invalidateServicePricingCache as jest.Mock).mockResolvedValue(undefined);

      const { PUT } = await import("../route");
      const req = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "test update",
      });
      const res = await PUT(req);

      expect(res.status).toBe(200);
      expect(invalidateServicePricingCache).toHaveBeenCalled();
    });

    it("returns 400 for invalid body", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", wallet_address: "0x123", organization_id: "org-1" } as any,
        role: "admin",
        isAdmin: true,
      });

      const { PUT } = await import("../route");
      const req = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        // missing required fields
      });
      const res = await PUT(req);

      expect(res.status).toBe(400);
    });
  });
});
