import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { purchasesService } from "@/lib/services/purchases";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * GET /api/purchases/status
 * Gets the status of a PaymentIntent.
 * Allows the frontend to poll for payment status updates.
 * Used to check if a payment has completed successfully.
 *
 * Query Parameters:
 * - `paymentIntentId`: Stripe PaymentIntent ID (required, pi_* format).
 *
 * @param req - Request with paymentIntentId query parameter.
 * @returns PaymentIntent status, amount, currency, and metadata.
 */
async function handleGetPurchaseStatus(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const { searchParams } = new URL(req.url);
    const paymentIntentId = searchParams.get("paymentIntentId");

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "Payment intent ID is required" },
        { status: 400 },
      );
    }

    if (!paymentIntentId.startsWith("pi_")) {
      return NextResponse.json(
        { error: "Invalid payment intent ID format" },
        { status: 400 },
      );
    }

    const paymentIntent = await purchasesService.getPaymentIntent(
      paymentIntentId,
      user.organization_id!,
    );

    if (!paymentIntent) {
      return NextResponse.json(
        { error: "Payment intent not found or unauthorized" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100, // Convert from cents to dollars
      currency: paymentIntent.currency,
      created: paymentIntent.created,
      metadata: paymentIntent.metadata,
    });
  } catch (error) {
    console.error("Error getting purchase status:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to get purchase status" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler with standard preset (allows polling)
export const GET = withRateLimit(
  handleGetPurchaseStatus,
  RateLimitPresets.STANDARD,
);
