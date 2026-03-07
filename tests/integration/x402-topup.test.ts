import { describe, expect, it, mock, beforeAll, beforeEach, afterEach, afterAll } from "bun:test";
import { NextRequest } from "next/server";

const mockGetTopupRecipient = mock();
const originalX402RecipientAddress = process.env.X402_RECIPIENT_ADDRESS;
const mockOrganizationsService = {
    create: mock(),
    updateCreditBalance: mock(),
};
const mockApplyReferralCode = mock();
const mockCalculateRevenueSplits = mock();
let referralsServiceForTest: {
    applyReferralCode: typeof mockApplyReferralCode;
    calculateRevenueSplits: typeof mockCalculateRevenueSplits;
} | null = null;
let originalApplyReferralCode: unknown;
let originalCalculateRevenueSplits: unknown;

const mockRedeemableEarningsService = {
    addEarnings: mock().mockResolvedValue(true),
};

describe("x402 Topup Endpoints", () => {
    const mockWallet = "0x1234567890abcdef1234567890abcdef12345678";
    const mockOrgId = "11111111-1111-4111-8111-111111111111";
    const mockUserId = "22222222-2222-4222-8222-222222222222";

    beforeAll(async () => {
        const actualReferralsModule = await import("@/lib/services/referrals");
        referralsServiceForTest = actualReferralsModule.referralsService as typeof referralsServiceForTest;
        originalApplyReferralCode = referralsServiceForTest.applyReferralCode;
        originalCalculateRevenueSplits = referralsServiceForTest.calculateRevenueSplits;
        referralsServiceForTest.applyReferralCode = mockApplyReferralCode;
        referralsServiceForTest.calculateRevenueSplits = mockCalculateRevenueSplits;

        mock.module("x402-next", () => ({
            withX402: (handler: any) => handler,
        }));

        mock.module("@/lib/services/topup", () => ({
            getTopupRecipient: mockGetTopupRecipient,
        }));

        mock.module("@/lib/services/organizations", () => ({
            organizationsService: mockOrganizationsService,
        }));

        mock.module("@/lib/services/redeemable-earnings", () => ({
            redeemableEarningsService: mockRedeemableEarningsService,
        }));
    });

    beforeEach(() => {
        process.env.X402_RECIPIENT_ADDRESS = mockWallet;
        mockOrganizationsService.updateCreditBalance.mockResolvedValue({ success: true, newBalance: 10 });
        mockApplyReferralCode.mockReset();
        mockApplyReferralCode.mockResolvedValue({ success: true, message: "Referral code already applied" });
        mockCalculateRevenueSplits.mockReset();
        mockCalculateRevenueSplits.mockResolvedValue({ splits: [] });
        mockRedeemableEarningsService.addEarnings.mockClear();
        mockGetTopupRecipient.mockImplementation((_req: NextRequest, body: { walletAddress?: string }) => {
            if (!body?.walletAddress?.trim()) {
                return Promise.reject(new Error("walletAddress is required (body or wallet signature headers)"));
            }
            return Promise.resolve({
                user: {
                    id: mockUserId,
                    organization_id: mockOrgId,
                    wallet_address: body.walletAddress ?? mockWallet,
                } as any,
                organizationId: mockOrgId,
                walletAddress: body.walletAddress ?? mockWallet,
            });
        });
    });

    afterEach(() => {
        mockOrganizationsService.updateCreditBalance.mockClear();
    });

    afterAll(() => {
        if (referralsServiceForTest) {
            referralsServiceForTest.applyReferralCode = originalApplyReferralCode as typeof mockApplyReferralCode;
            referralsServiceForTest.calculateRevenueSplits =
                originalCalculateRevenueSplits as typeof mockCalculateRevenueSplits;
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

        const response = await POST10(req as any);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.amount).toBe(10);

        expect(mockOrganizationsService.updateCreditBalance).toHaveBeenCalledWith(mockOrgId, 10);
    });

    it("should topup 50 credits successfully for an existing user", async () => {
        const req = new NextRequest("http://localhost:3000/api/v1/topup/50", {
            method: "POST",
            body: JSON.stringify({ walletAddress: mockWallet }),
        });

        const { POST: POST50 } = await import("@/app/api/v1/topup/50/route");
        const response = await POST50(req as any);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.amount).toBe(50);

        expect(mockOrganizationsService.updateCreditBalance).toHaveBeenCalledWith(mockOrgId, 50);
    });

    it("should apply referral attribution and credit revenue splits from query params", async () => {
        mockCalculateRevenueSplits.mockResolvedValue({
            splits: [
                { userId: "creator-user", role: "creator", amount: 5 },
            ],
        });

        const { POST: POST10 } = await import("@/app/api/v1/topup/10/route");
        const req = new NextRequest(
            "http://localhost:3000/api/v1/topup/10?ref=ABCD-1234&appOwnerId=owner-1",
            {
                method: "POST",
                body: JSON.stringify({ walletAddress: mockWallet }),
            },
        );

        const response = await POST10(req as any);

        expect(response.status).toBe(200);
        expect(mockApplyReferralCode).toHaveBeenCalledWith(
            mockUserId,
            mockOrgId,
            "ABCD-1234",
            { appOwnerId: "owner-1" },
        );
        expect(mockCalculateRevenueSplits).toHaveBeenCalledWith(mockUserId, 10);
        expect(mockRedeemableEarningsService.addEarnings).toHaveBeenCalledWith(
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

        const response = await POST100(req as any);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("walletAddress is required (body or wallet signature headers)");
    });
});
