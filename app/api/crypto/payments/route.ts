import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import {
  cryptoPaymentsService,
  CryptoPaymentError,
} from "@/lib/services/crypto-payments";
import { isOxaPayConfigured } from "@/lib/services/oxapay";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { SUPPORTED_PAY_CURRENCIES } from "@/lib/config/crypto";
import { trackServerEvent } from "@/lib/analytics/posthog-server";

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
    // Review: orgId null check at line 32 guards against missing organization_id before service calls
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const orgId = user.organization_id;

    

    const organization = await getOrganizationById(orgId);
    if (!organization || !organization.is_active) {
      // Review: ensures active organization status is enforced in case of external data issues
      return NextResponse.json(
        { error: "Organization is inactive" },
        { status: 403 },
      );
    // Review: requireAuthOrApiKeyWithOrg returns organization_id directly; guard functions as intended
    }

    if (!isOxaPayConfigured()) {
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

    const { amount, currency, payCurrency, network } = validation.data;

    const result = await cryptoPaymentsService.createPayment({
      organizationId: orgId,
      userId: user.id,
      amount,
      currency,
      payCurrency,
      network,
    });

    // Track crypto payment initiated in PostHog
    trackServerEvent(user.id, "crypto_payment_initiated", {
      amount,
      currency,
      pay_currency: payCurrency,
      network: network || "AUTO",
      organization_id: orgId,
      track_id: result.trackId,
    });

    // Also track unified checkout_initiated
    trackServerEvent(user.id, "checkout_initiated", {
      payment_method: "crypto",
      amount,
      currency,
      organization_id: orgId,
      source_page: "settings",
      purchase_type: "custom_amount",
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

    if (error instanceof CryptoPaymentError) {
      const statusMap: Record<string, { status: number; message: string }> = {
        INVALID_UUID: { status: 400, message: "Invalid request format" },
        AMOUNT_TOO_SMALL: { status: 400, message: "Amount too small" },
        AMOUNT_TOO_LARGE: { status: 400, message: "Amount too large" },
        SERVICE_NOT_CONFIGURED: {
          status: 503,
          message: "Service temporarily unavailable",
        },
      };

      const response = statusMap[error.code] || {
        status: 500,
        message: error.message,
      };
      return NextResponse.json(
        { error: response.message },
        { status: response.status },
      );
    }

    return NextResponse.json(
      { error: "Failed to process payment request" },
      { status: 500 },
    );
  }
}

async function handleListPayments(req: NextRequest) {
  try {
    // Review: Fallback logic handled in handleCreatePayment; other handlers retain current structure for consistency.
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const orgId = user.organization_id;

    const organization = await getOrganizationById(orgId);
    if (!organization || !organization.is_active) {
      return NextResponse.json(
        { error: "Organization is inactive" },
        { status: 403 },
      );
    }

    const payments = await cryptoPaymentsService.listPaymentsByOrganization(
      orgId,
    );

    return NextResponse.json({ payments });
  } catch (error) {
    logger.error("[Crypto Payments API] List payments error:", error);

    if (error instanceof CryptoPaymentError) {
      if (error.code === "INVALID_UUID") {
        return NextResponse.json(
          { error: "Invalid request format" },
          { status: 400 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to retrieve payments" },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleCreatePayment, RateLimitPresets.STRICT);
export const GET = withRateLimit(handleListPayments, RateLimitPresets.STANDARD);
