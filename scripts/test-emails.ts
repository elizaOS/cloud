#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";

// CRITICAL: Load environment variables BEFORE importing emailService
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Now import after env vars are loaded
import { emailService } from "@/lib/services/email";

const command = process.argv[2];
const email = process.argv[3];

if (!email || !command) {
  console.error(
    "Usage: tsx scripts/test-emails.ts [welcome|low-credits] <email>",
  );
  console.error("");
  console.error("Examples:");
  console.error("  tsx scripts/test-emails.ts welcome test@example.com");
  console.error("  tsx scripts/test-emails.ts low-credits billing@example.com");
  process.exit(1);
}

if (!process.env.SENDGRID_API_KEY) {
  console.error("❌ Error: SENDGRID_API_KEY not found in environment");
  console.error("Please set it in .env.local");
  process.exit(1);
}

async function main() {
  console.log(`📧 Sending ${command} email to ${email}...`);
  console.log("");

  let result = false;

  if (command === "welcome") {
    result = await emailService.sendWelcomeEmail({
      email,
      userName: "Test User",
      organizationName: "Test Organization",
      creditBalance: 5.0,
      dashboardUrl: process.env.NEXT_PUBLIC_APP_URL + "/dashboard",
    });
  } else if (command === "low-credits") {
    result = await emailService.sendLowCreditsEmail({
      email,
      organizationName: "Test Organization",
      currentBalance: 0.5,
      threshold: 1.0,
      billingUrl: process.env.NEXT_PUBLIC_APP_URL + "/dashboard/billing",
    });
  } else {
    console.error(
      '❌ Invalid command. Use "welcome" or "low-credits"',
    );
    process.exit(1);
  }

  if (result) {
    console.log("✅ Email sent successfully!");
    console.log("");
    console.log("Please check your inbox (and spam folder) for the email.");
  } else {
    console.log("❌ Email failed to send.");
    console.log("");
    console.log("Check the logs above for error details.");
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
