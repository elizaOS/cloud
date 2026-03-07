import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCacheGet = mock();
const mockCacheSet = mock();
const mockCacheDel = mock();
const mockListByService = mock();
const mockLoggerError = mock();
const mockLoggerWarn = mock();
const mockLoggerInfo = mock();

mock.module("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    del: mockCacheDel,
  },
}));

mock.module("@/db/repositories", () => ({
  servicePricingRepository: {
    listByService: mockListByService,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
}));

mock.module("@/lib/services/proxy/config", () => ({
  PROXY_CONFIG: {
    PRICING_CACHE_TTL: 60,
  },
}));

import {
  getServiceMethodCost,
  invalidateServicePricingCache,
} from "@/lib/services/proxy/pricing";

describe("proxy pricing cache", () => {
  beforeEach(() => {
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheDel.mockReset();
    mockListByService.mockReset();
    mockLoggerError.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerInfo.mockReset();

    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
  });

  test("returns cached pricing without hitting the repository", async () => {
    mockCacheGet.mockResolvedValue({ getPrice: "0.123456" });

    const cost = await getServiceMethodCost("market-data", "getPrice");

    expect(cost).toBeCloseTo(0.123456, 6);
    expect(mockListByService).not.toHaveBeenCalled();
  });

  test("deduplicates concurrent cache misses per service", async () => {
    let resolvePricing:
      | ((value: Array<{ method: string; cost: string }>) => void)
      | undefined;

    const pricingPromise = new Promise<Array<{ method: string; cost: string }>>(
      (resolve) => {
        resolvePricing = resolve;
      },
    );

    mockListByService.mockReturnValue(pricingPromise);

    const first = getServiceMethodCost("market-data", "getPrice");
    const second = getServiceMethodCost("market-data", "getPrice");

    resolvePricing?.([
      { method: "getPrice", cost: "0.123456" },
      { method: "_default", cost: "0.654321" },
    ]);

    await expect(first).resolves.toBeCloseTo(0.123456, 6);
    await expect(second).resolves.toBeCloseTo(0.123456, 6);
    expect(mockListByService).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledTimes(1);

    const [cacheKey, pricingMap, ttl] = mockCacheSet.mock.calls[0];
    expect(cacheKey).toBe("service-pricing:market-data");
    expect(pricingMap).toEqual({
      getPrice: "0.123456",
      _default: "0.654321",
    });
    expect(ttl).toBeGreaterThan(0);
  });

  test("invalidates the cached pricing entry", async () => {
    await invalidateServicePricingCache("market-data");

    expect(mockCacheDel).toHaveBeenCalledWith("service-pricing:market-data");
  });
});
