import { config } from "dotenv";
import { db } from "../db/drizzle";
import * as schema from "../db/schema";
import { desc } from "drizzle-orm";

config({ path: ".env.local" });

async function checkDatabaseState() {
  console.log("🔍 Checking Database State\n");
  console.log("=" .repeat(70));

  console.log("\n📊 Organizations:");
  console.log("-".repeat(70));
  const orgs = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      credit_balance: schema.organizations.credit_balance,
      stripe_customer_id: schema.organizations.stripe_customer_id,
      created_at: schema.organizations.created_at,
    })
    .from(schema.organizations)
    .limit(10);

  if (orgs.length === 0) {
    console.log("❌ No organizations found in database!");
  } else {
    orgs.forEach((org) => {
      console.log(`\nOrganization: ${org.name}`);
      console.log(`  ID: ${org.id}`);
      console.log(`  Credit Balance: ${org.credit_balance.toLocaleString()}`);
      console.log(`  Stripe Customer: ${org.stripe_customer_id || "(not set)"}`);
      console.log(`  Created: ${org.created_at.toISOString()}`);
    });
  }

  console.log("\n\n💳 Recent Credit Transactions:");
  console.log("-".repeat(70));
  const transactions = await db
    .select()
    .from(schema.creditTransactions)
    .orderBy(desc(schema.creditTransactions.created_at))
    .limit(15);

  if (transactions.length === 0) {
    console.log("❌ No credit transactions found in database!");
  } else {
    transactions.forEach((txn) => {
      console.log(`\n[${txn.created_at.toISOString()}]`);
      console.log(`  Transaction ID: ${txn.id}`);
      console.log(`  Amount: ${txn.amount > 0 ? "+" : ""}${txn.amount.toLocaleString()}`);
      console.log(`  Type: ${txn.type}`);
      console.log(`  Description: ${txn.description || "(none)"}`);
      console.log(`  Organization ID: ${txn.organization_id}`);
      console.log(
        `  Stripe Payment Intent: ${txn.stripe_payment_intent_id || "(none)"}`,
      );
    });
  }

  console.log("\n\n📦 Credit Packs:");
  console.log("-".repeat(70));
  const packs = await db
    .select()
    .from(schema.creditPacks)
    .where(eq(schema.creditPacks.is_active, true));

  if (packs.length === 0) {
    console.log("⚠️  No active credit packs found!");
  } else {
    packs.forEach((pack) => {
      console.log(`\n${pack.name}:`);
      console.log(`  ID: ${pack.id}`);
      console.log(`  Credits: ${pack.credits.toLocaleString()}`);
      console.log(`  Price: $${(pack.price_cents / 100).toFixed(2)}`);
      console.log(`  Stripe Price ID: ${pack.stripe_price_id}`);
      console.log(`  Stripe Product ID: ${pack.stripe_product_id}`);
      console.log(`  Active: ${pack.is_active}`);
    });
  }

  console.log("\n\n" + "=".repeat(70));
  console.log("✅ Database check complete\n");
}

import { eq } from "drizzle-orm";

checkDatabaseState()
  .then(() => {
    console.log("🎉 Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
