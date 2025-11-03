#!/usr/bin/env tsx

import {
  canSendLowCreditsEmail,
  markLowCreditsEmailSent,
} from "@/lib/email/utils/rate-limiter";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function test() {
  const testOrgId = `test-org-${Date.now()}`;

  console.log("Testing rate limiter...");

  const canSend1 = await canSendLowCreditsEmail(testOrgId);
  console.log("✅ First check (should be true):", canSend1);

  await markLowCreditsEmailSent(testOrgId);
  console.log("✅ Marked email as sent");

  const canSend2 = await canSendLowCreditsEmail(testOrgId);
  console.log("✅ Second check (should be false):", canSend2);

  if (!canSend1 || canSend2) {
    console.error("❌ Rate limiter not working as expected");
    process.exit(1);
  }

  console.log("✅ Rate limiter working correctly!");
  process.exit(0);
}

test().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
