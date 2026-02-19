#!/usr/bin/env bun
/**
 * One-time backfill script for engagement metrics.
 *
 * Computes daily_metrics and retention_cohorts for the past N days
 * (default 90) so the admin dashboard has historical data on launch.
 *
 * Usage:
 *   bun run scripts/backfill-metrics.ts           # backfill 90 days
 *   bun run scripts/backfill-metrics.ts 30         # backfill 30 days
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { userMetricsService } from "@/lib/services/user-metrics";

const DAYS = parseInt(process.argv[2] || "90", 10);

async function main() {
  console.log(`Backfilling engagement metrics for the past ${DAYS} days...`);
  const startTime = Date.now();
  let failures = 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = DAYS; i >= 1; i--) {
    const date = new Date(today.getTime() - i * 86_400_000);
    const label = date.toISOString().split("T")[0];

    try {
      await userMetricsService.computeDailyMetrics(date);
      await userMetricsService.computeRetentionCohorts(date);
      console.log(`  [OK] ${label}`);
    } catch (error) {
      failures++;
      console.error(
        `  [FAIL] ${label}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s (${failures} failures)`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
