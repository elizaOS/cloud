#!/usr/bin/env bun
/**
 * Verify and Confirm Crypto Payment
 *
 * This script manually checks a crypto payment status with OxaPay
 * and confirms it if the payment was completed.
 *
 * Usage: bun run scripts/verify-crypto-payment.ts <trackId>
 * Example: bun run scripts/verify-crypto-payment.ts 159363568
 */

import { cryptoPaymentsRepository } from "@/db/repositories/crypto-payments";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { oxaPayService } from "@/lib/services/oxapay";

async function main() {
  const trackId = process.argv[2];

  if (!trackId) {
    console.error("Usage: bun run scripts/verify-crypto-payment.ts <trackId>");
    console.error(
      "Example: bun run scripts/verify-crypto-payment.ts 159363568"
    );
    process.exit(1);
  }

  console.log(`\n🔍 Looking up payment with trackId: ${trackId}\n`);

  // Find payment by track ID
  const payment = await cryptoPaymentsRepository.findByTrackId(trackId);

  if (!payment) {
    console.error(`❌ No payment found for trackId: ${trackId}`);
    console.log("\nTrying to check OxaPay status directly...\n");

    const oxaStatus = await oxaPayService.getPaymentStatus(trackId);
    console.log("OxaPay Status:", JSON.stringify(oxaStatus, null, 2));
    process.exit(1);
  }

  console.log("📋 Payment found in database:");
  console.log(`   ID: ${payment.id}`);
  console.log(`   Status: ${payment.status}`);
  console.log(`   Expected Amount: $${payment.expected_amount}`);
  console.log(`   Credits to Add: ${payment.credits_to_add}`);
  console.log(`   Organization: ${payment.organization_id}`);
  console.log(`   Created: ${payment.created_at}`);
  console.log(`   Expires: ${payment.expires_at}`);
  console.log();

  if (payment.status === "confirmed") {
    console.log(
      "✅ Payment already confirmed! Credits should have been added."
    );
    process.exit(0);
  }

  if (payment.status === "expired") {
    console.log("⏰ Payment has expired.");
    process.exit(1);
  }

  if (payment.status === "failed") {
    console.log("❌ Payment has failed.");
    process.exit(1);
  }

  // Check with OxaPay
  console.log("🌐 Checking payment status with OxaPay...\n");
  const oxaStatus = await oxaPayService.getPaymentStatus(trackId);

  console.log("OxaPay Response:");
  console.log(`   Status: ${oxaStatus.status}`);
  console.log(`   Amount: ${oxaStatus.amount} ${oxaStatus.currency}`);
  console.log(`   Transactions: ${oxaStatus.transactions.length}`);

  if (oxaStatus.transactions.length > 0) {
    console.log("\n📝 Transaction Details:");
    for (const tx of oxaStatus.transactions) {
      console.log(`   - TxHash: ${tx.txHash}`);
      console.log(`     Amount: ${tx.amount} ${tx.currency}`);
      console.log(`     Network: ${tx.network}`);
      console.log(`     Confirmations: ${tx.confirmations}`);
    }
  }

  console.log();

  if (oxaPayService.isPaymentConfirmed(oxaStatus.status)) {
    console.log("✅ OxaPay confirms payment is PAID!\n");
    console.log("🔄 Attempting to confirm payment and add credits...\n");

    const result = await cryptoPaymentsService.checkAndConfirmPayment(
      payment.id
    );

    if (result.confirmed) {
      console.log("🎉 SUCCESS! Payment confirmed and credits added!");
      console.log(`   Credits Added: ${result.payment.creditsToAdd}`);
      console.log(`   Transaction Hash: ${result.payment.transactionHash}`);
    } else {
      console.log("⚠️ Payment not confirmed yet.");
      console.log(`   Current Status: ${result.payment.status}`);
    }
  } else if (oxaPayService.isPaymentPending(oxaStatus.status)) {
    console.log("⏳ Payment is PENDING - waiting for blockchain confirmation.");
    console.log(`   Status: ${oxaStatus.status}`);
  } else if (oxaPayService.isPaymentExpired(oxaStatus.status)) {
    console.log("⏰ Payment has EXPIRED on OxaPay side.");
  } else {
    console.log(`❓ Unknown payment status: ${oxaStatus.status}`);
  }

  console.log();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
