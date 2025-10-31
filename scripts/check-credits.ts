import { db } from "@/db/client";
import { apiKeys, organizations, users, freeModelUsage } from "@/db/schemas";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function checkCredits() {
  const apiKeyValue = "eliza_bd17e026be1f0014026f51758d8193e5e43aaf480064e5372c93d095c446965a";
  const keyHash = crypto.createHash("sha256").update(apiKeyValue).digest("hex");

  console.log("🔍 Looking up API key...");

  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.key_hash, keyHash),
  });

  if (!apiKey) {
    console.log("❌ API key not found");
    return;
  }

  console.log(`✓ API Key found: ${apiKey.name} (ID: ${apiKey.id})`);

  const user = await db.query.users.findFirst({
    where: eq(users.id, apiKey.user_id),
  });

  if (!user) {
    console.log("❌ User not found");
    return;
  }

  console.log(`✓ User: ${user.email || user.wallet_address} (ID: ${user.id})`);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organization_id),
  });

  if (!org) {
    console.log("❌ Organization not found");
    return;
  }

  console.log("\n📊 ORGANIZATION INFO:");
  console.log(`   Name: ${org.name}`);
  console.log(`   Slug: ${org.slug}`);
  console.log(`   Credit Balance: $${org.credit_balance}`);
  console.log(`   Tier: ${org.tier}`);
  console.log(`   Active: ${org.is_active}`);

  const freeUsage = await db.query.freeModelUsage.findMany({
    where: eq(freeModelUsage.user_id, user.id),
  });

  console.log("\n🆓 FREE MODEL USAGE:");
  if (freeUsage.length === 0) {
    console.log("   No free model usage recorded yet");
  } else {
    for (const usage of freeUsage) {
      console.log(`   - ${usage.model}: ${usage.request_count} requests on ${usage.date}`);
    }
  }
}

checkCredits()
  .then(() => {
    console.log("\n✅ Check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Check failed:", error);
    process.exit(1);
  });
