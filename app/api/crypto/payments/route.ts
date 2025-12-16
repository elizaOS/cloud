import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { isOxaPayConfigured } from "@/lib/services/oxapay";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { SUPPORTED_PAY_CURRENCIES } from "@/lib/config/crypto";

const createPaymentSchema = z.object({
  amount: z
    .number()
    .min(1, "Minimum amount is $1")
    .max(10000, "Maximum amount is $10,000"),
  currency: z.string().default("USD"),
  payCurrency: z.enum(SUPPORTED_PAY_CURRENCIES).default("USDT"),
  network: z
    .enum(["ERC20", "TRC20", "BEP20", "POLYGON", "SOL", "BASE", "ARB", "OP"])
    .optional(),
});

async function handleCreatePayment(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!isOxaPayConfigured()) {
      return NextResponse.json(
        { error: "Crypto payments not available" },
        { status: 503 }
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
        { status: 400 }
      );
    }

    const { amount, currency, payCurrency, network } = validation.data;

    const result = await cryptoPaymentsService.createPayment({
      organizationId: user.organization_id,
      userId: user.id,
      amount,
      currency,
      payCurrency,
      network,
    });

    return NextResponse.json({
      paymentId: result.payment.id,
      trackId: result.trackId,
      payLink: result.payLink,
      expiresAt: result.expiresAt.toISOString(),
      creditsToAdd: result.creditsToAdd,
    });
  } catch (error) {
    logger.error("[Crypto Payments API] Create payment error:", error);

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("invalid") && errorMessage.includes("uuid")) {
        return NextResponse.json(
          { error: "Invalid request format" },
          { status: 400 }
        );
      }

      if (errorMessage.includes("amount must be at least")) {
        return NextResponse.json(
          { error: "Amount too small" },
          { status: 400 }
        );
      }

      if (errorMessage.includes("amount must not exceed")) {
        return NextResponse.json(
          { error: "Amount too large" },
          { status: 400 }
        );
      }

      if (
        errorMessage.includes("not configured") ||
        errorMessage.includes("service not")
      ) {
        return NextResponse.json(
          { error: "Service temporarily unavailable" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to process payment request" },
      { status: 500 }
    );
  }
}

async function handleListPayments(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const payments = await cryptoPaymentsService.listPaymentsByOrganization(
      user.organization_id
    );

    return NextResponse.json({ payments });
  } catch (error) {
    logger.error("[Crypto Payments API] List payments error:", error);

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("invalid") && errorMessage.includes("uuid")) {
        return NextResponse.json(
          { error: "Invalid request format" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to retrieve payments" },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handleCreatePayment, RateLimitPresets.STRICT);
export const GET = withRateLimit(handleListPayments, RateLimitPresets.STANDARD);
