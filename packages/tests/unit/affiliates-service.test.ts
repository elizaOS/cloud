import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetAffiliateCodeByCode = mock();
const mockGetAffiliateCodeById = mock();
const mockGetUserAffiliate = mock();
const mockLinkUserToAffiliate = mock();
const mockGetAffiliateCodeByUserId = mock();
const mockCreateAffiliateCodeIfNotExists = mock();
const mockUpdateAffiliateCode = mock();
const { AffiliatesRepository } = await import("@/db/repositories/affiliates");

mock.module("@/db/repositories/affiliates", () => ({
  AffiliatesRepository,
  affiliatesRepository: {
    getAffiliateCodeByCode: mockGetAffiliateCodeByCode,
    getAffiliateCodeById: mockGetAffiliateCodeById,
    getUserAffiliate: mockGetUserAffiliate,
    linkUserToAffiliate: mockLinkUserToAffiliate,
    getAffiliateCodeByUserId: mockGetAffiliateCodeByUserId,
    createAffiliateCodeIfNotExists: mockCreateAffiliateCodeIfNotExists,
    updateAffiliateCode: mockUpdateAffiliateCode,
  },
}));

mock.module("@/lib/cache/client", () => ({
  cache: {
    get: mock(async () => null),
    set: mock(async () => {}),
    del: mock(async () => {}),
    delPattern: mock(async () => {}),
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

async function importAffiliatesService() {
  return import(
    new URL(`../../lib/services/affiliates.ts?test=${Date.now()}`, import.meta.url).href
  );
}

describe("affiliatesService", () => {
  beforeEach(() => {
    mockGetAffiliateCodeByCode.mockReset();
    mockGetAffiliateCodeById.mockReset();
    mockGetUserAffiliate.mockReset();
    mockLinkUserToAffiliate.mockReset();
    mockGetAffiliateCodeByUserId.mockReset();
    mockCreateAffiliateCodeIfNotExists.mockReset();
    mockUpdateAffiliateCode.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  test("retries affiliate code creation when the generated code collides", async () => {
    const { affiliatesService } = await importAffiliatesService();

    mockGetAffiliateCodeByUserId.mockResolvedValueOnce(null);
    mockCreateAffiliateCodeIfNotExists
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        }),
      )
      .mockResolvedValueOnce({
        id: "affiliate-code-id",
        user_id: "owner-user",
        code: "AFF-UNIQUE1",
        markup_percent: "20.00",
      });
    mockGetAffiliateCodeByUserId.mockResolvedValueOnce(null);

    const result = await affiliatesService.getOrCreateAffiliateCode("owner-user");

    expect(result).toEqual({
      id: "affiliate-code-id",
      user_id: "owner-user",
      code: "AFF-UNIQUE1",
      markup_percent: "20.00",
    });
    expect(mockCreateAffiliateCodeIfNotExists).toHaveBeenCalledTimes(2);
  });

  test("reuses an existing identical link and normalizes affiliate codes", async () => {
    const { affiliatesService } = await importAffiliatesService();

    mockGetAffiliateCodeByCode.mockResolvedValue({
      id: "affiliate-code-id",
      user_id: "owner-user",
      is_active: true,
    });
    mockGetUserAffiliate.mockResolvedValue({
      id: "existing-link",
      user_id: "buyer-user",
      affiliate_code_id: "affiliate-code-id",
    });

    const result = await affiliatesService.linkUserToAffiliateCode("buyer-user", " aff-test01 ");

    expect(mockGetAffiliateCodeByCode).toHaveBeenCalledWith("AFF-TEST01");
    expect(mockLinkUserToAffiliate).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "existing-link",
      user_id: "buyer-user",
      affiliate_code_id: "affiliate-code-id",
    });
  });

  test("rejects inactive affiliate codes", async () => {
    const { ERRORS, affiliatesService } = await importAffiliatesService();

    mockGetAffiliateCodeByCode.mockResolvedValue({
      id: "affiliate-code-id",
      user_id: "owner-user",
      is_active: false,
    });

    await expect(
      affiliatesService.linkUserToAffiliateCode("buyer-user", "aff-dead01"),
    ).rejects.toThrow(ERRORS.INVALID_CODE);
  });

  test("ignores inactive referrers when resolving affiliate relationships", async () => {
    const { affiliatesService } = await importAffiliatesService();

    mockGetUserAffiliate.mockResolvedValue({
      id: "existing-link",
      user_id: "buyer-user",
      affiliate_code_id: "affiliate-code-id",
    });
    mockGetAffiliateCodeById.mockResolvedValue({
      id: "affiliate-code-id",
      user_id: "owner-user",
      is_active: false,
    });

    const result = await affiliatesService.getReferrer("buyer-user");

    expect(result).toBeNull();
  });
});
