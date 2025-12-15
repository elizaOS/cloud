/**
 * Script to clear Stripe customer IDs from organizations
 * Use this when migrating to a new Stripe account
 *
 * Usage:
 *   List all orgs with Stripe customer IDs:
 *     DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs --list
 *
 *   Clear a specific org:
 *     DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs <org_id>
 *
 *   Clear ALL orgs (for migration to new Stripe account):
 *     DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs --all
 *
 *   Dry run (see what would be cleared):
 *     DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs --all --dry-run
 */

import pg from "pg";
import "dotenv/config";

const { Client } = pg;

async function main() {
  const args = process.argv.slice(2);
  const isListMode = args.includes("--list");
  const isClearAllMode = args.includes("--all");
  const isDryRun = args.includes("--dry-run");
  const orgId = args.find((arg) => !arg.startsWith("--"));

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set!");
    console.log("\nUsage:");
    console.log(
      '  List:     DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs --list',
    );
    console.log(
      '  One org:  DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs <org_id>',
    );
    console.log(
      '  All orgs: DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs --all',
    );
    console.log(
      '  Dry run:  DATABASE_URL="your_prod_url" bun scripts/clear-stripe-customer.mjs --all --dry-run',
    );
    process.exit(1);
  }

  if (!isListMode && !isClearAllMode && !orgId) {
    console.error("❌ Please provide an org_id, --list, or --all flag!");
    console.log("\nUsage:");
    console.log("  --list              List all orgs with Stripe customer IDs");
    console.log("  <org_id>            Clear a specific org");
    console.log(
      "  --all               Clear ALL orgs (migration to new Stripe account)",
    );
    console.log("  --all --dry-run     See what would be cleared");
    process.exit(1);
  }

  // Show which database we're connecting to (hide credentials)
  const dbHost = databaseUrl.includes("localhost")
    ? "localhost (local)"
    : databaseUrl.split("@")[1]?.split("/")[0] || "unknown";

  console.log(`\n🔗 Connecting to: ${dbHost}`);
  if (isDryRun) console.log("🔍 DRY RUN MODE - No changes will be made");
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    if (isListMode) {
      // List all orgs with stripe customer IDs
      const result = await client.query(`
        SELECT id, name, stripe_customer_id, stripe_default_payment_method, created_at
        FROM organizations 
        WHERE stripe_customer_id IS NOT NULL
        ORDER BY created_at DESC
      `);

      if (result.rows.length === 0) {
        console.log(
          "✅ No organizations have Stripe customer IDs set. Ready for new Stripe account!",
        );
      } else {
        console.log(
          `📋 Found ${result.rows.length} organization(s) with Stripe customer IDs:\n`,
        );
        result.rows.forEach((row, i) => {
          console.log(`${i + 1}. ${row.name}`);
          console.log(`   ID: ${row.id}`);
          console.log(`   Stripe Customer: ${row.stripe_customer_id}`);
          console.log(
            `   Default Payment: ${row.stripe_default_payment_method || "(none)"}`,
          );
          console.log(`   Created: ${row.created_at}`);
          console.log("");
        });
        console.log(
          "⚠️  These customer IDs may not exist in your new Stripe account!",
        );
        console.log(
          "   Run with --all flag to clear them, or specify an org_id.",
        );
      }
    } else if (isClearAllMode) {
      // Clear ALL stripe customer IDs
      console.log("🔄 Clearing Stripe customer IDs for ALL organizations...\n");

      // First show what will be affected
      const preview = await client.query(`
        SELECT id, name, stripe_customer_id
        FROM organizations 
        WHERE stripe_customer_id IS NOT NULL
      `);

      if (preview.rows.length === 0) {
        console.log("✅ No organizations have Stripe customer IDs to clear!");
        await client.end();
        return;
      }

      console.log(`Will clear ${preview.rows.length} organization(s):`);
      preview.rows.forEach((row) => {
        console.log(`  - ${row.name} (${row.stripe_customer_id})`);
      });
      console.log("");

      if (isDryRun) {
        console.log("🔍 DRY RUN - No changes made.");
        console.log(
          "   Run without --dry-run to actually clear these records.",
        );
      } else {
        const result = await client.query(`
          UPDATE organizations 
          SET 
            stripe_customer_id = NULL,
            stripe_default_payment_method = NULL,
            stripe_payment_method_id = NULL,
            updated_at = NOW()
          WHERE stripe_customer_id IS NOT NULL
          RETURNING id, name
        `);

        console.log(
          `✅ Successfully cleared Stripe data for ${result.rows.length} organization(s)!`,
        );
        console.log(
          "\n   New customers will be created when they make purchases",
        );
        console.log("   with your new Stripe account.");
      }
    } else if (orgId) {
      // Clear specific org
      console.log(`🎯 Clearing Stripe customer ID for org: ${orgId}\n`);

      // First show current values
      const current = await client.query(
        `
        SELECT id, name, stripe_customer_id, stripe_default_payment_method
        FROM organizations 
        WHERE id = $1
      `,
        [orgId],
      );

      if (current.rows.length === 0) {
        console.log("❌ Organization not found with ID:", orgId);
        await client.end();
        process.exit(1);
      }

      console.log("📋 Current values:");
      console.log("   Name:", current.rows[0].name);
      console.log(
        "   stripe_customer_id:",
        current.rows[0].stripe_customer_id || "(null)",
      );
      console.log(
        "   stripe_default_payment_method:",
        current.rows[0].stripe_default_payment_method || "(null)",
      );
      console.log("");

      if (!current.rows[0].stripe_customer_id) {
        console.log("✅ Organization already has no Stripe customer ID!");
        await client.end();
        return;
      }

      if (isDryRun) {
        console.log("🔍 DRY RUN - No changes made.");
      } else {
        const result = await client.query(
          `
          UPDATE organizations 
          SET 
            stripe_customer_id = NULL,
            stripe_default_payment_method = NULL,
            stripe_payment_method_id = NULL,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, stripe_customer_id
        `,
          [orgId],
        );

        console.log("✅ Successfully cleared Stripe customer ID!");
        console.log("   Organization:", result.rows[0].name);
        console.log(
          "   New stripe_customer_id:",
          result.rows[0].stripe_customer_id || "(null)",
        );
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
