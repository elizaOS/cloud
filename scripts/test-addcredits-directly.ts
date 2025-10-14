import { config } from "dotenv";
import { addCredits } from "../lib/queries/credits";

config({ path: ".env.local" });

async function testAddCredits() {
  console.log("🧪 Testing addCredits Function Directly\n");
  console.log("=".repeat(70));

  // Use the actual organization ID from the latest webhook
  const organizationId = "4f1a5f91-dca1-4192-8e4e-d8006d1579d4";
  const userId = "90919b6e-db31-4164-8919-e3bfa8af3e17";
  const credits = 150000;
  const paymentIntentId = "pi_test_manual_" + Date.now();

  console.log("\n📋 Test Parameters:");
  console.log("-".repeat(70));
  console.log(`Organization ID: ${organizationId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Credits to Add: ${credits.toLocaleString()}`);
  console.log(`Payment Intent ID: ${paymentIntentId}`);

  console.log("\n🚀 Calling addCredits()...");
  console.log("-".repeat(70));

  try {
    const result = await addCredits(
      organizationId,
      credits,
      "purchase",
      `Test credit pack purchase - ${credits.toLocaleString()} credits`,
      userId,
      paymentIntentId,
    );

    console.log("\n✅ SUCCESS!");
    console.log("-".repeat(70));
    console.log(`New Balance: ${result.newBalance.toLocaleString()}`);
    console.log(`Transaction ID: ${result.transaction.id}`);
    console.log(
      `Transaction Amount: ${result.transaction.amount.toLocaleString()}`,
    );
    console.log(`Transaction Type: ${result.transaction.type}`);
    console.log(
      `Stripe Payment Intent ID: ${result.transaction.stripe_payment_intent_id}`,
    );

    console.log("\n📊 Verifying in Database...");
    console.log("-".repeat(70));

    const { db } = await import("../db/drizzle");
    const schema = await import("../db/sass/schema");
    const { eq } = await import("drizzle-orm");

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });

    if (org) {
      console.log(
        `✓ Organization credit balance: ${org.credit_balance.toLocaleString()}`,
      );
    } else {
      console.log(`❌ Could not find organization`);
    }

    const txn = await db.query.creditTransactions.findFirst({
      where: eq(
        schema.creditTransactions.stripe_payment_intent_id,
        paymentIntentId,
      ),
    });

    if (txn) {
      console.log(`✓ Transaction found in database: ${txn.id}`);
    } else {
      console.log(`❌ Transaction not found in database`);
    }
  } catch (error: unknown) {
    console.error("\n❌ ERROR!");
    console.error("-".repeat(70));
    
    if (error instanceof Error) {
      console.error(`Error Type: ${error.constructor.name}`);
      console.error(`Error Message: ${error.message}`);
      
      // Handle database/PostgreSQL errors with code and detail properties
      const errorWithCode = error as Error & { code?: string; detail?: string };
      console.error(`Error Code: ${errorWithCode.code || "(none)"}`);
      
      if (error.stack) {
        console.error(`\nStack Trace:`);
        console.error(error.stack);
      }
      
      if (errorWithCode.detail) {
        console.error(`\nDetail: ${errorWithCode.detail}`);
      }
    } else {
      console.error(`Error: ${String(error)}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ Test complete\n");
}

testAddCredits()
  .then(() => {
    console.log("🎉 Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  });
