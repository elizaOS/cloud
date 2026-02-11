
/**
 * Tests for Admin Service Pricing API
 * 
 * Covers:
 * - Authentication (admin vs non-admin)
 * - PUT upsert behavior
 * - Cache invalidation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "../route";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";

vi.mock("@/lib/auth");
vi.mock("@/db/repositories");
vi.mock("@/lib/services/proxy/pricing");

describe("GET /api/v1/admin/service-pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError("Not authenticated"));
    
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
    const response = await GET(request);
    
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Not authenticated");
  });

  it("returns 403 when not admin", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError("Admin required"));
    
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
    const response = await GET(request);
    
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Admin required");
  });

  it("lists all pricing when admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" } } as any);
    vi.mocked(servicePricingRepository.list).mockResolvedValue([
      { service_id: "test-service", method: "POST", cost: "0.001" } as any,
    ]);
    
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.pricing).toHaveLength(1);
    expect(data.pricing[0].service_id).toBe("test-service");
  });
});

describe("PUT /api/v1/admin/service-pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthenticationError("Not authenticated"));
    
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({ service_id: "test", method: "POST", cost: 0.001 }),
    });
    const response = await PUT(request);
    
    expect(response.status).toBe(401);
  });

  it("upserts pricing and invalidates cache", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" } } as any);
    vi.mocked(servicePricingRepository.upsert).mockResolvedValue({
      service_id: "test-service",
      method: "POST",
      cost: "0.001",
    } as any);
    vi.mocked(invalidateServicePricingCache).mockResolvedValue(undefined);
    
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({
        service_id: "test-service",
        method: "POST",
        cost: 0.001,
        reason: "Initial pricing",
      }),
    });
    const response = await PUT(request);
    
    expect(response.status).toBe(200);
    expect(invalidateServicePricingCache).toHaveBeenCalledWith("test-service");
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("handles cache invalidation failures gracefully", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" } } as any);
    vi.mocked(servicePricingRepository.upsert).mockResolvedValue({
      service_id: "test-service",
      method: "POST",
      cost: "0.001",
    } as any);
    vi.mocked(invalidateServicePricingCache).mockRejectedValue(new Error("Cache error"));
    
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({
        service_id: "test-service",
        method: "POST",
        cost: 0.001,
        reason: "Initial pricing",
      }),
    });
    const response = await PUT(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.cache_invalidated).toBe(false);
  });
});
