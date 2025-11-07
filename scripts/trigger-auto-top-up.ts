import "dotenv/config";

const CRON_SECRET = process.env.CRON_SECRET;
const API_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function triggerAutoTopUp() {
  if (!CRON_SECRET) {
    console.error("❌ CRON_SECRET not configured in .env.local");
    console.error("   Add: CRON_SECRET='your-secure-random-secret-here'");
    process.exit(1);
  }

  console.log("🔄 Triggering auto top-up check...");
  console.log(`   URL: ${API_URL}/api/cron/auto-top-up`);
  console.log("");

  try {
    const response = await fetch(`${API_URL}/api/cron/auto-top-up`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Auto top-up check completed successfully\n");
      console.log("📊 Statistics:");
      console.log(`   Timestamp: ${data.stats.timestamp}`);
      console.log(`   Duration: ${data.stats.duration}`);
      console.log(
        `   Organizations Checked: ${data.stats.organizationsChecked}`,
      );
      console.log(
        `   Organizations Processed: ${data.stats.organizationsProcessed}`,
      );
      console.log(`   Successful: ${data.stats.successful}`);
      console.log(`   Failed: ${data.stats.failed}`);

      if (data.stats.details && data.stats.details.length > 0) {
        console.log("\n📋 Details:");
        data.stats.details.forEach(
          (
            detail: {
              organizationId: string;
              success: boolean;
              amount?: number;
              newBalance?: number;
              error?: string;
            },
            index: number,
          ) => {
            console.log(`   ${index + 1}. Org: ${detail.organizationId}`);
            console.log(`      Success: ${detail.success}`);
            if (detail.amount)
              console.log(`      Amount: $${detail.amount.toFixed(2)}`);
            if (detail.newBalance)
              console.log(
                `      New Balance: $${detail.newBalance.toFixed(2)}`,
              );
            if (detail.error) console.log(`      Error: ${detail.error}`);
          },
        );
      }

      process.exit(0);
    } else {
      console.error("❌ Auto top-up check failed");
      console.error(`   Status: ${response.status}`);
      console.error(`   Error: ${JSON.stringify(data, null, 2)}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error triggering auto top-up:", error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
    }
    process.exit(1);
  }
}

triggerAutoTopUp();
