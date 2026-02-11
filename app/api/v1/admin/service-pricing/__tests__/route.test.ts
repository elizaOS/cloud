
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
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true });
    mockListByService.mockResolvedValue([
      { id: "1", service_id: "test", method: "default", cost: "0.01", updated_at: new Date() }
    ]);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing?service_id=test");
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.service_id).toBe("test");
    expect(data.pricing).toHaveLength(1);
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
      body: JSON.stringify({ service_id: "test", method: "default", cost: 0.01, reason: "test" })
    });
    const response = await PUT(request);
    expect(response.status).toBe(401);
  });

  it("should return 403 when not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError("Not admin"));
    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({ service_id: "test", method: "default", cost: 0.01, reason: "test" })
    });
    const response = await PUT(request);
    expect(response.status).toBe(403);
  });

  it("should upsert pricing and invalidate cache", async () => {
    const mockUser = { id: "user-1", organization_id: "org-1" };
    mockRequireAdmin.mockResolvedValue({ user: mockUser, role: "admin", isAdmin: true });
    mockUpsert.mockResolvedValue({
      id: "1",
      service_id: "test",
      method: "default",
      cost: "0.01",
      updated_at: new Date()
    });
    mockInvalidateCache.mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost/api/v1/admin/service-pricing", {
      method: "PUT",
      body: JSON.stringify({ service_id: "test", method: "default", cost: 0.01, reason: "test" })
    });
    
    const response = await PUT(request);
    
    expect(response.status).toBe(200);
    expect(mockInvalidateCache).toHaveBeenCalledWith("test", "default");
  });
});
