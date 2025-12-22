import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { requireStripe } from "@/lib/stripe";
import { creditsService } from "@/lib/services/credits";
import { organizationsService } from "@/lib/services/organizations";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkMiniappRateLimit,
  createRateLimitErrorResponse,
  addRateLimitInfoToResponse,
  MINIAPP_RATE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import type Stripe from "stripe";

const CUSTOM_AMOUNT_LIMITS = {
  MIN_AMOUNT: 5,
  MAX_AMOUNT: 1000,
} as const;

// Configurable currency
const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || "usd";

const checkoutRequestSchema = z
  .object({
    creditPackId: z.string().uuid().optional(),
    amount: z
      .number()
      .min(
        CUSTOM_AMOUNT_LIMITS.MIN_AMOUNT,
        `Amount must be at least $${CUSTOM_AMOUNT_LIMITS.MIN_AMOUNT}`,
      )
      .max(
        CUSTOM_AMOUNT_LIMITS.MAX_AMOUNT,
        `Amount cannot exceed $${CUSTOM_AMOUNT_LIMITS.MAX_AMOUNT}`,
      )
      .finite("Amount must be a valid number")
      .optional(),
    successUrl: z.string().url("Invalid success URL"),
    cancelUrl: z.string().url("Invalid cancel URL"),
    // Optional app ID for app-specific credit purchases (monetization)
    appId: z.string().uuid().optional(),
  })
  .refine((data) => data.creditPackId || data.amount, {
    message: "Either creditPackId or amount must be provided",
  });

/**
 * OPTIONS /api/v1/miniapp/billing/checkout
 * CORS preflight handler for miniapp checkout endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

/**
 * POST /api/v1/miniapp/billing/checkout
 * Creates a Stripe checkout session for miniapp users to purchase credits.
 * Supports both credit packs and custom amounts. Returns a checkout URL that redirects back to the miniapp after payment.
 *
 * Request Body:
 * - `creditPackId` (optional): UUID of a credit pack to purchase.
 * - `amount` (optional): Custom amount in dollars ($5-$1000).
 * - `successUrl`: URL to redirect to after successful payment.
 * - `cancelUrl`: URL to redirect to if payment is cancelled.
 * - `appId` (optional): App ID for app-specific credit purchases (monetization).
 *
 * @param request - Request body with checkout details.
 * @returns Checkout session ID and URL.
 */
export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_RATE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();

    const validationResult = checkoutRequestSchema.safeParse(body);
    if (!validationResult.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const {
      creditPackId,
      amount,
      successUrl,
      cancelUrl,
      appId: bodyAppId,
    } = validationResult.data;

    // App ID can come from body OR X-App-Id header (proxy adds header automatically)
    const headerAppId = request.headers.get("X-App-Id");
    const appId = bodyAppId || headerAppId || undefined;

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    let creditsAmount: number;
    let sessionMetadata: Record<string, string>;

    const organizationId = user.organization_id;

    // Determine if this is an app-specific purchase
    const isAppPurchase = !!appId;
    const purchaseSource = isAppPurchase ? "miniapp_app" : "miniapp";

    if (isAppPurchase) {
      logger.info("[Miniapp Billing] App-specific checkout", {
        appId,
        headerAppId,
        bodyAppId,
      });
    }

    if (creditPackId) {
      const creditPack = await creditsService.getCreditPackById(creditPackId);
      if (!creditPack || !creditPack.is_active) {
        const response = NextResponse.json(
          { success: false, error: "Invalid or inactive credit pack" },
          { status: 404 },
        );
        return addCorsHeaders(response, corsResult.origin);
      }

      lineItems = [
        {
          price: creditPack.stripe_price_id,
          quantity: 1,
        },
      ];
      creditsAmount = Number(creditPack.credits);
      sessionMetadata = {
        organization_id: organizationId,
        user_id: user.id,
        credit_pack_id: creditPackId,
        credits: creditPack.credits.toString(),
        type: "credit_pack",
        source: purchaseSource,
        ...(appId && { app_id: appId }),
      };
    } else if (amount) {
      // For app purchases, customize the product name to show app context
      const productName = isAppPurchase
        ? "App Credits Top-up"
        : "Account Balance Top-up";
      const productDescription = isAppPurchase
        ? `Add $${amount.toFixed(2)} credits to your app balance`
        : `Add $${amount.toFixed(2)} to your account balance`;

      lineItems = [
        {
          price_data: {
            currency: STRIPE_CURRENCY,
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ];
      creditsAmount = amount;
      sessionMetadata = {
        organization_id: organizationId,
        user_id: user.id,
        credits: amount.toFixed(2),
        type: "custom_amount",
        source: purchaseSource,
        ...(appId && { app_id: appId }),
      };
    } else {
      const response = NextResponse.json(
        {
          success: false,
          error: "Either creditPackId or amount must be provided",
        },
        { status: 400 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Get or create Stripe customer
    let customerId = user.organization.stripe_customer_id;

    if (!customerId) {
      const customerData: Stripe.CustomerCreateParams = {
        name: user.organization.name,
        metadata: {
          organization_id: organizationId,
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

      const customer = await requireStripe().customers.create(customerData);
      customerId = customer.id;

      await organizationsService.update(organizationId, {
        stripe_customer_id: customerId,
        updated_at: new Date(),
      });
    }

    // Create checkout session
    const session = await requireStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: sessionMetadata,
    });

    logger.info("[Miniapp Billing] Checkout session created", {
      sessionId: session.id,
      credits: creditsAmount,
      userId: user.id,
      organizationId,
      appId: appId || null,
      isAppPurchase,
    });

    const response = NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });

    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp Billing] Error creating checkout session", {
      error,
    });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create checkout session",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
