import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { paymentMethodsService } from "@/lib/services/payment-methods";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const removePaymentMethodSchema = z.object({
  paymentMethodId: z
    .string()
    .min(1, "Payment method ID is required")
    .startsWith("pm_", "Invalid payment method ID format"),
});

/**
 * POST /api/payment-methods/remove
 * Removes (detaches) a payment method from the organization.
 * Prevents removal if auto-top-up is enabled for the payment method.
 *
 * @param req - Request body containing paymentMethodId.
 * @returns Success status.
 */
async function handleRemovePaymentMethod(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const body = await req.json();
    const validationResult = removePaymentMethodSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { paymentMethodId } = validationResult.data;

    await paymentMethodsService.removePaymentMethod(
      user.organization_id!,
      paymentMethodId,
    );

    return NextResponse.json({
      success: true,
      message: "Payment method removed successfully",
    });
  } catch (error) {
    console.error("Error removing payment method:", error);

    if (error instanceof Error) {
      // Check for specific error conditions
      if (error.message.includes("auto-top-up is enabled")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes("not found") ? 404 : 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to remove payment method" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(
  handleRemovePaymentMethod,
  RateLimitPresets.STRICT,
);
