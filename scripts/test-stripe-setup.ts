/**
 * Test Script for Stripe Credit Packs Integration
 *
 * This script helps you:
 * 1. Create test Stripe products via API
 * 2. Seed credit packs in database
 * 3. Test API endpoints
 *
 * Usage: tsx scripts/test-stripe-setup.ts
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!STRIPE_SECRET_KEY) {
  console.error("❌ Error: STRIPE_SECRET_KEY not found in .env.local");
  console.log("\n📝 Please add to .env.local:");
  console.log("STRIPE_SECRET_KEY=sk_test_your_key_here");
  process.exit(1);
}

console.log("🧪 Stripe Credit Packs Test Setup");
console.log("=".repeat(50));
console.log(`Stripe Key: ${STRIPE_SECRET_KEY.substring(0, 15)}...`);
console.log(
  `Mode: ${STRIPE_SECRET_KEY.startsWith("sk_test_") ? "TEST" : "LIVE"}`,
);
console.log("=".repeat(50));

interface StripeProduct {
  id: string;
  name: string;
  default_price: string;
}

interface StripePrice {
  id: string;
  product: string;
  unit_amount: number;
}

const creditPacksConfig = [
  {
    name: "Small Credit Pack",
    description:
      "50,000 credits for AI generations. Perfect for testing and small projects.",
    credits: 50000,
    price_cents: 4999, // $49.99
    sort_order: 1,
  },
  {
    name: "Medium Credit Pack",
    description:
      "150,000 credits for AI generations. Best value for regular usage.",
    credits: 150000,
    price_cents: 12999, // $129.99
    sort_order: 2,
  },
  {
    name: "Large Credit Pack",
    description:
      "500,000 credits for AI generations. Maximum savings for power users.",
    credits: 500000,
    price_cents: 39999, // $399.99
    sort_order: 3,
  },
];

/**
 * Step 1: Create Stripe Products
 */
async function createStripeProducts() {
  console.log("\n📦 Step 1: Creating Stripe Products");
  console.log("-".repeat(50));

  const products: Array<{
    name: string;
    productId: string;
    priceId: string;
    credits: number;
    priceCents: number;
    sortOrder: number;
  }> = [];

  for (const pack of creditPacksConfig) {
    try {
      console.log(`\n🔨 Creating: ${pack.name}...`);

      // Create product
      const productResponse = await fetch(
        "https://api.stripe.com/v1/products",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: pack.name,
            description: pack.description,
          }),
        },
      );

      if (!productResponse.ok) {
        const error = await productResponse.text();
        throw new Error(`Failed to create product: ${error}`);
      }

      const product: StripeProduct = await productResponse.json();
      console.log(`  ✓ Product created: ${product.id}`);

      // Create price
      const priceResponse = await fetch("https://api.stripe.com/v1/prices", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          product: product.id,
          unit_amount: pack.price_cents.toString(),
          currency: "usd",
        }),
      });

      if (!priceResponse.ok) {
        const error = await priceResponse.text();
        throw new Error(`Failed to create price: ${error}`);
      }

      const price: StripePrice = await priceResponse.json();
      console.log(
        `  ✓ Price created: ${price.id} ($${(pack.price_cents / 100).toFixed(2)})`,
      );

      products.push({
        name: pack.name,
        productId: product.id,
        priceId: price.id,
        credits: pack.credits,
        priceCents: pack.price_cents,
        sortOrder: pack.sort_order,
      });
    } catch (error) {
      console.error(`  ❌ Error creating ${pack.name}:`, error);
    }
  }

  return products;
}

/**
 * Step 2: Generate seed script with real IDs
 */
