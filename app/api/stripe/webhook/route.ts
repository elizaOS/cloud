import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { addCredits } from "@/lib/queries/credits";
import { headers } from "next/headers";
import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature provided" },
      { status: 400 },
    );
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  console.log(
    `[Stripe Webhook] Received event: ${event.type} (${event.id})`,
  );

  // Handle the event
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          const organizationId = session.metadata?.organization_id;
          const userId = session.metadata?.user_id;
          const credits = parseInt(session.metadata?.credits || "0", 10);
          const paymentIntentId = session.payment_intent as string;

          if (!organizationId || !credits || credits <= 0) {
            console.warn(
              `Invalid metadata in checkout session ${session.id}: organizationId=${organizationId}, credits=${credits}`,
            );
            break;
          }

          if (!paymentIntentId) {
            console.warn(
              `No payment intent ID in checkout session ${session.id}`,
            );
            break;
          }

          const existingTransaction =
            await db.query.creditTransactions.findFirst({
              where: eq(
                schema.creditTransactions.stripe_payment_intent_id,
                paymentIntentId,
              ),
            });

          if (existingTransaction) {
            console.log(
              `⚠️ Duplicate webhook event detected. Payment intent ${paymentIntentId} already processed (transaction ${existingTransaction.id})`,
            );
            return NextResponse.json(
              { received: true, duplicate: true },
              { status: 200 },
            );
          }

          await addCredits(
            organizationId,
            credits,
            "purchase",
            `Credit pack purchase - ${credits.toLocaleString()} credits`,
            userId,
            paymentIntentId,
          );

          revalidateTag("user-auth");

          console.log(
            `✓ Added ${credits} credits to organization ${organizationId} (payment intent: ${paymentIntentId})`,
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
      error,
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`[Stripe Webhook] Error details:`, {
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
      { status: 500 },
    );
  }
}
