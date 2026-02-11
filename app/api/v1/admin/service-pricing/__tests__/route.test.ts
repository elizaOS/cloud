
import { NextRequest } from "next/server";
import { GET, PUT } from "../route";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";

jest.mock("@/lib/auth");
jest.mock("@/db/repositories");
jest.mock("@/lib/services/proxy/pricing");
jest.mock("@/lib/utils/logger");

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockListByService = servicePricingRepository.listByService as jest.MockedFunction<typeof servicePricingRepository.listByService>;
const mockUpsert = servicePricingRepository.upsert as jest.MockedFunction<typeof servicePricingRepository.upsert>;
const mockInvalidateCache = invalidateServicePricingCache as jest.MockedFunction<typeof invalidateServicePricingCache>;

describe("GET /api/v1/admin/service-pricing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing?service_id=test");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("should return 403 when not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError("Not admin"));
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing?service_id=test");
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("should return pricing list for valid service_id", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true } as any);
    mockListByService.mockResolvedValue([
      { id: "1", service_id: "test", method: "default", cost: "0.01", updated_at: new Date() } as any
    ]);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing?service_id=test");
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.service_id).toBe("test");
    expect(data.pricing).toHaveLength(1);
  });

  it("should return 400 when service_id is missing", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true } as any);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing");
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});

describe("PUT /api/v1/admin/service-pricing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new AuthenticationError("Not authenticated"));
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({ service_id: "test", method: "default", cost: 0.01, reason: "test" }),
      headers: { "content-type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(401);
  });

  it("should return 403 when not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError("Not admin"));
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({ service_id: "test", method: "default", cost: 0.01, reason: "test" }),
      headers: { "content-type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(403);
  });

  it("should upsert pricing and invalidate cache", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true } as any);
    mockUpsert.mockResolvedValue({
      id: "1", service_id: "svc-1", method: "default", cost: "0.01",
      is_active: true, updated_at: new Date(),
    } as any);
    mockInvalidateCache.mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({
        service_id: "svc-1",
        method: "default",
        cost: 0.01,
        reason: "Initial pricing",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockInvalidateCache).toHaveBeenCalledWith("svc-1", "default");
  });

  it("should return 400 for invalid JSON", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true } as any);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("should return 400 for invalid request body", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true } as any);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({ service_id: "test" }), // missing required fields
      headers: { "content-type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("should succeed even if cache invalidation fails", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true } as any);
    mockUpsert.mockResolvedValue({
      id: "1", service_id: "svc-1", method: "default", cost: "0.01",
      is_active: true, updated_at: new Date(),
    } as any);
    mockInvalidateCache.mockRejectedValue(new Error("Cache error"));

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({
        service_id: "svc-1",
        method: "default",
        cost: 0.01,
        reason: "test",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.cache_invalidated).toBe(false);
  });
});
