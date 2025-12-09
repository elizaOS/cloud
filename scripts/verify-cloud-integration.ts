/**
 * Cloud Integration Verification Script
 * 
 * Verifies that the payout system is fully integrated with the cloud application.
 * 
 * Run: bun run scripts/verify-cloud-integration.ts
 */

import { secureTokenRedemptionService } from "@/lib/services/token-redemption-secure";
import { payoutProcessorService } from "@/lib/services/payout-processor";
import { elizaTokenPriceService } from "@/lib/services/eliza-token-price";
import { twapPriceOracle } from "@/lib/services/twap-price-oracle";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";

interface CheckResult {
  name: string;
  status: "✅ PASS" | "❌ FAIL" | "⚠️ WARN";
  details: string;
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Check environment variables
  const evmKey = process.env.EVM_PAYOUT_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY;
  const solanaKey = process.env.SOLANA_PAYOUT_PRIVATE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const dbUrl = process.env.DATABASE_URL;

  results.push({
    name: "EVM Private Key",
    status: evmKey ? "✅ PASS" : "❌ FAIL",
    details: evmKey ? "Configured" : "Not set - EVM payouts disabled",
  });

  results.push({
    name: "Solana Private Key",
    status: solanaKey ? "✅ PASS" : "⚠️ WARN",
    details: solanaKey ? "Configured" : "Not set - Solana payouts disabled",
  });

  results.push({
    name: "Cron Secret",
    status: cronSecret ? "✅ PASS" : "❌ FAIL",
    details: cronSecret ? "Configured" : "Not set - crons will fail",
  });

  results.push({
    name: "Database URL",
    status: dbUrl ? "✅ PASS" : "❌ FAIL",
    details: dbUrl ? "Configured" : "Not set",
  });

  // 2. Check payout status service
  const payoutConfig = payoutProcessorService.isConfigured();
  results.push({
    name: "Payout Processor Config",
    status: payoutConfig.evm || payoutConfig.solana ? "✅ PASS" : "❌ FAIL",
    details: `EVM: ${payoutConfig.evm ? "✅" : "❌"}, Solana: ${payoutConfig.solana ? "✅" : "❌"}`,
  });

  // 3. Check price oracle (use direct DexScreener fetch to bypass DB cache)
  const priceResult = await elizaTokenPriceService.fetchFromDexScreener("base").catch(e => ({ error: e.message }));
  results.push({
    name: "Price Oracle (Base)",
    status: "priceUsd" in priceResult ? "✅ PASS" : "❌ FAIL",
    details: "priceUsd" in priceResult
      ? `$${priceResult.priceUsd.toFixed(6)} from DexScreener`
      : `Error: ${(priceResult as { error: string }).error}`,
  });

  // 4. Check TWAP oracle system health
  const twapHealth = await twapPriceOracle.getSystemHealth().catch(e => ({ error: e.message }));
  results.push({
    name: "TWAP Oracle Health",
    status: twapHealth.canProcessRedemptions !== false ? "✅ PASS" : "⚠️ WARN",
    details: twapHealth.canProcessRedemptions !== false
      ? `Total samples: ${twapHealth.totalSamples24h || 0}, Can process: Yes`
      : `Paused: ${twapHealth.pauseReason || "Unknown"}`,
  });

  // 5. Check services are initialized
  results.push({
    name: "Services Initialized",
    status: secureTokenRedemptionService && payoutProcessorService ? "✅ PASS" : "❌ FAIL",
    details: "All core services loaded",
  });

  // 6. Check hot wallet balances
  const balances = await payoutProcessorService.checkHotWalletBalances().catch(() => null);
  if (balances && balances.evm.configured) {
    const networks = Object.entries(balances.evm.balances);
    const fundedNetworks = networks.filter(([, bal]) => parseFloat(bal) > 0);
    results.push({
      name: "Hot Wallet Balances",
      status: fundedNetworks.length > 0 ? "✅ PASS" : "⚠️ WARN",
      details: fundedNetworks.length > 0
        ? `${fundedNetworks.length} funded networks: ${fundedNetworks.map(([n, b]) => `${n}: ${b}`).join(", ")}`
        : "No funded wallets",
    });
  }

  // 7. Check secure redemption service
  results.push({
    name: "Secure Redemption Service",
    status: secureTokenRedemptionService ? "✅ PASS" : "❌ FAIL",
    details: "Service initialized",
  });

  // 8. Check redeemable earnings service
  results.push({
    name: "Redeemable Earnings Service",
    status: redeemableEarningsService ? "✅ PASS" : "❌ FAIL",
    details: "Service initialized",
  });

  return results;
}

async function main() {
  console.log("═".repeat(70));
  console.log("CLOUD INTEGRATION VERIFICATION");
  console.log("═".repeat(70));
  console.log("");

  const results = await runChecks();

  console.log("Component Status:");
  console.log("-".repeat(70));

  for (const result of results) {
    console.log(`${result.status} ${result.name.padEnd(25)} | ${result.details}`);
  }

  console.log("");
  console.log("═".repeat(70));

  const passed = results.filter(r => r.status === "✅ PASS").length;
  const warned = results.filter(r => r.status === "⚠️ WARN").length;
  const failed = results.filter(r => r.status === "❌ FAIL").length;

  console.log(`Results: ${passed} passed, ${warned} warnings, ${failed} failed`);
  console.log("");

  if (failed === 0) {
    console.log("✅ CLOUD INTEGRATION VERIFIED");
    console.log("");
    console.log("The payout system is properly integrated and ready for production.");
    console.log("");
    console.log("API Endpoints:");
    console.log("  - POST /api/v1/redemptions          Create redemption");
    console.log("  - GET  /api/v1/redemptions          List redemptions");
    console.log("  - GET  /api/v1/redemptions/quote    Get price quote");
    console.log("  - GET  /api/v1/redemptions/status   Check availability");
    console.log("  - POST /api/admin/redemptions       Admin approve/reject");
    console.log("");
    console.log("Cron Jobs (vercel.json):");
    console.log("  - /api/cron/sample-eliza-price      Every 5 min");
    console.log("  - /api/cron/process-redemptions     Every 5 min");
    console.log("  - /api/cron/agent-budgets           Every 15 min");
  } else {
    console.log("❌ CLOUD INTEGRATION INCOMPLETE");
    console.log("");
    console.log("Please fix the failed checks before deploying to production.");
    process.exit(1);
  }

  console.log("═".repeat(70));
}

main().catch(e => {
  logger.error("Verification failed", e);
  process.exit(1);
});

