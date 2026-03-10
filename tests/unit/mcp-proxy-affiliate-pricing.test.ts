import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAffiliateCodeById = mock();
const mockGetUserAffiliate = mock();
const mockGetMcpById = mock();
const mockRecordUsageWithoutDeduction = mock();
const mockReserveAndDeductCredits = mock();
const mockRefundCredits = mock();
const mockLoggerError = mock();
const mockLoggerWarn = mock();
const mockLoggerInfo = mock();
const mockLoggerDebug = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/db/repositories/affiliates", () => ({
  affiliatesRepository: {
    getAffiliateCodeById: mockGetAffiliateCodeById,
    getUserAffiliate: mockGetUserAffiliate,
  },
}));

mock.module("@/lib/services/user-mcps", () => ({
  userMcpsService: {
    getById: mockGetMcpById,
    recordUsageWithoutDeduction: mockRecordUsageWithoutDeduction,
  },
}));

mock.module("@/lib/services/credits", () => ({
  creditsService: {
    reserveAndDeductCredits: mockReserveAndDeductCredits,
    refundCredits: mockRefundCredits,
  },
}));

mock.module("@/lib/services/containers", () => ({
  containersService: {
    getById: mock(),
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    debug: mockLoggerDebug,
  },
}));

import { POST } from "@/app/api/mcp/proxy/[mcpId]/route";

describe("MCP proxy affiliate pricing", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAffiliateCodeById.mockReset();
    mockGetUserAffiliate.mockReset();
    mockGetMcpById.mockReset();
    mockRecordUsageWithoutDeduction.mockReset();
    mockReserveAndDeductCredits.mockReset();
    mockRefundCredits.mockReset();
    mockLoggerError.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerDebug.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "buyer-user",
        organization_id: "buyer-org",
      },
      apiKey: { id: "api-key-1" },
    });
    mockGetUserAffiliate.mockResolvedValue({
      affiliate_code_id: "affiliate-code",
    });
    mockGetAffiliateCodeById.mockResolvedValue({
      id: "affiliate-code",
      user_id: "affiliate-owner",
      markup_percent: "20.00",
      is_active: true,
    });
    mockGetMcpById.mockResolvedValue({
      id: "mcp-1",
      name: "Search MCP",
      status: "live",
      credits_per_request: "100",
      endpoint_type: "external",
      external_endpoint: "https://93.184.216.34/mcp",
      organization_id: "creator-org",
      creator_share_percentage: "80.00",
      platform_share_percentage: "20.00",
    });
    mockReserveAndDeductCredits.mockResolvedValue({
      success: true,
      newBalance: 8.6,
      transaction: { id: "txn-1" },
    });
    mockRecordUsageWithoutDeduction.mockResolvedValue({
      success: true,
      usageId: "usage-1",
    });

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("charges affiliate and platform fees on top of the base MCP price", async () => {
    const request = new NextRequest("https://example.com/api/mcp/proxy/mcp-1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "search",
        },
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ mcpId: "mcp-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockReserveAndDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "buyer-org",
        amount: 1.4,
        metadata: expect.objectContaining({
          base_credits: "100.0000",
          affiliate_fee: "20.0000",
          platform_fee: "20.0000",
          total_credits_charged: "140.0000",
          affiliate_owner_id: "affiliate-owner",
          affiliate_code_id: "affiliate-code",
        }),
      }),
    );
    expect(mockRecordUsageWithoutDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsCharged: 100,
        affiliateFeeCredits: 20,
        platformFeeCredits: 20,
        affiliateOwnerId: "affiliate-owner",
        affiliateCodeId: "affiliate-code",
        metadata: expect.objectContaining({
          totalCreditsCharged: 140,
          preChargeTransactionId: "txn-1",
        }),
      }),
    );
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  test("refunds the full charged amount when the MCP call fails", async () => {
    globalThis.fetch = mock(async () =>
      new Response("upstream failure", {
        status: 502,
      }),
    ) as typeof globalThis.fetch;

    const request = new NextRequest("https://example.com/api/mcp/proxy/mcp-1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "search",
        },
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ mcpId: "mcp-1" }),
    });

    expect(response.status).toBe(502);
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "buyer-org",
        amount: 1.4,
      }),
    );
    expect(mockRecordUsageWithoutDeduction).not.toHaveBeenCalled();
  });
});
