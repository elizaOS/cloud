import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";

const originalX402RecipientAddress = process.env.X402_RECIPIENT_ADDRESS;
const mockUpdateCreditBalance = mock();
const mockApplyReferralCode = mock();
const mockCalculateRevenueSplits = mock();

type ReferralsServicePatch = {
  applyReferralCode: typeof mockApplyReferralCode;
  calculateRevenueSplits: typeof mockCalculateRevenueSplits;
};
type OrganizationsServicePatch = {
  updateCreditBalance: typeof mockUpdateCreditBalance;
};
type RedeemableEarningsServicePatch = {
  addEarnings: typeof mockAddEarnings;
};

let referralsServiceForTest: ReferralsServicePatch | null = null;
let originalApplyReferralCode: ReferralsServicePatch["applyReferralCode"] | null = null;
let originalCalculateRevenueSplits: ReferralsServicePatch["calculateRevenueSplits"] | null = null;
let organizationsServiceForTest: OrganizationsServicePatch | null = null;
let originalUpdateCreditBalance: OrganizationsServicePatch["updateCreditBalance"] | null = null;

const mockAddEarnings = mock().mockResolvedValue(true);
let redeemableEarningsServiceForTest: RedeemableEarningsServicePatch | null = null;
let originalAddEarnings: RedeemableEarningsServicePatch["addEarnings"] | null = null;

// Register mock.module BEFORE any dynamic imports so the mock is in place
// when topup-handler statically imports wallet-signup
const mockUserResult = {
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    organization_id: "11111111-1111-4111-8111-111111111111",
    wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
  },
  created: false,
};

mock.module("@/lib/services/wallet-signup", () => ({
  findOrCreateUserByWalletAddress: (_walletAddress: string) => Promise.resolve(mockUserResult),
}));

mock.module("x402-next", () => ({
  withX402: <T extends (req: NextRequest) => Promise<Response>>(handler: T): T => handler,
}));

describe("x402 Topup Endpoints", () => {
  const mockWallet = "0x1234567890abcdef1234567890abcdef12345678";
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockUserId = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    const actualReferralsModule = await import("@/lib/services/referrals");
    const actualOrganizationsModule = await import("@/lib/services/organizations");
    const actualRedeemableEarningsModule = await import("@/lib/services/redeemable-earnings");
    const referrals: ReferralsServicePatch = actualReferralsModule.referralsService as ReferralsServicePatch;
    referralsServiceForTest = referrals;
    originalApplyReferralCode = referrals.applyReferralCode;
    originalCalculateRevenueSplits = referrals.calculateRevenueSplits;
    referrals.applyReferralCode = mockApplyReferralCode;
    referrals.calculateRevenueSplits = mockCalculateRevenueSplits;

    const orgs: OrganizationsServicePatch = actualOrganizationsModule.organizationsService as OrganizationsServicePatch;
    organizationsServiceForTest = orgs;
    originalUpdateCreditBalance = orgs.updateCreditBalance;
    orgs.updateCreditBalance = mockUpdateCreditBalance;

    const redeem: RedeemableEarningsServicePatch = actualRedeemableEarningsModule.redeemableEarningsService as RedeemableEarningsServicePatch;
    redeemableEarningsServiceForTest = redeem;
    originalAddEarnings = redeem.addEarnings;
    redeem.addEarnings = mockAddEarnings;
  });

  beforeEach(() => {
    process.env.X402_RECIPIENT_ADDRESS = mockWallet;
    mockUpdateCreditBalance.mockResolvedValue({ success: true, newBalance: 10 });
    mockApplyReferralCode.mockReset();
    mockApplyReferralCode.mockResolvedValue({
      success: true,
      message: "Referral code already applied",
    });
    mockCalculateRevenueSplits.mockReset();
    mockCalculateRevenueSplits.mockResolvedValue({ splits: [] });
    mockAddEarnings.mockClear();
    // Update the mutable mock result in case a test needs different values
    mockUserResult.user.id = mockUserId;
    mockUserResult.user.organization_id = mockOrgId;
    mockUserResult.user.wallet_address = mockWallet;
  });

  afterEach(() => {
    mockUpdateCreditBalance.mockClear();
  });

  afterAll(() => {
    // Restore referrals service methods if they were patched
    if (referralsServiceForTest !== null) {
      if (originalApplyReferralCode !== null) {
        referralsServiceForTest.applyReferralCode = originalApplyReferralCode;
      }
      if (originalCalculateRevenueSplits !== null) {
        referralsServiceForTest.calculateRevenueSplits = originalCalculateRevenueSplits;
      }
    }
    // Restore organizations service methods if they were patched
    if (organizationsServiceForTest !== null && originalUpdateCreditBalance !== null) {
      organizationsServiceForTest.updateCreditBalance = originalUpdateCreditBalance;
    }
    // Restore redeemable earnings service methods if they were patched
    if (redeemableEarningsServiceForTest !== null && originalAddEarnings !== null) {
      redeemableEarningsServiceForTest.addEarnings = originalAddEarnings;
    }
    if (originalX402RecipientAddress === undefined) {
      delete process.env.X402_RECIPIENT_ADDRESS;
    } else {
      process.env.X402_RECIPIENT_ADDRESS = originalX402RecipientAddress;
    }
    mock.restore();
  });

  it("should topup 10 credits successfully for a new user", async () => {
    const { POST: POST10 } = await import("@/app/api/v1/topup/10/route");
    const req = new NextRequest("http://localhost:3000/api/v1/topup/10", {
      method: "POST",
      body: JSON.stringify({ walletAddress: mockWallet }),
    });

    const response = await POST10(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.amount).toBe(10);

    expect(mockUpdateCreditBalance).toHaveBeenCalledWith(mockOrgId, 10);
  });

  it("should topup 50 credits successfully for an existing user", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/topup/50", {
      method: "POST",
      body: JSON.stringify({ walletAddress: mockWallet }),
    });

    const { POST: POST50 } = await import("@/app/api/v1/topup/50/route");
    const response = await POST50(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.amount).toBe(50);

    expect(mockUpdateCreditBalance).toHaveBeenCalledWith(mockOrgId, 50);
  });

  it("should apply referral attribution and credit revenue splits from query params", async () => {
    mockCalculateRevenueSplits.mockResolvedValue({
      splits: [{ userId: "creator-user", role: "creator", amount: 5 }],
    });

    const { POST: POST10 } = await import("@/app/api/v1/topup/10/route");
    const req = new NextRequest(
      "http://localhost:3000/api/v1/topup/10?ref=ABCD-1234&appOwnerId=owner-1",
      {
        method: "POST",
        body: JSON.stringify({ walletAddress: mockWallet }),
      },
    );

    const response = await POST10(req);

    expect(response.status).toBe(200);
    expect(mockApplyReferralCode).toHaveBeenCalledWith(mockUserId, mockOrgId, "ABCD-1234", {
      appOwnerId: "owner-1",
    });
    expect(mockCalculateRevenueSplits).toHaveBeenCalledWith(mockUserId, 10);
    expect(mockAddEarnings).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "creator-user",
        amount: 5,
        source: "creator_revenue_share",
        dedupeBySourceId: true,
      }),
    );
  });

  it("should fail if no wallet address is provided", async () => {
    const { POST: POST100 } = await import("@/app/api/v1/topup/100/route");
    const req = new NextRequest("http://localhost:3000/api/v1/topup/100", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST100(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("walletAddress is required (body or wallet signature headers)");
  });
});
