import { config } from "dotenv";
import { stripe } from "../lib/stripe";

config({ path: ".env.local" });

async function testStripeWebhook() {
  console.log("🧪 Testing Stripe Webhook Configuration\n");
  console.log("=".repeat(70));

  // Check if Stripe is configured
  console.log("\n1️⃣ Checking Stripe Configuration:");
  console.log("-".repeat(70));

  if (!process.env.STRIPE_SECRET_KEY) {
    console.log("❌ STRIPE_SECRET_KEY not found in .env.local");
    return;
  }
  console.log(
    `✓ STRIPE_SECRET_KEY found: ${process.env.STRIPE_SECRET_KEY.substring(0, 20)}...`,
  );

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.log("⚠️  STRIPE_WEBHOOK_SECRET not found in .env.local");
    console.log("   Webhooks will NOT work without this!");
  } else {
    console.log(
      `✓ STRIPE_WEBHOOK_SECRET found: ${process.env.STRIPE_WEBHOOK_SECRET.substring(0, 15)}...`,
    );
  }

  // Check if we can reach Stripe
  console.log("\n2️⃣ Testing Stripe API Connection:");
  console.log("-".repeat(70));

  try {
    const account = await stripe.accounts.retrieve();
    console.log(`✓ Connected to Stripe account: ${account.id}`);
    console.log(
      `  Business Name: ${account.business_profile?.name || "(not set)"}`,
    );
    console.log(`  Country: ${account.country}`);
  } catch (error) {
    console.log(`❌ Failed to connect to Stripe: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Check webhook endpoints
  console.log("\n3️⃣ Checking Webhook Endpoints:");
  console.log("-".repeat(70));

  try {
    const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });

    if (webhooks.data.length === 0) {
      console.log("⚠️  No webhook endpoints configured in Stripe!");
      console.log("   You need to either:");
      console.log(
        "   a) Run: stripe listen --forward-to localhost:3000/api/stripe/webhook",
      );
      console.log("   b) Configure webhook endpoint in Stripe Dashboard");
    } else {
      console.log(`Found ${webhooks.data.length} webhook endpoint(s):`);
      webhooks.data.forEach((webhook, i) => {
        console.log(`\n  Webhook ${i + 1}:`);
        console.log(`    URL: ${webhook.url}`);
        console.log(`    Status: ${webhook.status}`);
        console.log(`    Events: ${webhook.enabled_events.join(", ")}`);
        console.log(`    Secret: ${webhook.secret?.substring(0, 15)}...`);
      });
    }
  } catch (error) {
    console.log(`⚠️  Could not list webhooks: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check recent checkout sessions
  console.log("\n4️⃣ Checking Recent Checkout Sessions:");
  console.log("-".repeat(70));

  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 5 });

    if (sessions.data.length === 0) {
      console.log("No recent checkout sessions found");
    } else {
      sessions.data.forEach((session, i) => {
        console.log(`\nSession ${i + 1}:`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Status: ${session.status}`);
        console.log(`  Payment Status: ${session.payment_status}`);
        console.log(
          `  Amount: $${((session.amount_total || 0) / 100).toFixed(2)}`,
        );
        console.log(`  Customer: ${session.customer || "(none)"}`);
        console.log(`  Payment Intent: ${session.payment_intent || "(none)"}`);
        console.log(
          `  Created: ${new Date(session.created * 1000).toISOString()}`,
        );
        console.log(`  Metadata:`, JSON.stringify(session.metadata, null, 4));
      });
    }
  } catch (error) {
    console.log(`❌ Failed to list checkout sessions: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check recent payment intents
  console.log("\n5️⃣ Checking Recent Payment Intents:");
  console.log("-".repeat(70));

  try {
    const paymentIntents = await stripe.paymentIntents.list({ limit: 5 });

    if (paymentIntents.data.length === 0) {
      console.log("No recent payment intents found");
    } else {
      paymentIntents.data.forEach((intent, i) => {
        console.log(`\nPayment Intent ${i + 1}:`);
        console.log(`  ID: ${intent.id}`);
        console.log(`  Status: ${intent.status}`);
        console.log(`  Amount: $${((intent.amount || 0) / 100).toFixed(2)}`);
        console.log(`  Customer: ${intent.customer || "(none)"}`);
        console.log(
          `  Created: ${new Date(intent.created * 1000).toISOString()}`,
        );
      });
    }
  } catch (error) {
    console.log(`❌ Failed to list payment intents: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("\n\n" + "=".repeat(70));
  console.log("✅ Stripe webhook configuration check complete\n");
}

testStripeWebhook()
  .then(() => {
    console.log("🎉 Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
