import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { organizationsService } from "@/lib/services/organizations";
import { getTopupRecipient } from "@/lib/services/topup";
import { referralsService } from "@/lib/services/referrals";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";
import { isAddress } from "viem";
import crypto from "crypto";

const ALLOWED_AMOUNTS = [10, 50, 100];

async function handler(req: NextRequest): Promise<any> {
    const pathSegments = req.nextUrl.pathname.split('/');
    const amount = Number(pathSegments[pathSegments.length - 1]);

    if (!ALLOWED_AMOUNTS.includes(amount)) {
        return NextResponse.json(
            { error: "Invalid topup amount. Allowed values: 10, 50, 100" },
            { status: 400 }
        );
    }
    try {
        const body = await req.json().catch(() => ({})) as { walletAddress?: string; ref?: string; referral_code?: string; appOwnerId?: string };
        if (!body?.walletAddress?.trim() && !req.headers.get("X-Wallet-Signature")) {
            const msg = "walletAddress is required (body or wallet signature headers)";
            return NextResponse.json({ error: msg }, { status: 400 });
        }
        if (body?.walletAddress && !isAddress(body.walletAddress)) {
            return NextResponse.json(
                { error: "Valid EVM walletAddress is required" },
                { status: 400 }
            );
        }
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

        if (ref && user) {
            const result = await referralsService.applyReferralCode(user.id, organizationId, ref, {
                appOwnerId: appOwnerId || undefined
            });
            if (result.success) {
                logger.info(`[x402] Successfully applied referral code ${ref} to user ${user.id}`);
            }
        }

        await organizationsService.updateCreditBalance(organizationId, amount);

        logger.info(`Topped up ${walletAddress} with $${amount} via x402`);

        if (user) {
            const { splits } = await referralsService.calculateRevenueSplits(user.id, amount);
            if (splits.length > 0) {
                logger.info(`[x402] Processing revenue splits for $${amount} purchase by user ${user.id}`);
                for (const split of splits) {
                    if (split.amount <= 0) continue;

                    const source = split.role === "app_owner" ? "app_owner_revenue_share" : "creator_revenue_share";
                    const sourceId = crypto.createHash('sha256').update(`${walletAddress}-${amount}`).digest('hex');

                    await redeemableEarningsService.addEarnings({
                        userId: split.userId,
                        amount: split.amount,
                        source: source,
                        sourceId: `x402_crypto_split_${sourceId}`,
                        description: `${split.role === "app_owner" ? "App Owner" : "Creator"} revenue share (${(split.amount / amount * 100).toFixed(0)}%) for $${amount} crypto topup`,
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
            amount,
            walletAddress,
            organizationId,
            message: `Successfully topped up $${amount}`
        });
    } catch (error) {
        logger.error("Error processing topup", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

const payTo = process.env.X402_RECIPIENT_ADDRESS;
if (!payTo || payTo.trim() === '' || payTo.trim() === "0x0000000000000000000000000000000000000000") {
    throw new Error("X402_RECIPIENT_ADDRESS must be configured with a valid EVM address");
}

export const POST = withX402(
    handler,
    payTo as `0x${string}`,
    {
        price: price => `$${price.toFixed(2)}`,
        network: (process.env.X402_NETWORK || "base-sepolia") as any,
        config: { description: price => `Topup $${price.toFixed(2)} credits for Eliza Cloud` }
    }
);
