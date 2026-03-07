/**
 * Shared X402 topup flow: validation, recipient resolution, referral apply, credit update, revenue splits.
 * Used by /api/v1/topup/10, /api/v1/topup/50, and /api/v1/topup/100 so all tiers behave consistently.
 */
import crypto from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { withX402, type RouteConfig } from "x402-next";
import { organizationsService } from "@/lib/services/organizations";
import { getTopupRecipient } from "@/lib/services/topup";
import { referralsService } from "@/lib/services/referrals";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";

export interface CreateTopupHandlerOptions {
  amount: number;
  getSourceId: (walletAddress: string, paymentId: string) => string;
}

type TopupBody = {
  walletAddress?: string;
  ref?: string;
  referral_code?: string;
  appOwnerId?: string;
};

export function createTopupHandler(options: CreateTopupHandlerOptions) {
  const { amount, getSourceId } = options;

  return async function handler(req: NextRequest): Promise<NextResponse> {
    const body = (await req.json().catch(() => ({}))) as TopupBody;
    if (!body?.walletAddress?.trim() && !req.headers.get("X-Wallet-Signature")) {
      return NextResponse.json(
        { error: "walletAddress is required (body or wallet signature headers)" },
        { status: 400 },
      );
    }
    if (body?.walletAddress && !isAddress(body.walletAddress)) {
      return NextResponse.json(
        { error: "Valid EVM walletAddress is required" },
        { status: 400 },
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
    const ref =
      req.nextUrl.searchParams.get("ref") ||
      req.nextUrl.searchParams.get("referral_code") ||
      body.ref ||
      body.referral_code;
    const appOwnerId = req.nextUrl.searchParams.get("appOwnerId") || body.appOwnerId;

    if (ref && user) {
      const result = await referralsService.applyReferralCode(user.id, organizationId, ref, {
        appOwnerId: appOwnerId || undefined,
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
        const paymentId = req.headers.get("X-PAYMENT") ?? crypto.randomUUID();
        const sourceIdBase = getSourceId(walletAddress, paymentId);
        for (const split of splits) {
          if (split.amount <= 0) continue;
          const source =
            split.role === "app_owner" ? "app_owner_revenue_share" : "creator_revenue_share";
          await redeemableEarningsService.addEarnings({
            userId: split.userId,
            amount: split.amount,
            source,
            sourceId: `x402_crypto_split_${sourceIdBase}:${split.userId}`,
            dedupeBySourceId: true,
            description: `${split.role === "app_owner" ? "App Owner" : "Creator"} revenue share (${((split.amount / amount) * 100).toFixed(0)}%) for $${amount} crypto topup`,
            metadata: {
              buyer_user_id: user.id,
              buyer_org_id: organizationId,
              role: split.role,
              payment_method: "x402",
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
      message: `Successfully topped up $${amount}`,
    });
  };
}

const FALLBACK_PAYTO = "0x0000000000000000000000000000000000000001" as `0x${string}`;

export function getPayToAddress(): `0x${string}` {
  const raw = process.env.X402_RECIPIENT_ADDRESS?.trim();
  if (raw && raw !== "0x0000000000000000000000000000000000000000" && isAddress(raw)) {
    return raw as `0x${string}`;
  }
  return FALLBACK_PAYTO;
}

export function createWrappedHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
  payTo: `0x${string}`,
): (req: NextRequest) => Promise<NextResponse> {
  return async function wrapped(req: NextRequest): Promise<NextResponse> {
    if (payTo === FALLBACK_PAYTO) {
      return NextResponse.json(
        { error: "X402_RECIPIENT_ADDRESS is not configured" },
        { status: 503 },
      );
    }
    return handler(req);
  };
}

export function getNetwork(): string {
  return process.env.X402_NETWORK || "base-sepolia";
}

/**
 * Returns the POST handler for a topup route. Single factory so /10, /50, /100 only differ by amount.
 */
export function createTopupRoute(amount: number) {
  const handler = createTopupHandler({
    amount,
    getSourceId: (walletAddress: string, paymentId: string) =>
      crypto.createHash("sha256").update(`${walletAddress}-${amount}-${paymentId}`).digest("hex"),
  });
  const payTo = getPayToAddress();
  const wrappedHandler = createWrappedHandler(handler, payTo);
  const network = getNetwork() as RouteConfig["network"];
  const routeConfig: RouteConfig = {
    price: `$${amount}.00`,
    network,
    config: { description: `Topup $${amount} credits for Eliza Cloud` },
  };
  return withX402(wrappedHandler, payTo, routeConfig);
}
