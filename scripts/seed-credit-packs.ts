import { config } from "dotenv";
import { db } from "../db/client";
import { creditPacks as creditPacksTable } from "../db/schemas/credit-packs";

config({ path: ".env.local" });

const creditPacks = [
  {
    name: "Small Pack",
    description: "Perfect for testing and small projects",
    credits: 5, // $5.00 in credits (1 credit = $1.00)
    price_cents: 599, // $5.99 (20% markup)
    stripe_price_id: process.env.STRIPE_SMALL_PACK_PRICE_ID!,
    stripe_product_id: process.env.STRIPE_SMALL_PACK_PRODUCT_ID!,
    sort_order: 1,
  },
  {
    name: "Medium Pack",
    description: "Best value for regular usage",
    credits: 15, // $15.00 in credits (1 credit = $1.00)
    price_cents: 1499, // $14.99 (essentially par, slight discount)
    stripe_price_id: process.env.STRIPE_MEDIUM_PACK_PRICE_ID!,
    stripe_product_id: process.env.STRIPE_MEDIUM_PACK_PRODUCT_ID!,
    sort_order: 2,
  },
  {
    name: "Large Pack",
    description: "Maximum savings for power users",
    credits: 50, // $50.00 in credits (1 credit = $1.00)
    price_cents: 4499, // $44.99 (10% discount, best value)
    stripe_price_id: process.env.STRIPE_LARGE_PACK_PRICE_ID!,
    stripe_product_id: process.env.STRIPE_LARGE_PACK_PRODUCT_ID!,
    sort_order: 3,
  },
];

async function seedCreditPacks() {
  console.log("🌱 Seeding credit packs...");

  for (const pack of creditPacks) {
    try {
      const [result] = await db
        .insert(creditPacksTable)
        .values(pack)
        .returning();
      console.log(`✓ Created: ${pack.name} (${result.id})`);
    } catch (error) {
      console.error(`✗ Failed to create ${pack.name}:`, error);
    }
  }

  console.log("✅ Credit packs seeded successfully!");
}

seedCreditPacks()
  .then(() => {
    console.log("🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error seeding credit packs:", error);
    process.exit(1);
  });
