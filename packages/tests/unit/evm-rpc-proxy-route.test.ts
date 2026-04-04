import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { creditsModuleRuntimeShim } from "@/tests/support/bun-partial-module-shims";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockDeductCredits = mock();
const mockGetProxyCost = mock();
const mockLoggerError = mock();
const mockLoggerInfo = mock();
const mockLoggerDebug = mock();
const mockLoggerWarn = mock();
const originalFetch = globalThis.fetch;

process.env.ALCHEMY_API_KEY = "test-alchemy-key";

const fetchMock = mock();
// Note: fetchMock mimics fetch behavior for isolation in unit tests without external calls.
globalThis.fetch = fetchMock as unknown as typeof fetch;

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/credits", () => ({
  ...creditsModuleRuntimeShim,
  creditsService: {
    deductCredits: mockDeductCredits,
  },
}));

mock.module("@/lib/services/proxy-billing", () => ({
  proxyBillingService: {
    getProxyCost: mockGetProxyCost,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: mockLoggerError,
    info: mockLoggerInfo,
    debug: mockLoggerDebug,
    warn: mockLoggerWarn,
  },
}));

import { POST } from "@/app/api/v1/proxy/evm-rpc/[chain]/route";

describe("EVM RPC proxy route", () => {
  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockDeductCredits.mockReset();
    mockGetProxyCost.mockReset();
    mockLoggerError.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerWarn.mockReset();
    fetchMock.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: { organization_id: "org-1" },
    });
    mockDeductCredits.mockResolvedValue({ success: true });
    mockGetProxyCost.mockReturnValue(0.1);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("rejects malformed JSON before billing", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/v1/proxy/evm-rpc/base", {
        method: "POST",
        body: "{",
      }),
      { params: Promise.resolve({ chain: "base" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON-RPC body" });
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects oversized batches before billing", async () => {
    const batch = Array.from({ length: 101 }, (_, index) => ({
      jsonrpc: "2.0",
      id: index,
      method: "eth_blockNumber",
    }));

    const response = await POST(
      new NextRequest("https://example.com/api/v1/proxy/evm-rpc/base", {
        method: "POST",
        body: JSON.stringify(batch),
      }),
      { params: Promise.resolve({ chain: "base" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "JSON-RPC batch limit exceeded (max 100)",
    });
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("bills batch requests by item count", async () => {
    const batch = [
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
      { jsonrpc: "2.0", id: 2, method: "eth_chainId" },
    ];

    const response = await POST(
      new NextRequest("https://example.com/api/v1/proxy/evm-rpc/base", {
        method: "POST",
        body: JSON.stringify(batch),
      }),
      { params: Promise.resolve({ chain: "base" }) },
    );

    expect(response.status).toBe(200);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        amount: 0.2,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("accepts query-param api_key auth for BSC RPC clients", async () => {
    mockRequireAuthOrApiKeyWithOrg.mockImplementationOnce(async (request: NextRequest) => {
      expect(request.headers.get("authorization")).toBe("Bearer cloud-query-key");
      return { user: { organization_id: "org-1" } };
    });

    const response = await POST(
      new NextRequest("https://example.com/api/v1/proxy/evm-rpc/bsc?api_key=cloud-query-key", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      }),
      { params: Promise.resolve({ chain: "bsc" }) },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bnb-mainnet.g.alchemy.com/v2/test-alchemy-key",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
