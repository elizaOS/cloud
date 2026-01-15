#!/usr/bin/env bun
/**
 * Local Cron Emulator
 * 
 * Simulates Vercel's cron service locally for testing scheduled workflows.
 * Run with: bun run scripts/local-cron.ts
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const INTERVAL_MS = 60_000; // 1 minute

async function runCron() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] 🕐 Running workflow cron check...`);
  
  const response = await fetch(`${BASE_URL}/api/cron/workflows`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`❌ Cron check failed: ${response.status} ${response.statusText}`);
    return;
  }

  const result = await response.json();
  
  if (result.executed === 0) {
    console.log("✅ No workflows scheduled for this minute");
  } else {
    console.log(`✅ Executed ${result.executed} workflow(s):`);
    for (const run of result.runs) {
      const status = run.success ? "✅" : "❌";
      console.log(`   ${status} ${run.workflowName} (${run.workflowId})`);
      if (run.error) {
        console.log(`      Error: ${run.error}`);
      }
    }
  }
}

console.log("🚀 Local Cron Emulator Started");
console.log(`   Base URL: ${BASE_URL}`);
console.log(`   Interval: Every ${INTERVAL_MS / 1000} seconds`);
console.log(`   Press Ctrl+C to stop\n`);

// Run immediately on start
runCron();

// Then run every minute
setInterval(runCron, INTERVAL_MS);
