#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { db } from "@/db/client";
import { organizations } from "@/db/schemas/organizations";
import { users } from "@/db/schemas/users";
import { eq, and } from "drizzle-orm";
import { emailService } from "@/lib/services/email";

async function main() {
  console.log("=".repeat(70));
  console.log("AUTO TOP-UP EMAIL DEBUG - FINDING ROOT CAUSE");
  console.log("=".repeat(70));
  console.log("");

  console.log("[1] Finding organizations with auto top-up enabled...");
  const orgsWithAutoTopUp = await db
    .select()
    .from(organizations)
    .where(eq(organizations.auto_top_up_enabled, true))
    .limit(1);

  if (orgsWithAutoTopUp.length === 0) {
    console.log("❌ No organizations have auto top-up enabled");
    console.log("");
    console.log("Please enable auto top-up in Settings > Billing first");
    process.exit(1);
  }

  const org = orgsWithAutoTopUp[0];
  console.log(`✓ Found: ${org.name} (${org.id})`);
  console.log(`  Auto top-up enabled: ${org.auto_top_up_enabled}`);
  console.log(`  Auto top-up amount: $${org.auto_top_up_amount}`);
  console.log(`  Auto top-up threshold: $${org.auto_top_up_threshold}`);
  console.log(`  Current balance: $${org.credit_balance}`);
  console.log(`  Billing email: ${org.billing_email || "NOT SET"}`);
  console.log("");

  console.log("[2] Finding users in this organization...");
  const orgUsers = await db
    .select()
    .from(users)
    .where(eq(users.organization_id, org.id))
    .limit(5);

  console.log(`✓ Found ${orgUsers.length} user(s)`);
  orgUsers.forEach((user, i) => {
    console.log(`  User ${i + 1}: ${user.email || "NO EMAIL"}`);
  });
  console.log("");

  console.log("[3] Determining recipient email...");
  const recipientEmail = org.billing_email || (orgUsers.length > 0 ? orgUsers[0].email : null);
  console.log(`  Recipient: ${recipientEmail || "NONE - CANNOT SEND"}`);
  console.log("");

  if (!recipientEmail) {
    console.log("❌ NO EMAIL AVAILABLE");
    console.log("");
    console.log("Fix this by running:");
    console.log(`  npm run billing:set-email ${org.id} your-email@example.com`);
    process.exit(1);
  }

  console.log("[4] Checking email service configuration...");
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const hasSmtp = !!process.env.SMTP_HOST;
  console.log(`  SENDGRID_API_KEY: ${hasSendGrid ? "SET" : "NOT SET"}`);
  console.log(`  SMTP_HOST: ${hasSmtp ? "SET" : "NOT SET"}`);
  console.log(`  SENDGRID_FROM_EMAIL: ${process.env.SENDGRID_FROM_EMAIL || "NOT SET"}`);
  console.log("");

  if (!hasSendGrid && !hasSmtp) {
    console.log("❌ No email service configured");
    process.exit(1);
  }

  console.log("[5] Testing emailService.sendAutoTopUpSuccessEmail()...");
  console.log("");
  console.log("Calling emailService.sendAutoTopUpSuccessEmail with:");
  console.log(JSON.stringify({
    email: recipientEmail,
    organizationName: org.name,
    amount: 10.0,
    previousBalance: 3.5,
    newBalance: 13.5,
    paymentMethod: "Test Card ••••4242",
    billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  }, null, 2));
  console.log("");

  try {
    const result = await emailService.sendAutoTopUpSuccessEmail({
      email: recipientEmail,
      organizationName: org.name,
      amount: 10.0,
      previousBalance: 3.5,
      newBalance: 13.5,
      paymentMethod: "Test Card ••••4242",
      billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    });

    console.log("");
    console.log("=".repeat(70));
    if (result === true) {
      console.log("✅ SUCCESS - emailService returned true");
      console.log("");
      console.log(`Email should have been sent to: ${recipientEmail}`);
      console.log("Check your inbox and spam folder.");
    } else if (result === false) {
      console.log("❌ FAILED - emailService returned false");
      console.log("");
      console.log("This means the email service tried to send but failed.");
      console.log("Check the error logs above for details.");
    } else {
      console.log(`⚠️  UNEXPECTED RESULT: ${result}`);
    }
    console.log("=".repeat(70));
  } catch (error) {
    console.log("");
    console.log("=".repeat(70));
    console.log("❌ EXCEPTION THROWN - Code crashed");
    console.log("=".repeat(70));
    console.log("");
    console.log("Error:", error);
    console.log("");
    if (error instanceof Error) {
      console.log("Stack:", error.stack);
    }
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("");
    console.log("Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("Fatal error:", error);
    process.exit(1);
  });
