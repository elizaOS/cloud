#!/usr/bin/env bun
/**
 * Webhook Test Script
 *
 * Test a webhook endpoint manually with proper signature generation.
 *
 * Usage:
 *   bun run scripts/test-webhook.ts <webhook-key> <webhook-secret> [options]
 *
 * Options:
 *   --base-url <url>    Base URL (default: http://localhost:3000)
 *   --payload <json>    Custom JSON payload
 *   --no-signature      Skip signature generation
 *   --invalid-sig       Use an invalid signature
 *   --expired           Use an expired timestamp
 *   --health            Only check webhook health
 *   --full              Run full test suite
 *
 * Examples:
 *   bun run scripts/test-webhook.ts abc123 secret456
 *   bun run scripts/test-webhook.ts abc123 secret456 --payload '{"event":"test"}'
 *   bun run scripts/test-webhook.ts abc123 secret456 --health
 *   bun run scripts/test-webhook.ts abc123 secret456 --full
 */

import {
  WebhookTestClient,
  testWebhook,
  sendWebhook,
} from "../lib/utils/webhook-test-client";

// Parse arguments
const args = process.argv.slice(2);

if (args.length < 2 && !args.includes("--help") && !args.includes("-h")) {
  console.error(
    "❌ Missing required arguments: webhook-key and webhook-secret",
  );
  console.error(
    "   Usage: bun run scripts/test-webhook.ts <webhook-key> <webhook-secret> [options]",
  );
  console.error("   Use --help for more information");
  process.exit(1);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Webhook Test Script

Test a webhook endpoint manually with proper signature generation.

Usage:
  bun run scripts/test-webhook.ts <webhook-key> <webhook-secret> [options]

Arguments:
  webhook-key     The webhook trigger key
  webhook-secret  The webhook secret for signing requests

Options:
  --base-url <url>    Base URL (default: http://localhost:3000)
  --payload <json>    Custom JSON payload
  --no-signature      Skip signature generation
  --invalid-sig       Use an invalid signature
  --expired           Use an expired timestamp
  --health            Only check webhook health
  --full              Run full test suite
  --help, -h          Show this help message

Examples:
  # Basic test with default payload
  bun run scripts/test-webhook.ts abc123def456 secret789

  # Custom payload
  bun run scripts/test-webhook.ts abc123 secret456 --payload '{"event":"order.created","data":{"id":123}}'

  # Health check only
  bun run scripts/test-webhook.ts abc123 secret456 --health

  # Full test suite
  bun run scripts/test-webhook.ts abc123 secret456 --full

  # Test signature validation (expects 401)
  bun run scripts/test-webhook.ts abc123 secret456 --no-signature
  bun run scripts/test-webhook.ts abc123 secret456 --invalid-sig
  bun run scripts/test-webhook.ts abc123 secret456 --expired
  `);
  process.exit(0);
}

const webhookKey = args[0];
const webhookSecret = args[1];

// Parse options
const getOption = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
};

const hasFlag = (flag: string): boolean => args.includes(flag);

const baseUrl =
  getOption("--base-url") ||
  process.env.WEBHOOK_BASE_URL ||
  "http://localhost:3000";
const payloadStr = getOption("--payload");
const skipSignature = hasFlag("--no-signature");
const invalidSignature = hasFlag("--invalid-sig");
const expiredTimestamp = hasFlag("--expired");
const healthOnly = hasFlag("--health");
const fullTest = hasFlag("--full");

const config = {
  baseUrl,
  webhookKey,
  webhookSecret,
};

async function main() {
  console.log("\n🔗 Webhook Test");
  console.log("================");
  console.log(`URL: ${baseUrl}/api/v1/n8n/webhooks/${webhookKey}`);
  console.log(`Key: ${webhookKey.slice(0, 8)}...`);
  console.log("");

  if (healthOnly) {
    // Health check only
    console.log("🏥 Checking webhook health...\n");

    const client = new WebhookTestClient(config);
    const health = await client.health();

    if (health.success && health.active) {
      console.log("✅ Webhook is healthy and active");
      console.log(`   Requires Signature: ${health.requiresSignature}`);
      console.log(`   Status: ${health.status}`);
    } else {
      console.log("❌ Webhook is not available");
      console.log(`   Status: ${health.status}`);
    }

    return;
  }

  if (fullTest) {
    // Run full test suite
    console.log("🧪 Running full test suite...\n");

    const report = await testWebhook(config);

    console.log("Results:");
    console.log("--------");

    report.tests.forEach((test, i) => {
      const icon = test.passed ? "✅" : "❌";
      console.log(`${icon} ${i + 1}. ${test.name}`);
      if (!test.passed) {
        console.log(`      Details: ${JSON.stringify(test.details)}`);
      }
    });

    console.log("");
    console.log(`📊 Summary: ${report.passed} passed, ${report.failed} failed`);
    console.log(`⏱️  Duration: ${report.duration}ms`);

    process.exit(report.failed > 0 ? 1 : 0);
  }

  // Single request
  const payload = payloadStr
    ? JSON.parse(payloadStr)
    : { event: "test", timestamp: Date.now(), source: "test-script" };

  console.log("📤 Sending webhook request...\n");
  console.log(`Payload: ${JSON.stringify(payload, null, 2)}\n`);

  const options: Record<string, unknown> = {};
  if (skipSignature) {
    options.skipSignature = true;
    console.log("⚠️  Skipping signature (testing validation)\n");
  }
  if (invalidSignature) {
    options.invalidSignature = true;
    console.log("⚠️  Using invalid signature (testing rejection)\n");
  }
  if (expiredTimestamp) {
    options.expiredTimestamp = true;
    console.log("⚠️  Using expired timestamp (testing replay protection)\n");
  }

  const result = await sendWebhook(config, payload);

  console.log("Response:");
  console.log("---------");
  console.log(`Status: ${result.status}`);
  console.log(`Success: ${result.success}`);
  console.log(`Duration: ${result.duration}ms`);

  if (result.executionId) {
    console.log(`Execution ID: ${result.executionId}`);
    console.log(`Execution Status: ${result.executionStatus}`);
  }

  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  if (result.outputData) {
    console.log(`Output: ${JSON.stringify(result.outputData, null, 2)}`);
  }

  // Rate limit info
  const rateLimit =
    result.headers["x-ratelimit-limit"] || result.headers["X-RateLimit-Limit"];
  const remaining =
    result.headers["x-ratelimit-remaining"] ||
    result.headers["X-RateLimit-Remaining"];
  if (rateLimit) {
    console.log(`\nRate Limit: ${remaining}/${rateLimit} remaining`);
  }

  console.log("");

  if (result.success) {
    console.log("✅ Webhook triggered successfully!");
  } else if (skipSignature || invalidSignature || expiredTimestamp) {
    // Expected failure for signature tests
    if (result.status === 401) {
      console.log("✅ Correctly rejected (signature validation working)");
    } else {
      console.log(`❌ Unexpected status: ${result.status} (expected 401)`);
      process.exit(1);
    }
  } else {
    console.log("❌ Webhook request failed");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
