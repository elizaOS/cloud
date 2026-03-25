import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest, NextResponse } from "next/server";

const mockRequireAdminWithResponse = mock(async () => ({
  user: { id: "admin-1" },
  role: "admin",
}));

const mockListByService = mock(async () => [] as any[]);
const mockUpsert = mock(async () => ({
  id: "1",
  service_id: "solana-rpc",
  method: "getBalance",
  cost: "0.001",
  is_active: true,
  updated_at: new Date(),
}));
const mockInvalidateCache = mock(async () => undefined);

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
};

mock.module("@/lib/api/admin-auth", () => ({
  requireAdminWithResponse: mockRequireAdminWithResponse,
}));

mock.module("@/db/repositories", () => ({
  servicePricingRepository: {
    listByService: mockListByService,
    upsert: mockUpsert,
  },
}));

// Include all public exports so the mock doesn't break other modules that
// import PricingNotFoundError (e.g. proxy/engine loaded by proxy-engine tests).
class _MockPricingNotFoundError extends Error {
  constructor(
    public readonly serviceId: string,
    public readonly method: string,
  ) {
    super(`Pricing not found for service ${serviceId}, method ${method}`);
    this.name = "PricingNotFoundError";
  }
}

mock.module("@/lib/services/proxy/pricing", () => ({
  invalidateServicePricingCache: mockInvalidateCache,
  PricingNotFoundError: _MockPricingNotFoundError,
  getServiceMethodCost: mock(async () => 1.0),
}));

mock.module("@/lib/utils/logger", () => ({
  logger: mockLogger,
}));

async function importRoute() {
  return await import("@/app/api/v1/admin/service-pricing/route");
}

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init);
}

describe("Admin Service Pricing API", () => {
  beforeEach(() => {
    mockRequireAdminWithResponse.mockReset();
    mockListByService.mockReset();
    mockUpsert.mockReset();
    mockInvalidateCache.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
  });

  it("GET returns auth response when unauthorized", async () => {
    mockRequireAdminWithResponse.mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    );

    const { GET } = await importRoute();
    const request = createRequest(
      "GET",
      "http://localhost/api/v1/admin/service-pricing?service_id=solana-rpc",
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("GET returns pricing list for admin", async () => {
    mockRequireAdminWithResponse.mockResolvedValue({
      user: { id: "admin-1" },
      role: "admin",
    } as any);
    mockListByService.mockResolvedValue([
      {
        id: "1",
        service_id: "solana-rpc",
        method: "getBalance",
        cost: "0.001",
        description: "Standard",
        is_active: true,
        updated_at: new Date(),
      } as any,
    ]);

    const { GET } = await importRoute();
    const request = createRequest(
      "GET",
      "http://localhost/api/v1/admin/service-pricing?service_id=solana-rpc",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.service_id).toBe("solana-rpc");
    expect(data.pricing.length).toBe(1);
  });

  it("PUT upserts pricing and invalidates cache", async () => {
    mockRequireAdminWithResponse.mockResolvedValue({
      user: { id: "admin-1" },
      role: "admin",
    } as any);
    mockUpsert.mockResolvedValue({
      id: "1",
      service_id: "solana-rpc",
      method: "getBalance",
      cost: "0.002",
      is_active: true,
      updated_at: new Date(),
    } as any);
    mockInvalidateCache.mockResolvedValue(undefined);

    const { PUT } = await importRoute();
    const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
      service_id: "solana-rpc",
      method: "getBalance",
      cost: 0.002,
      reason: "Update pricing",
      description: "Updated",
      metadata: { tier: "1" },
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      "solana-rpc",
      "getBalance",
      0.002,
      "admin-1",
      "Update pricing",
      "Updated",
      { tier: "1" },
    );
    expect(mockInvalidateCache).toHaveBeenCalledWith("solana-rpc");
  });

  it("PUT fails when pre-update cache invalidation fails", async () => {
    mockRequireAdminWithResponse.mockResolvedValue({
      user: { id: "admin-1" },
      role: "admin",
    } as any);
    mockUpsert.mockResolvedValue({
      id: "1",
      service_id: "solana-rpc",
      method: "getBalance",
      cost: "0.002",
      is_active: true,
      updated_at: new Date(),
    } as any);
    mockInvalidateCache.mockImplementation(() => {
      throw new Error("Redis down");
    });

    const { PUT } = await importRoute();
    const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
      service_id: "solana-rpc",
      method: "getBalance",
      cost: 0.002,
      reason: "Update pricing",
    });
    const response = await PUT(request);

    expect(response.status).toBe(500);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("PUT succeeds when only post-update cache invalidation fails", async () => {
    mockRequireAdminWithResponse.mockResolvedValue({
      user: { id: "admin-1" },
      role: "admin",
    } as any);
    mockUpsert.mockResolvedValue({
      id: "1",
      service_id: "solana-rpc",
      method: "getBalance",
      cost: "0.002",
      is_active: true,
      updated_at: new Date(),
    } as any);
    mockInvalidateCache.mockResolvedValueOnce(undefined).mockImplementationOnce(() => {
      throw new Error("Redis down");
    });

    const { PUT } = await importRoute();
    const request = createRequest("PUT", "http://localhost/api/v1/admin/service-pricing", {
      service_id: "solana-rpc",
      method: "getBalance",
      cost: 0.002,
      reason: "Update pricing",
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.cache_invalidated).toBe(false);
  });
});
