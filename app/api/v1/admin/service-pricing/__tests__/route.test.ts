
import { NextRequest } from "next/server";
import { GET, PUT } from "../route";
import { requireAuthWithOrg } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories/service-pricing";
import { cache } from "@/lib/cache/client";

jest.mock("@/lib/auth");
jest.mock("@/db/repositories/service-pricing");
jest.mock("@/lib/cache/client");

const mockRequireAuthWithOrg = requireAuthWithOrg as jest.MockedFunction<typeof requireAuthWithOrg>;
const mockGetPricing = servicePricingRepository.getPricing as jest.MockedFunction<typeof servicePricingRepository.getPricing>;
const mockUpsertPricing = servicePricingRepository.upsertPricing as jest.MockedFunction<typeof servicePricingRepository.upsertPricing>;
const mockDeleteCache = cache.del as jest.MockedFunction<typeof cache.del>;

describe("Service Pricing API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/v1/admin/service-pricing", () => {
    it("should require admin authentication", async () => {
      mockRequireAuthWithOrg.mockResolvedValue({
        user: { id: "user1", organization_id: "org1", role: "user" },
      });

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain("Admin access required");
    });

    it("should return pricing list for admin users", async () => {
      mockRequireAuthWithOrg.mockResolvedValue({
        user: { id: "admin1", organization_id: "org1", role: "admin" },
      });

      const mockPricing = [
        { service_id: "solana-rpc", method: "getBalance", cost: "0.000006" },
        { service_id: "solana-rpc", method: "getAccountInfo", cost: "0.000006" },
      ];
      mockGetPricing.mockResolvedValue(mockPricing);

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pricing).toEqual(mockPricing);
      expect(mockGetPricing).toHaveBeenCalledWith("solana-rpc", undefined, undefined);
    });
  });

  describe("PUT /api/v1/admin/service-pricing", () => {
    it("should require admin authentication for upsert", async () => {
      mockRequireAuthWithOrg.mockResolvedValue({
        user: { id: "user1", organization_id: "org1", role: "user" },
      });

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ service_id: "solana-rpc", method: "test", cost: "0.001" }),
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain("Admin access required");
    });

    it("should upsert pricing and invalidate cache", async () => {
      mockRequireAuthWithOrg.mockResolvedValue({
        user: { id: "admin1", organization_id: "org1", role: "admin" },
      });

      const mockUpdated = { service_id: "solana-rpc", method: "getBalance", cost: "0.00001" };
      mockUpsertPricing.mockResolvedValue(mockUpdated);
      mockDeleteCache.mockResolvedValue(1);

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ 
          service_id: "solana-rpc", 
          method: "getBalance", 
          cost: "0.00001",
          reason: "Price adjustment"
        }),
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pricing).toEqual(mockUpdated);
      expect(mockUpsertPricing).toHaveBeenCalledWith(
        "solana-rpc",
        "getBalance",
        "0.00001",
        "admin1",
        "Price adjustment",
        undefined
      );
      expect(mockDeleteCache).toHaveBeenCalledWith("pricing:solana-rpc:getBalance");
    });

    it("should handle cache invalidation failures gracefully", async () => {
      mockRequireAuthWithOrg.mockResolvedValue({
        user: { id: "admin1", organization_id: "org1", role: "admin" },
      });

      const mockUpdated = { service_id: "solana-rpc", method: "test", cost: "0.001" };
      mockUpsertPricing.mockResolvedValue(mockUpdated);
      mockDeleteCache.mockRejectedValue(new Error("Cache error"));

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({ service_id: "solana-rpc", method: "test", cost: "0.001" }),
      });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cache_invalidated).toBe(false);
    });
  });
});
