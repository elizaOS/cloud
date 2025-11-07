#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { emailService } from "@/lib/services/email";
import { organizationsRepository, usersRepository } from "@/db/repositories";

const orgId = process.argv[2];

if (!orgId) {
  console.error("Usage: tsx scripts/test-auto-top-up-email.ts <org-id>");
  console.error("");
  console.error("Example:");
  console.error(
    "  tsx scripts/test-auto-top-up-email.ts 67e22ff7-257b-41a3-8773-513a4674d1bb",
  );
  process.exit(1);
}

async function main() {
  console.log("=".repeat(60));
  console.log("AUTO TOP-UP EMAIL TEST");
  console.log("=".repeat(60));
  console.log("");

  console.log("Step 1: Loading organization...");
  const org = await organizationsRepository.findById(orgId);
  if (!org) {
    console.error(`❌ Organization ${orgId} not found`);
    process.exit(1);
  }
  console.log(`✓ Organization: ${org.name}`);
  console.log(`  Billing email: ${org.billing_email || "NOT SET"}`);
  console.log("");

  console.log("Step 2: Getting user email as fallback...");
  const users = await usersRepository.listByOrganization(orgId);
  const userEmail = users.length > 0 && users[0].email ? users[0].email : null;
  console.log(`  Users found: ${users.length}`);
  console.log(`  First user email: ${userEmail || "NOT SET"}`);
  console.log("");

  const recipientEmail = org.billing_email || userEmail;
  console.log("Step 3: Determining recipient...");
  console.log(`  Recipient email: ${recipientEmail || "NONE - WILL FAIL"}`);
  console.log("");

  if (!recipientEmail) {
    console.error("❌ No email found. Cannot send email.");
    console.error("");
    console.error("Fix: Run this command to set billing email:");
    console.error(
      `  npm run billing:set-email ${orgId} your-email@example.com`,
    );
    process.exit(1);
  }

  console.log("Step 4: Checking email service configuration...");
  if (!process.env.SENDGRID_API_KEY && !process.env.SMTP_HOST) {
    console.error("❌ No email service configured");
    console.error("  SENDGRID_API_KEY: NOT SET");
    console.error("  SMTP_HOST: NOT SET");
    process.exit(1);
  }
  console.log("✓ Email service configured");
  console.log("");

  console.log("Step 5: Sending auto top-up success email...");
  console.log(`  To: ${recipientEmail}`);
  console.log(`  Organization: ${org.name}`);
  console.log("");

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://eliza.cloud";
    const testPaymentIntentId = "pi_test_123456789";

    const result = await emailService.sendAutoTopUpSuccessEmail({
      email: recipientEmail,
      organizationName: org.name,
      amount: 10.0,
      previousBalance: 3.5,
      newBalance: 13.5,
      paymentMethod: "Test Card ••••4242",
      invoiceUrl: `${appUrl}/dashboard/invoices/${testPaymentIntentId}`,
      billingUrl: `${appUrl}/dashboard/settings`,
    });

    console.log("");
    console.log("=".repeat(60));
    if (result) {
      console.log("✅ EMAIL SENT SUCCESSFULLY");
      console.log("");
      console.log("Check your inbox (and spam folder) at:");
      console.log(`  ${recipientEmail}`);
    } else {
      console.log("❌ EMAIL FAILED TO SEND");
      console.log("");
      console.log("The emailService.send() method returned false.");
      console.log("Check the logs above for error details.");
    }
    console.log("=".repeat(60));
  } catch (error) {
    console.error("");
    console.error("=".repeat(60));
    console.error("❌ EXCEPTION THROWN");
    console.error("=".repeat(60));
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
