import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { creditsService, organizationsService } from "@/lib/services";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import type Stripe from "stripe";

const CUSTOM_AMOUNT_LIMITS = {
  MIN_AMOUNT: 5,
  MAX_AMOUNT: 1000,
} as const;

const checkoutRequestSchema = z
  .object({
    creditPackId: z.string().uuid().optional(),
    amount: z
      .number()
      .min(
        CUSTOM_AMOUNT_LIMITS.MIN_AMOUNT,
        `Amount must be at least $${CUSTOM_AMOUNT_LIMITS.MIN_AMOUNT}`
      )
      .max(
        CUSTOM_AMOUNT_LIMITS.MAX_AMOUNT,
        `Amount cannot exceed $${CUSTOM_AMOUNT_LIMITS.MAX_AMOUNT}`
      )
      .finite("Amount must be a valid number")
      .optional(),
    returnUrl: z.enum(["settings", "billing"]).optional().default("settings"),
  })
  .refine((data) => data.creditPackId || data.amount, {
    message: "Either creditPackId or amount must be provided",
  });

type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

async function handleCheckoutSession(req: NextRequest) {
  console.log("[Stripe Checkout] Route handler called!");

  try {
    console.log("[Stripe Checkout] Authenticating user...");
    const user = await requireAuthWithOrg();
    console.log("[Stripe Checkout] User authenticated:", user.id);

    const body = await req.json();
    console.log("[Stripe Checkout] Request body:", body);

    const validationResult = checkoutRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { creditPackId, amount, returnUrl } = validationResult.data;

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    let creditsAmount: number;
    let sessionMetadata: Record<string, string>;

    if (creditPackId) {
      const creditPack = await creditsService.getCreditPackById(creditPackId);
      if (!creditPack || !creditPack.is_active) {
        return NextResponse.json(
          { error: "Invalid or inactive credit pack" },
          { status: 404 }
        );
      }

      lineItems = [
        {
          price: creditPack.stripe_price_id,
          quantity: 1,
        },
      ];
      creditsAmount = Number(creditPack.credits);
      sessionMetadata = {
        organization_id: user.organization_id!,
        user_id: user.id,
        credit_pack_id: creditPackId,
        credits: creditPack.credits.toString(),
        type: "credit_pack",
      };
    } else if (amount) {
      lineItems = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Account Balance Top-up",
              description: `Add $${amount.toFixed(2)} to your account balance`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ];
      creditsAmount = amount;
      sessionMetadata = {
        organization_id: user.organization_id!,
        user_id: user.id,
        credits: amount.toFixed(2),
        type: "custom_amount",
      };
    } else {
      return NextResponse.json(
        { error: "Either creditPackId or amount must be provided" },
        { status: 400 }
      );
    }

    let customerId = user.organization.stripe_customer_id;

    if (!customerId) {
      const customerData: Stripe.CustomerCreateParams = {
        name: user.organization.name,
        metadata: {
          organization_id: user.organization_id!,
        },
      };

      const email = user.organization.billing_email || user.email;
      if (email) {
        customerData.email = email;
      }

      if (user.wallet_address) {
        customerData.metadata = {
          ...customerData.metadata,
          wallet_address: user.wallet_address,
        };
      }

      const customer = await stripe.customers.create(customerData);
      customerId = customer.id;

      await organizationsService.update(user.organization_id!, {
        stripe_customer_id: customerId,
        updated_at: new Date(),
      });
    }

    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const requestOrigin =
      req.headers.get("origin") ||
      req.headers.get("referer")?.split("/").slice(0, 3).join("/");
    const appUrl =
      (envAppUrl && envAppUrl.trim()) ||
      requestOrigin ||
      "http://localhost:3000";

    const baseUrl = appUrl.startsWith("http")
      ? appUrl
      : "http://localhost:3000";

    const successUrl = `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}&from=${returnUrl}`;
    const cancelUrl =
      returnUrl === "settings"
        ? `${baseUrl}/dashboard/settings?tab=billing`
        : `${baseUrl}/dashboard/billing?canceled=true`;

    console.log("[Stripe Checkout] Creating session with URLs:", {
      envAppUrl,
      requestOrigin,
      appUrl,
      baseUrl,
      successUrl,
      cancelUrl,
    });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: sessionMetadata,
    });

    console.log("[Stripe Checkout] Session created:", {
      sessionId: session.id,
      url: session.url,
      credits: creditsAmount,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

// Export rate-limited handler with standard preset
export const POST = withRateLimit(
  handleCheckoutSession,
  RateLimitPresets.STRICT
);
