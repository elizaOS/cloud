
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "../route";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories/service-pricing";
import { cache } from "@/lib/cache/client";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";

vi.mock("@/lib/auth");
vi.mock("@/db/repositories/service-pricing");
vi.mock("@/lib/cache/client");

describe("Admin Service Pricing API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/admin/service-pricing", () => {
    it("should return 401 when authentication fails", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError("Wallet connection required"));
      
      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc");
      const response = await GET(request);
      
      expect(response.status).toBe(401);
      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
    });

    it("should return 403 when user is not admin", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError("Admin access required"));
      
      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc");
      const response = await GET(request);
      
      expect(response.status).toBe(403);
      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
    });

    it("should return 400 when service_id is missing", async () => {
      vi.mocked(requireAdmin).mockResolvedValue({
        user: { id: "user-1", wallet_address: "wallet-1", organization_id: "org-1" } as any,
        role: "super_admin",
      });

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing");
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("service_id query parameter is required");
    });

    it("should return pricing list for valid service_id", async () => {
      vi.mocked(requireAdmin).mockResolvedValue({
        user: { id: "user-1", wallet_address: "wallet-1", organization_id: "org-1" } as any,
        role: "super_admin",
      });

      const mockPricing = [
        {
          id: "pricing-1",
          service_id: "solana-rpc",
          method: "getBalance",
          cost: "0.000006",
          description: "Get balance",
          is_active: true,
          updated_at: new Date(),
        },
      ];

      vi.mocked(servicePricingRepository.listByService).mockResolvedValue(mockPricing as any);

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing?service_id=solana-rpc");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.service_id).toBe("solana-rpc");
      expect(data.pricing).toHaveLength(1);
    });
  });

  describe("PUT /api/v1/admin/service-pricing", () => {
    it("should return 401 when authentication fails", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError("Wallet connection required"));

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({
          service_id: "solana-rpc",
          method: "getBalance",
          cost: 0.000006,
          reason: "Test",
        }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(401);
      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
    });

    it("should return 403 when user is not admin", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError("Admin access required"));

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({
          service_id: "solana-rpc",
          method: "getBalance",
          cost: 0.000006,
          reason: "Test",
        }),
      });
      const response = await PUT(request);

      expect(response.status).toBe(403);
      expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
    });

    it("should upsert pricing and invalidate cache", async () => {
      vi.mocked(requireAdmin).mockResolvedValue({
        user: { id: "user-1", wallet_address: "wallet-1", organization_id: "org-1" } as any,
        role: "super_admin",
      });

      const mockPricing = {
        id: "pricing-1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.000006",
        description: "Get balance",
        is_active: true,
        updated_at: new Date(),
      };

      vi.mocked(servicePricingRepository.upsert).mockResolvedValue(mockPricing as any);
      vi.mocked(cache.del).mockResolvedValue(1);

      const request = new NextRequest("http://localhost:3000/api/v1/admin/service-pricing", {
        method: "PUT",
        body: JSON.stringify({
          service_id: "solana-rpc",
          method: "getBalance",
          cost: 0.000006,
          reason: "Update pricing",
        }),
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.method).toBe("getBalance");
      expect(vi.mocked(cache.del)).toHaveBeenCalled();
    });
  });
});
