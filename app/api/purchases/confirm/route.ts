import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { purchasesService } from "@/lib/services/purchases";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const confirmPurchaseSchema = z.object({
  paymentIntentId: z
    .string()
    .min(1, "Payment intent ID is required")
    .startsWith("pi_", "Invalid payment intent ID format"),
  paymentMethodId: z
    .string()
    .min(1, "Payment method ID is required")
    .startsWith("pm_", "Invalid payment method ID format"),
});

/**
 * POST /api/purchases/confirm
 * Confirms a PaymentIntent with a payment method.
 * Used when a PaymentIntent was created without immediate confirmation
 * and needs to be confirmed with a specific payment method.
 *
 * Request Body:
 * - `paymentIntentId`: Stripe PaymentIntent ID (required, pi_* format).
 * - `paymentMethodId`: Stripe payment method ID (required, pm_* format).
 *
 * @param req - Request body with payment intent and payment method IDs.
 * @returns Confirmed PaymentIntent details with status and amount.
 */
async function handleConfirmPurchase(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const body = await req.json();
    const validationResult = confirmPurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { paymentIntentId, paymentMethodId } = validationResult.data;

    const paymentIntent = await purchasesService.confirmPaymentIntent(
      paymentIntentId,
      paymentMethodId,
      user.organization_id!,
    );

    return NextResponse.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100, // Convert from cents to dollars
      message:
        paymentIntent.status === "succeeded"
          ? "Payment confirmed successfully"
          : `Payment status: ${paymentIntent.status}`,
    });
  } catch (error) {
    logger.error("Error confirming purchase:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("not found") ||
        error.message.includes("unauthorized")
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to confirm purchase" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(
  handleConfirmPurchase,
  RateLimitPresets.STRICT,
);
