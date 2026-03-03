import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { organizationsService } from "@/lib/services/organizations";
import { usersService } from "@/lib/services/users";
import { referralsService } from "@/lib/services/referrals";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";

const AMOUNT = 100;

async function handler(req: NextRequest): Promise<any> {
    try {
        const body = await req.json();
        const { walletAddress } = body;

        if (!walletAddress) {
            return NextResponse.json(
                { error: "walletAddress is required" },
                { status: 400 }
            );
        }

        let user = await usersService.getByWalletAddress(walletAddress);
        let organizationId = user?.organization_id;

        if (!user || !organizationId) {
            const org = await organizationsService.create({
                name: `Wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`,
                slug: `wallet-${walletAddress.toLowerCase()}`,
                credit_balance: "0",
            });
            organizationId = org.id;

            if (!user) {
                user = await usersService.create({
                    wallet_address: walletAddress,
                    wallet_chain_type: "evm",
                    wallet_verified: true,
                    organization_id: organizationId,
                });
            } else {
                await usersService.update(user.id, { organization_id: organizationId });
            }
        }

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
        price: "$100.00",
        network: (process.env.X402_NETWORK || "base-sepolia") as any,
        config: { description: "Topup $100 credits for Eliza Cloud" }
    }
);
