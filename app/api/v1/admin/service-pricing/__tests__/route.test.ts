
import { NextRequest } from "next/server";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";

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

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockListAll = servicePricingRepository.listAll as jest.MockedFunction<typeof servicePricingRepository.listAll>;
const mockUpsert = servicePricingRepository.upsert as jest.MockedFunction<typeof servicePricingRepository.upsert>;
const mockInvalidateCache = invalidateServicePricingCache as jest.MockedFunction<typeof invalidateServicePricingCache>;

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
    it("returns 401 when user is not authenticated", async () => {
      mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));

      const { GET } = await import("../route");
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("returns 403 when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new ForbiddenError("Admin access required"));

      const { GET } = await import("../route");
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("returns pricing list for authenticated admin", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", organization_id: "org-1" } as any,
        role: "admin",
        isAdmin: true,
      });
      mockListAll.mockResolvedValue([
        {
          id: "price-1",
          service_id: "solana-rpc",
          method: "getBalance",
          cost_per_request: "0.001",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          description: null,
          metadata: null,
        } as any,
      ]);

      const { GET } = await import("../route");
      const request = createRequest("GET", "http://localhost/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.pricing).toBeDefined();
      expect(Array.isArray(data.pricing)).toBe(true);
    });
  });

  describe("PUT /api/v1/admin/service-pricing", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));

      const { PUT } = await import("../route");
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "test",
      });
      const response = await PUT(request);

      expect(response.status).toBe(401);
    });

    it("returns 403 when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new ForbiddenError("Admin access required"));

      const { PUT } = await import("../route");
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "test",
      });
      const response = await PUT(request);

      expect(response.status).toBe(403);
    });

    it("validates request body schema", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", organization_id: "org-1" } as any,
        role: "admin",
        isAdmin: true,
      });

      const { PUT } = await import("../route");
      // Missing required fields
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
      });
      const response = await PUT(request);

      expect(response.status).toBe(400);
    });

    it("upserts pricing and invalidates cache", async () => {
      mockRequireAdmin.mockResolvedValue({
        user: { id: "user-1", organization_id: "org-1" } as any,
        role: "admin",
        isAdmin: true,
      });
      mockUpsert.mockResolvedValue({
        id: "price-1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost_per_request: "0.001",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        description: null,
        metadata: null,
      } as any);
      mockInvalidateCache.mockResolvedValue(undefined);

      const { PUT } = await import("../route");
      const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
        service_id: "solana-rpc",
        method: "getBalance",
        cost: 0.001,
        reason: "Initial pricing",
      });
      const response = await PUT(request);

      expect(response.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalled();
      expect(mockInvalidateCache).toHaveBeenCalledWith("solana-rpc", "getBalance");
    });
  });
});
