import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("price preview route", () => {
  beforeEach(() => {
    mock.restore();
    restoreEnv();
    process.env.REDIS_RATE_LIMITING = "false";
  });

  afterEach(() => {
    mock.restore();
    restoreEnv();
  });

  test("proxies public price preview requests through the shared market-data helper", async () => {
    const executeMarketDataProviderRequest = mock(async () =>
      Response.json({
        success: true,
        data: { value: 0.33, updateUnixTime: 1713890000 },
      }),
    );

    mock.module("@/lib/services/proxy/services/market-data", () => ({
      executeMarketDataProviderRequest,
    }));

    const { GET } = await import(
      new URL(
        `../../../app/api/v1/market/preview/price/[chain]/[address]/route.ts?test=${Date.now()}`,
        import.meta.url,
      ).href
    );

    const response = await GET(
      new NextRequest(
        "https://elizacloud.ai/api/v1/market/preview/price/base/0xD17De9A07b52F856010B372117DF2dFD1910C589",
        {
          headers: { "x-forwarded-for": "203.0.113.12" },
        },
      ),
      {
        params: Promise.resolve({
          chain: "base",
          address: "0xD17De9A07b52F856010B372117DF2dFD1910C589",
        }),
      },
    );

    expect(executeMarketDataProviderRequest).toHaveBeenCalledTimes(1);
    expect(executeMarketDataProviderRequest).toHaveBeenCalledWith({
      method: "getPrice",
      chain: "base",
      params: {
        address: "0xD17De9A07b52F856010B372117DF2dFD1910C589",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=15, stale-while-revalidate=45",
    );
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { value: 0.33, updateUnixTime: 1713890000 },
    });
  });
});
