import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../db/drizzle";
import * as schema from "../db/sass/schema";

config({ path: ".env.local" });

async function seedLocalDev() {
  console.log("🌱 Seeding Local Development Data");
  console.log("=".repeat(50));

  try {
    console.log("\n1️⃣ Creating test organization...");
    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: "Local Dev Organization",
        slug: "local-dev-org",
        credit_balance: 1000000,
        is_active: true,
      })
      .onConflictDoUpdate({
        target: schema.organizations.slug,
        set: {
          credit_balance: sql`${schema.organizations.credit_balance} + 1000000`,
          updated_at: new Date(),
        },
      })
      .returning();
    console.log(`   ✓ Organization ready (${org.id})`);

    console.log("\n2️⃣ Creating test users...");
    await db
      .insert(schema.users)
      .values({
        workos_user_id: "workos-local-dev",
        email: "dev@local.test",
        email_verified: true,
        name: "Local Dev User",
        organization_id: org.id,
        role: "owner",
        is_active: true,
      })
      .onConflictDoNothing({
        target: schema.users.email,
      });
    console.log("   ✓ User ready (dev@local.test)");

    const devEmail = process.env.USER_EMAIL || process.env.DEVELOPER_EMAIL;
    if (devEmail) {
      await db
        .insert(schema.users)
        .values({
          workos_user_id: `workos-${devEmail.split('@')[0]}`,
          email: devEmail,
          email_verified: true,
          name: devEmail.split('@')[0],
          organization_id: org.id,
          role: "owner",
          is_active: true,
        })
        .onConflictDoUpdate({
          target: schema.users.email,
          set: {
            organization_id: org.id,
            is_active: true,
          },
        });
      console.log(`   ✓ User ready (${devEmail})`);
    }

    console.log("\n3️⃣ Seeding credit packs...");
    const creditPacks = [
      {
        name: "Small Pack",
        description: "50,000 credits for AI generations",
        credits: 50000,
        price_cents: 4999,
        stripe_price_id:
          process.env.STRIPE_SMALL_PACK_PRICE_ID || "price_test_small",
        stripe_product_id:
          process.env.STRIPE_SMALL_PACK_PRODUCT_ID || "prod_test_small",
        sort_order: 1,
      },
      {
        name: "Medium Pack",
        description: "150,000 credits for AI generations",
        credits: 150000,
        price_cents: 12999,
        stripe_price_id:
          process.env.STRIPE_MEDIUM_PACK_PRICE_ID || "price_test_medium",
        stripe_product_id:
          process.env.STRIPE_MEDIUM_PACK_PRODUCT_ID || "prod_test_medium",
        sort_order: 2,
      },
      {
        name: "Large Pack",
        description: "500,000 credits for AI generations",
        credits: 500000,
        price_cents: 39999,
        stripe_price_id:
          process.env.STRIPE_LARGE_PACK_PRICE_ID || "price_test_large",
        stripe_product_id:
          process.env.STRIPE_LARGE_PACK_PRODUCT_ID || "prod_test_large",
        sort_order: 3,
      },
    ];

    for (const pack of creditPacks) {
      await db
        .insert(schema.creditPacks)
        .values(pack)
        .onConflictDoNothing({
          target: schema.creditPacks.stripe_price_id,
        });
      console.log(`   ✓ ${pack.name} ready`);
    }

    console.log("\n✅ Local development data seeded successfully!");
    console.log("\n📋 Test Account:");
    console.log("   Email: dev@local.test");
    console.log("   Organization: Local Dev Organization");
    console.log("   Credits: 1,000,000");
    console.log("\n⚠️  CRITICAL: Clear your browser cookies NOW!");
    console.log("   Your session references the old remote database.");
    console.log("\n📋 Steps to fix:");
    console.log("   1. Open browser DevTools (F12)");
    console.log("   2. Application → Cookies → http://localhost:3000");
    console.log("   3. Click 'Clear all cookies'");
    console.log("   4. Close all localhost:3000 tabs");
    console.log("   5. Run: npm run dev");
    console.log("   6. Open fresh tab: http://localhost:3000");
  } catch (error) {
    console.error(
      "\n❌ Seeding failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

seedLocalDev()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
