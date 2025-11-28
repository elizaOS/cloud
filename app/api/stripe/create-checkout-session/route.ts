import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { creditsService, organizationsService } from "@/lib/services";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handleCheckoutSession(req: NextRequest) {
  console.log('[Stripe Checkout] 🚀 Route handler called!');
  
  try {
    console.log('[Stripe Checkout] Authenticating user...');
    const user = await requireAuthWithOrg();
    console.log('[Stripe Checkout] ✅ User authenticated:', user.id);

    const body = await req.json();
    console.log('[Stripe Checkout] Request body:', body);
    const { creditPackId } = body;

    if (!creditPackId) {
      return NextResponse.json(
        { error: "Credit pack ID is required" },
        { status: 400 },
      );
    }

    const creditPack = await creditsService.getCreditPackById(creditPackId);
    if (!creditPack || !creditPack.is_active) {
      return NextResponse.json(
        { error: "Invalid or inactive credit pack" },
        { status: 404 },
      );
    }

    // Get or create Stripe customer
    let customerId = user.organization.stripe_customer_id;

    if (!customerId) {
      const customerData: {
        name: string;
        email?: string;
        metadata: {
          organization_id: string;
          wallet_address?: string;
        };
      } = {
        name: user.organization.name,
        metadata: {
          organization_id: user.organization_id!!,
        },
      };

      const email = user.organization.billing_email || user.email;
      if (email) {
        customerData.email = email;
      }

      if (user.wallet_address) {
        customerData.metadata.wallet_address = user.wallet_address;
      }

      const customer = await stripe.customers.create(customerData);
      customerId = customer.id;

      // Save customer ID to database
      await organizationsService.update(user.organization_id!, {
        stripe_customer_id: customerId,
        updated_at: new Date(),
      });
    }

    // Get the app URL - use request origin as most reliable fallback
    // Handle empty string case explicitly (|| only handles falsy, but "" is falsy too)
    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const requestOrigin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');
    const appUrl = (envAppUrl && envAppUrl.trim()) || requestOrigin || 'http://localhost:3000';
    
    // Ensure we have an absolute URL (Stripe requires this)
    const baseUrl = appUrl.startsWith('http') ? appUrl : `http://localhost:3000`;
    const successUrl = `${baseUrl}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/dashboard/billing?canceled=true`;

    console.log('[Stripe Checkout] Creating session with URLs:', {
      envAppUrl,
      requestOrigin,
      appUrl,
      baseUrl,
      successUrl,
      cancelUrl,
    });

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: creditPack.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organization_id: user.organization_id!!,
        user_id: user.id,
        credit_pack_id: creditPackId,
        credits: creditPack.credits.toString(),
      },
    });

    console.log('[Stripe Checkout] Session created:', {
      sessionId: session.id,
      url: session.url,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}

// Export rate-limited handler with standard preset
export const POST = withRateLimit(
  handleCheckoutSession,
  RateLimitPresets.STRICT,
);
