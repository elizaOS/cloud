import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

class MockInsufficientCreditsError extends Error {
  required: number;
  constructor(required: number) {
    super("Insufficient credits");
    this.required = required;
  }
}

const mockFindByUserId = mock();
const mockFindById = mock();
const mockFindByCode = mock();
const mockCreateCode = mock();
const mockFindByReferredUserId = mock();
const mockCreateSignup = mock();
const mockMarkQualified = mock();
const mockAddQualifiedEarnings = mock();
const mockAddCredits = mock();
const mockFindUserById = mock();

mock.module("@/db/repositories/referrals", () => ({
  referralCodesRepository: {
    findByUserId: mockFindByUserId,
    findById: mockFindById,
    findByCode: mockFindByCode,
    create: mockCreateCode,
    addQualifiedEarnings: mockAddQualifiedEarnings,
  },
  referralSignupsRepository: {
    findByReferredUserId: mockFindByReferredUserId,
    create: mockCreateSignup,
    markQualified: mockMarkQualified,
    findUnqualifiedByReferredUserId: mockFindByReferredUserId,
  },
  socialShareRewardsRepository: {},
}));

mock.module("@/db/repositories/users", () => ({
  usersRepository: {
    findById: mockFindUserById,
  },
  UsersRepository: class MockUsersRepository {
    findById = mockFindUserById;
    static resetWhatsAppColumnSupportCacheForTests() {}
  },
}));

mock.module("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: mockAddCredits,
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/services/app-credits", () => ({
  appCreditsService: {
    addCredits: mock(),
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

import { referralsService } from "@/lib/services/referrals";

describe("referralsService", () => {
  beforeEach(() => {
    mockFindByUserId.mockReset();
    mockFindById.mockReset();
    mockFindByCode.mockReset();
    mockCreateCode.mockReset();
    mockFindByReferredUserId.mockReset();
    mockCreateSignup.mockReset();
    mockMarkQualified.mockReset();
    mockAddQualifiedEarnings.mockReset();
    mockAddCredits.mockReset();
    mockFindUserById.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  test("returns distinct creator and editor roles for multi-tier referrals", async () => {
    mockFindByReferredUserId.mockResolvedValue({
      referral_code_id: "child-code",
      app_owner_id: "app-owner",
      creator_id: "creator-user",
      referrer_user_id: "fallback-referrer",
    });

    mockFindById.mockImplementation(async (id: string) => {
      if (id === "child-code") {
        return { id, parent_referral_id: "parent-code" };
      }

      if (id === "parent-code") {
        return { id, user_id: "editor-user" };
      }

      return null;
    });

    const result = await referralsService.calculateRevenueSplits("buyer", 100);

    expect(result.elizaCloudAmount).toBe(50);
    expect(result.splits).toEqual([
      { userId: "app-owner", role: "app_owner", amount: 40 },
      { userId: "creator-user", role: "creator", amount: 8 },
      { userId: "editor-user", role: "editor", amount: 2 },
    ]);
  });

  test("returns an existing code when concurrent creation hits a unique constraint", async () => {
    mockFindByUserId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "existing-code",
      user_id: "user-1",
      code: "ABCD-1234",
    });
    mockFindByCode.mockResolvedValue(null);
    mockCreateCode.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    const result = await referralsService.getOrCreateCode("user-1");

    expect(result).toEqual({
      id: "existing-code",
      user_id: "user-1",
      code: "ABCD-1234",
    });
    expect(mockCreateCode).toHaveBeenCalledTimes(1);
  });

  test("retries referral code creation when a generated code collides with another user", async () => {
    mockFindByUserId.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockFindByCode.mockResolvedValue(null);
    mockCreateCode
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        }),
      )
      .mockResolvedValueOnce({
        id: "new-code",
        user_id: "user-1",
        code: "UNIQ-123",
      });

    const result = await referralsService.getOrCreateCode("user-1");

    expect(result).toEqual({
      id: "new-code",
      user_id: "user-1",
      code: "UNIQ-123",
    });
    expect(mockCreateCode).toHaveBeenCalledTimes(2);
  });

  test("treats replaying the same referral code as an idempotent success", async () => {
    mockFindByReferredUserId.mockResolvedValue({
      referral_code_id: "ref-code-id",
    });
    mockFindByCode.mockResolvedValue({
      id: "ref-code-id",
      code: "ABCD-1234",
    });

    const result = await referralsService.applyReferralCode(
      "buyer-user",
      "buyer-org",
      " abcd-1234 ",
    );

    expect(result).toEqual({
      success: true,
      message: "Referral code already applied",
    });
    expect(mockCreateSignup).not.toHaveBeenCalled();
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  test("qualifies a referral only once before crediting the bonus", async () => {
    mockFindByReferredUserId.mockResolvedValue({
      id: "signup-1",
      referral_code_id: "ref-code-id",
      referrer_user_id: "referrer-user",
    });
    mockFindUserById.mockResolvedValue({
      id: "referrer-user",
      organization_id: "referrer-org",
    });
    mockMarkQualified
      .mockResolvedValueOnce({
        id: "signup-1",
      })
      .mockResolvedValueOnce(null);
    mockAddCredits.mockResolvedValue({ success: true });
    mockAddQualifiedEarnings.mockResolvedValue(undefined);

    const first = await referralsService.checkAndQualifyReferral("buyer-user");
    const second = await referralsService.checkAndQualifyReferral("buyer-user");

    expect(first).toEqual({ qualified: true, bonusAwarded: 0.5 });
    expect(second).toEqual({ qualified: false });
    expect(mockAddCredits).toHaveBeenCalledTimes(1);
    expect(mockAddQualifiedEarnings).toHaveBeenCalledTimes(1);
  });
});
