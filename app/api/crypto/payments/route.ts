import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { isCdpConfigured, getDefaultNetwork } from "@/lib/services/cdp-wallet";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

const createPaymentSchema = z.object({
  amount: z
    .number()
    .min(5, "Minimum amount is $5")
    .max(1000, "Maximum amount is $1000"),
  network: z.enum(["base", "base-sepolia"]).optional(),
});

async function handleCreatePayment(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    if (!isCdpConfigured()) {
      return NextResponse.json(
        { error: "Crypto payments not available" },
        { status: 503 },
      );
    }

    const body = await req.json();
    const validation = createPaymentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { amount, network } = validation.data;

    const result = await cryptoPaymentsService.createPayment({
      organizationId: user.organization_id,
      userId: user.id,
      amount,
      network: network || getDefaultNetwork(),
    });

    return NextResponse.json({
      paymentId: result.payment.id,
      paymentAddress: result.paymentAddress,
      expectedAmount: amount.toFixed(6),
      network: result.network,
      token: "USDC",
      tokenAddress: result.usdcAddress,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error("[Crypto Payments API] Create payment error:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 },
    );
  }
}

async function handleListPayments(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const payments = await cryptoPaymentsService.listPaymentsByOrganization(
      user.organization_id,
    );

    return NextResponse.json({ payments });
  } catch (error) {
    logger.error("[Crypto Payments API] List payments error:", error);
    return NextResponse.json(
      { error: "Failed to list payments" },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleCreatePayment, RateLimitPresets.STRICT);
export const GET = withRateLimit(handleListPayments, RateLimitPresets.STANDARD);
