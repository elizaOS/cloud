import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { purchasesService, PURCHASE_LIMITS } from "@/lib/services/purchases";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const createPurchaseSchema = z.object({
  amount: z
    .number()
    .min(
      PURCHASE_LIMITS.MIN_AMOUNT,
      `Amount must be at least $${PURCHASE_LIMITS.MIN_AMOUNT}`,
    )
    .max(
      PURCHASE_LIMITS.MAX_AMOUNT,
      `Amount cannot exceed $${PURCHASE_LIMITS.MAX_AMOUNT}`,
    )
    .finite("Amount must be a valid number"),
  paymentMethodId: z
    .string()
    .startsWith("pm_", "Invalid payment method ID format")
    .optional(),
  confirmImmediately: z.boolean().optional().default(false),
});

/**
 * POST /api/purchases/create
 * Creates a Stripe PaymentIntent for a one-time credit purchase.
 * Supports custom amounts ($1-$1000). Can be confirmed immediately if a payment method is provided,
 * or the client secret can be used with Stripe Elements for frontend confirmation.
 *
 * Request Body:
 * - `amount`: Purchase amount in dollars (required, $1-$1000).
 * - `paymentMethodId`: Optional Stripe payment method ID (pm_*).
 * - `confirmImmediately`: Optional boolean to confirm payment immediately (default: false).
 *
 * @param req - Request body with purchase details.
 * @returns PaymentIntent details including client secret and status.
 */
async function handleCreatePurchase(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const body = await req.json();
    const validationResult = createPurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { amount, paymentMethodId, confirmImmediately } =
      validationResult.data;

    // Create the purchase (PaymentIntent)
    const result = await purchasesService.createPurchase({
      organizationId: user.organization_id!,
      amount,
      paymentMethodId,
      confirmImmediately,
    });

    return NextResponse.json({
      success: true,
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      status: result.status,
      amount: result.amount,
      message:
        result.status === "succeeded"
          ? "Payment successful"
          : "Payment intent created",
    });
  } catch (error) {
    console.error("Error creating purchase:", error);

    if (error instanceof Error) {
      // Check for specific error types
      if (
        error.message.includes("must be at least") ||
        error.message.includes("cannot exceed")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error.message.includes("not found")) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to create purchase" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(
  handleCreatePurchase,
  RateLimitPresets.STRICT,
);
