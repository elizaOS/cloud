import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { organizationsService } from "@/lib/services/organizations";
import { NextRequest } from "next/server";

const mockGetTopupRecipient = mock();

mock.module("x402-next", () => ({
    withX402: (handler: any) => handler,
}));

mock.module("@/lib/services/topup", () => ({
    getTopupRecipient: mockGetTopupRecipient,
}));

mock.module("@/lib/services/organizations", () => ({
    organizationsService: {
        create: mock(),
        updateCreditBalance: mock(),
    },
}));

mock.module("@/lib/services/referrals", () => ({
    referralsService: {
        applyReferralCode: mock().mockResolvedValue({ success: true }),
        calculateRevenueSplits: mock().mockResolvedValue({ splits: [] }),
    },
}));

mock.module("@/lib/services/redeemable-earnings", () => ({
    redeemableEarningsService: {
        addEarnings: mock().mockResolvedValue(true),
    },
}));

describe("x402 Topup Endpoints", () => {
    const mockWallet = "0x1234567890abcdef1234567890abcdef12345678";
    const mockOrgId = "org-1";
    const mockUserId = "user-1";

    beforeEach(() => {
        process.env.X402_RECIPIENT_ADDRESS = mockWallet;
        (organizationsService.updateCreditBalance as any).mockResolvedValue({ success: true, newBalance: 10 });
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
        (organizationsService.updateCreditBalance as any).mockClear();
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

        expect(organizationsService.updateCreditBalance).toHaveBeenCalledWith(mockOrgId, 10);
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

        expect(organizationsService.updateCreditBalance).toHaveBeenCalledWith(mockOrgId, 50);
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
