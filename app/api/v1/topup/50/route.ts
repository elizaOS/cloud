/**
 * POST /api/v1/topup/50 — X402 $50 credit topup.
 * Flow: handler (validation, recipient, splits) → wrappedHandler (503 if no payTo) → withX402.
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "x402-next";
import { organizationsService } from "@/lib/services/organizations";
import { getTopupRecipient } from "@/lib/services/topup";
import { referralsService } from "@/lib/services/referrals";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";
import { isAddress } from "viem";
import crypto from "crypto";

const AMOUNT = 50;

async function handler(req: NextRequest): Promise<NextResponse> {
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

        await organizationsService.updateCreditBalance(organizationId, AMOUNT);

        logger.info(`Topped up ${walletAddress} with $${AMOUNT} via x402`);

        if (user) {
            const { splits } = await referralsService.calculateRevenueSplits(user.id, AMOUNT);
            if (splits.length > 0) {
                logger.info(`[x402] Processing revenue splits for $${AMOUNT} purchase by user ${user.id}`);
                const paymentId = req.headers.get("X-PAYMENT") ?? crypto.randomUUID();
                for (const split of splits) {
                    if (split.amount <= 0) continue;

                    const source = split.role === "app_owner" ? "app_owner_revenue_share" : "creator_revenue_share";
                    const sourceId = crypto.createHash("sha256").update(`${walletAddress}-${AMOUNT}-${paymentId}`).digest("hex");

                    await redeemableEarningsService.addEarnings({
                        userId: split.userId,
                        amount: split.amount,
                        source: source,
                        sourceId: `x402_crypto_split_${sourceId}`,
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

const payToRaw = process.env.X402_RECIPIENT_ADDRESS?.trim();
const payTo =
    payToRaw && payToRaw !== "0x0000000000000000000000000000000000000000" && isAddress(payToRaw)
        ? (payToRaw as `0x${string}`)
        : ("0x0000000000000000000000000000000000000001" as `0x${string}`);

async function wrappedHandler(req: NextRequest): Promise<NextResponse> {
    if (payTo === "0x0000000000000000000000000000000000000001") {
        return NextResponse.json(
            { error: "X402_RECIPIENT_ADDRESS is not configured" },
            { status: 503 }
        );
    }
    return handler(req);
}

const network = (process.env.X402_NETWORK || "base-sepolia") as RouteConfig["network"];
const routeConfig: RouteConfig = {
    price: "$50.00",
    network,
    config: { description: "Topup $50 credits for Eliza Cloud" },
};

export const POST = withX402(wrappedHandler, payTo, routeConfig);
