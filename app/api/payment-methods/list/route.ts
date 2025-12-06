import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { paymentMethodsService } from "@/lib/services/payment-methods";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { organizationsRepository } from "@/db/repositories";

/**
 * GET /api/payment-methods/list
 * Lists all payment methods for the organization.
 * Also returns the default payment method ID for UI indication.
 *
 * @param req - The Next.js request object.
 * @returns Array of payment methods with card details and default payment method ID.
 */
async function handleListPaymentMethods(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const paymentMethods = await paymentMethodsService.listPaymentMethods(
      user.organization_id!,
    );

    // Get organization to include default payment method info
    const org = await organizationsRepository.findById(user.organization_id!);

    return NextResponse.json({
      paymentMethods: paymentMethods.map((pm) => ({
        id: pm.id,
        type: pm.type,
        card: pm.card
          ? {
              brand: pm.card.brand,
              last4: pm.card.last4,
              exp_month: pm.card.exp_month,
              exp_year: pm.card.exp_year,
              funding: pm.card.funding,
            }
          : null,
        billing_details: pm.billing_details,
        created: pm.created,
      })),
      defaultPaymentMethodId: org?.stripe_default_payment_method || null,
    });
  } catch (error) {
    console.error("Error listing payment methods:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to list payment methods" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const GET = withRateLimit(
  handleListPaymentMethods,
  RateLimitPresets.STANDARD,
);
