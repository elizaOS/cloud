import { type NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { creditsService } from "@/lib/services";
import { headers } from "next/headers";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature provided" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook configuration error" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  // Handle the event
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          const organizationId = session.metadata?.organization_id;
          const userId = session.metadata?.user_id;
          const credits = Number.parseInt(session.metadata?.credits || "0", 10);
          const paymentIntentId = session.payment_intent as string;

          if (!organizationId || !credits || credits <= 0) {
            console.warn(
              `Invalid metadata in checkout session ${session.id}: organizationId=${organizationId}, credits=${credits}`
            );
            break;
          }

          if (!paymentIntentId) {
            console.warn(
              `No payment intent ID in checkout session ${session.id}`
            );
            break;
          }

          // Check for duplicate transaction
          const existingTransaction =
            await creditsService.getTransactionByStripePaymentIntent(
              paymentIntentId
            );

          if (existingTransaction) {
            console.log(
              `⚠️ Duplicate webhook event detected. Payment intent ${paymentIntentId} already processed (transaction ${existingTransaction.id})`
            );
            return NextResponse.json(
              { received: true, duplicate: true },
              { status: 200 }
            );
          }

          // Add credits
          await creditsService.addCredits({
            organizationId,
            amount: credits,
            description: `Balance top-up - $${Number(credits).toFixed(2)}`,
            metadata: {
              user_id: userId,
              payment_intent_id: paymentIntentId,
              session_id: session.id,
            },
            stripePaymentIntentId: paymentIntentId,
          });

          console.log(
            `✓ Added ${credits} credits to organization ${organizationId} (payment intent: ${paymentIntentId})`
          );
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        console.log("Payment intent succeeded:", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        console.error("Payment intent failed:", paymentIntent.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error(
      `[Stripe Webhook] Error processing event ${event.type} (${event.id}):`,
      error
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[Stripe Webhook] Error details:", {
      event_id: event.id,
      event_type: event.type,
      error_message: errorMessage,
      error_stack: errorStack,
    });

    return NextResponse.json(
      {
        error: "Webhook handler failed",
        event_id: event.id,
        event_type: event.type,
      },
      { status: 500 }
    );
  }
}
