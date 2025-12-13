import { config } from "dotenv";
import { stripe } from "../lib/stripe";

config({ path: ".env.local" });

async function debugLatestWebhook() {
  console.log("🔍 Debugging Latest Webhook Events\n");
  console.log("=".repeat(70));

  console.log("\n📋 Latest Checkout Sessions:");
  console.log("-".repeat(70));

  try {
    const sessions = await stripe.checkout.sessions.list({
      limit: 3,
      expand: ["data.line_items", "data.customer"],
    });

    if (sessions.data.length === 0) {
      console.log("❌ No checkout sessions found");
    } else {
      for (const session of sessions.data) {
        console.log(`\n🛒 Session: ${session.id}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Payment Status: ${session.payment_status}`);
        console.log(`   Amount: $${((session.amount_total || 0) / 100).toFixed(2)}`);
        console.log(`   Created: ${new Date(session.created * 1000).toISOString()}`);
        console.log(`   Customer: ${session.customer || "(none)"}`);
        console.log(`   Payment Intent: ${session.payment_intent || "(none)"}`);

        console.log(`\n   📦 Metadata:`);
        if (session.metadata && Object.keys(session.metadata).length > 0) {
          Object.entries(session.metadata).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
          });
        } else {
          console.log(`      ❌ NO METADATA - This is the problem!`);
        }

        if (session.line_items && session.line_items.data.length > 0) {
          console.log(`\n   🛍️  Line Items:`);
          session.line_items.data.forEach((item) => {
            console.log(`      - ${item.description}`);
            console.log(`        Amount: $${((item.amount_total || 0) / 100).toFixed(2)}`);
            console.log(`        Quantity: ${item.quantity}`);
          });
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("\n\n🔔 Latest Events:");
  console.log("-".repeat(70));

  try {
    const events = await stripe.events.list({
      limit: 10,
      types: [
        "checkout.session.completed",
        "payment_intent.succeeded",
        "payment_intent.created",
      ],
    });

    if (events.data.length === 0) {
      console.log("❌ No recent events found");
    } else {
      for (const event of events.data) {
        console.log(`\n📨 Event: ${event.type}`);
        console.log(`   ID: ${event.id}`);
        console.log(`   Created: ${new Date(event.created * 1000).toISOString()}`);

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Record<string, unknown>;
          console.log(`   Session ID: ${session.id}`);
          console.log(`   Payment Status: ${session.payment_status}`);
          console.log(`   Payment Intent: ${session.payment_intent || "(none)"}`);

          console.log(`   📦 Metadata in Event:`);
          const metadata = session.metadata as Record<string, unknown> | undefined;
          if (metadata && Object.keys(metadata).length > 0) {
            Object.entries(metadata).forEach(([key, value]) => {
              console.log(`      ${key}: ${value}`);
            });
          } else {
            console.log(`      ❌ NO METADATA`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("\n\n" + "=".repeat(70));
  console.log("✅ Debug complete\n");
}

debugLatestWebhook()
  .then(() => {
    console.log("🎉 Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