async function generateSeedScript(products: unknown[]) {
  console.log("\n📝 Step 2: Generating Seed Script");
  console.log("-".repeat(50));

  const seedContent = `import { config } from "dotenv";
import { db } from "../db/client";
import * as schema from "../db/schemas";

config({ path: ".env.local" });

const creditPacks = [
${products
  .map(
    (p) => `  {
    name: "${p.name.replace("Credit Pack", "Pack")}",
    description: "${creditPacksConfig.find((c) => c.name === p.name)?.description}",
    credits: ${p.credits},
    price_cents: ${p.priceCents},
    stripe_price_id: "${p.priceId}",
    stripe_product_id: "${p.productId}",
    sort_order: ${p.sortOrder},
  }`,
  )
  .join(",\n")}
];

async function seedCreditPacks() {
  console.log("🌱 Seeding credit packs...");

  for (const pack of creditPacks) {
    try {
      const [result] = await db
        .insert(schema.creditPacks)
        .values(pack)
        .returning();
      console.log(\`✓ Created: \${pack.name} (\${result.id})\`);
    } catch (error) {
      console.error(\`✗ Failed to create \${pack.name}:\`, error);
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
`;

  const fs = await import("fs");
  const path = await import("path");

  const seedPath = path.join(
    process.cwd(),
    "scripts",
    "seed-credit-packs-generated.ts",
  );
  fs.writeFileSync(seedPath, seedContent);

  console.log(
    `✓ Seed script generated: scripts/seed-credit-packs-generated.ts`,
  );
  console.log(`\n💡 Run: npm run tsx scripts/seed-credit-packs-generated.ts`);

  return seedPath;
}

/**
 * Step 3: Test API endpoints
 */
async function testAPIEndpoints() {
  console.log("\n🧪 Step 3: Testing API Endpoints");
  console.log("-".repeat(50));

  // Test 1: GET /api/stripe/credit-packs
  console.log("\n1️⃣ Testing GET /api/stripe/credit-packs...");
  try {
    const response = await fetch(`${BASE_URL}/api/stripe/credit-packs`);
    const data = await response.json();

    if (response.ok) {
      console.log(`  ✓ Status: ${response.status}`);
      console.log(`  ✓ Credit packs found: ${data.creditPacks?.length || 0}`);
      if (data.creditPacks?.length > 0) {
        console.log(`  ✓ First pack: ${data.creditPacks[0].name}`);
      }
    } else {
      console.log(`  ❌ Failed: ${response.status} - ${data.error}`);
    }
  } catch (error) {
    console.log(`  ❌ Error:`, error);
    console.log(`  💡 Is your dev server running? (npm run dev)`);
  }

  console.log("\n2️⃣ Testing POST /api/stripe/create-checkout-session...");
  console.log("  ⏭️  Skipped (requires authentication)");
  console.log("  💡 Test this endpoint from the browser at /dashboard/billing");

  console.log("\n3️⃣ Testing POST /api/stripe/webhook...");
  console.log("  ⏭️  Skipped (requires valid Stripe signature)");
  console.log("  💡 Test this with: stripe trigger checkout.session.completed");
}

/**
 * Main execution
 */
async function main() {
  try {
    // Step 1: Create Stripe products
    const products = await createStripeProducts();

    if (products.length === 0) {
      console.log(
        "\n❌ No products were created. Please check your Stripe API key.",
      );
      process.exit(1);
    }

    console.log("\n✅ Successfully created all Stripe products!");
    console.log("\nProduct Summary:");
    console.log("=".repeat(80));
    products.forEach((p) => {
      console.log(
        `${p.name.padEnd(30)} | ${p.priceId.padEnd(30)} | ${p.productId}`,
      );
    });
    console.log("=".repeat(80));

    // Step 2: Generate seed script
    await generateSeedScript(products);

    // Step 3: Test endpoints
    await testAPIEndpoints();

    console.log("\n🎉 Setup Complete!");
    console.log("\n📋 Next Steps:");
    console.log("  1. Run database migration: npm run db:push");
    console.log(
      "  2. Seed credit packs: tsx scripts/seed-credit-packs-generated.ts",
    );
    console.log("  3. Start dev server: npm run dev");
    console.log(
      "  4. Start Stripe webhooks: stripe listen --forward-to localhost:3000/api/stripe/webhook",
    );
    console.log("  5. Visit: http://localhost:3000/dashboard/billing");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { createStripeProducts, generateSeedScript, testAPIEndpoints };
