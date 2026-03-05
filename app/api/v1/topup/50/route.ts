import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { organizationsService } from "@/lib/services/organizations";
import { getTopupRecipient } from "@/lib/services/topup";
import { referralsService } from "@/lib/services/referrals";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";

const AMOUNT = 50;

async function handler(req: NextRequest): Promise<any> {
    try {
        const body = await req.json().catch(() => ({})) as { walletAddress?: string; ref?: string; referral_code?: string; appOwnerId?: string };
        let recipient;
        try {
            recipient = await getTopupRecipient(req, body);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("walletAddress is required")) {
                return NextResponse.json({ error: msg }, { status: 400 });
            }
            return NextResponse.json({ error: msg }, { status: 401 });
        }

        const { user, organizationId, walletAddress } = recipient;
        const ref = req.nextUrl.searchParams.get("ref") || req.nextUrl.searchParams.get("referral_code") || body.ref || body.referral_code;
        const appOwnerId = req.nextUrl.searchParams.get("appOwnerId") || body.appOwnerId;

        // Apply referral code if present (and first-touch)
        if (ref && user) {
            const result = await referralsService.applyReferralCode(user.id, organizationId, ref, {
                appOwnerId: appOwnerId || undefined
            });
            if (result.success) {
                logger.info(`[x402] Successfully applied referral code ${ref} to user ${user.id}`);
            }
        }

        await organizationsService.updateCreditBalance(organizationId, AMOUNT);

        logger.info(`Topped up ${walletAddress} with $${AMOUNT} via x402`);

        // Process revenue splits
        if (user) {
            const { splits } = await referralsService.calculateRevenueSplits(user.id, AMOUNT);
            if (splits.length > 0) {
                logger.info(`[x402] Processing revenue splits for $${AMOUNT} purchase by user ${user.id}`);
                for (const split of splits) {
                    if (split.amount <= 0) continue;

                    const source = split.role === "app_owner" ? "app_owner_revenue_share" : "creator_revenue_share";

                    await redeemableEarningsService.addEarnings({
                        userId: split.userId,
                        amount: split.amount,
                        source: source,
                        sourceId: "x402_crypto_split",
                        description: `${split.role === "app_owner" ? "App Owner" : "Creator"} revenue share (${(split.amount / AMOUNT * 100).toFixed(0)}%) for $${AMOUNT} crypto topup`,
                        metadata: {
                            buyer_user_id: user.id,
                            buyer_org_id: organizationId,
                            role: split.role,
                            payment_method: "x402"
                        },
                    });
                    logger.info(`[x402] Credited split: $${split.amount.toFixed(2)} to ${split.role} (${split.userId})`);
                }
            }
        }

        return NextResponse.json({
            success: true,
            amount: AMOUNT,
            walletAddress,
            organizationId,
            message: `Successfully topped up $${AMOUNT}`
        });
    } catch (error) {
        logger.error("Error processing topup", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

const payTo = (process.env.X402_RECIPIENT_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const POST = withX402(
    handler,
    payTo,
    {
        price: "$50.00",
        network: (process.env.X402_NETWORK || "base-sepolia") as any,
        config: { description: "Topup $50 credits for Eliza Cloud" }
    }
);
