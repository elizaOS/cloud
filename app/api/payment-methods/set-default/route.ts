import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { paymentMethodsService } from "@/lib/services/payment-methods";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const setDefaultPaymentMethodSchema = z.object({
  paymentMethodId: z
    .string()
    .min(1, "Payment method ID is required")
    .startsWith("pm_", "Invalid payment method ID format"),
});

/**
 * POST /api/payment-methods/set-default
 * Set a payment method as the default for the organization
 */
async function handleSetDefaultPaymentMethod(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const body = await req.json();
    const validationResult = setDefaultPaymentMethodSchema.safeParse(body);

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

    await paymentMethodsService.setDefaultPaymentMethod(
      user.organization_id!,
      paymentMethodId,
    );

    return NextResponse.json({
      success: true,
      message: "Default payment method updated successfully",
    });
  } catch (error) {
    console.error("Error setting default payment method:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.message.includes("not found")
            ? 404
            : error.message.includes("does not belong")
              ? 403
              : 500,
        },
      );
    }

    return NextResponse.json(
      { error: "Failed to set default payment method" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(
  handleSetDefaultPaymentMethod,
  RateLimitPresets.STRICT,
);
