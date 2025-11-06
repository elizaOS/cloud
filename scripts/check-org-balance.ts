#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { db } from "@/db/client";
import { organizations } from "@/db/schemas/organizations";
import { eq } from "drizzle-orm";

const orgId = "67e22ff7-257b-41a3-8773-513a4674d1bb";

async function main() {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    console.error("Organization not found");
    process.exit(1);
  }

  const balance = Number(org.credit_balance);
  const threshold = Number(org.auto_top_up_threshold);

  console.log("Organization:", org.name);
  console.log("Current balance:", balance);
  console.log("Auto top-up enabled:", org.auto_top_up_enabled);
  console.log("Auto top-up amount:", org.auto_top_up_amount);
  console.log("Auto top-up threshold:", threshold);
  console.log("Billing email:", org.billing_email || "NOT SET");
  console.log("");
  console.log("Balance below threshold?", balance < threshold);
  console.log("");

  if (balance >= threshold) {
    console.log(`❌ Auto top-up will NOT trigger because balance ($${balance}) >= threshold ($${threshold})`);
    console.log("");
    console.log(`You need to spend $${(balance - threshold + 0.01).toFixed(2)} to trigger auto top-up`);
  } else {
    console.log(`✓ Balance is below threshold - auto top-up should trigger`);
  }
}

main();
