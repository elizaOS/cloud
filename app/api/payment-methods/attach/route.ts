import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { paymentMethodsService } from "@/lib/services/payment-methods";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const attachPaymentMethodSchema = z.object({
  paymentMethodId: z
    .string()
    .min(1, "Payment method ID is required")
    .startsWith("pm_", "Invalid payment method ID format"),
});

/**
 * POST /api/payment-methods/attach
 * Attaches a payment method to the organization's Stripe customer.
 *
 * @param req - Request body containing paymentMethodId (Stripe payment method ID).
 * @returns Success status.
 */
async function handleAttachPaymentMethod(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const body = await req.json();
    const validationResult = attachPaymentMethodSchema.safeParse(body);

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

    await paymentMethodsService.attachPaymentMethod(
      user.organization_id!,
      paymentMethodId,
    );

    return NextResponse.json({
      success: true,
      message: "Payment method attached successfully",
    });
  } catch (error) {
    console.error("Error attaching payment method:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes("not found") ? 404 : 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to attach payment method" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(
  handleAttachPaymentMethod,
  RateLimitPresets.STRICT,
);
