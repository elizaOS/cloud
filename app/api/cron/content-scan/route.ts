/**
 * Content Scan Cron
 * GET: Daily (4 AM UTC) - incremental scan
 * POST: Monthly (1st, 3 AM UTC) - deep AI scan
 */

import { NextRequest, NextResponse } from "next/server";
import {
  domainContentModerationService,
  type DomainScanResult,
} from "@/lib/services/domain-content-moderation";
import { suspensionNotificationService } from "@/lib/services/suspension-notification";
import {
  verifyCronSecret,
  CRON_MAX_RUNTIME_MS,
  acquireLock,
  releaseLock,
} from "@/lib/utils/cron";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";

const BATCH_SIZE = 10;

interface Stats {
  checked: number;
  skipped: number;
  clean: number;
  flagged: number;
  suspended: number;
  notified: number;
  errors: number;
  timedOut: boolean;
  aiScans: number;
}

async function processResult(
  domainId: string,
  result: DomainScanResult,
  stats: Stats,
) {
  if (result.cached) {
    stats.skipped++;
    return;
  }

  stats.checked++;
  if (result.aiUsed) stats.aiScans++;

  if (result.status === "clean") stats.clean++;
  else if (result.status === "suspended") {
    stats.suspended++;
    const notify = await suspensionNotificationService.suspendAndNotify(
      domainId,
      result.reasoning || "Content violation",
      result.flags,
    );
    if (notify.notified) stats.notified++;
  } else stats.flagged++;
}

async function runScan(
  jobName: string,
  deepScan: boolean,
): Promise<{ stats: Stats; duration: number } | { error: string }> {
  if (!acquireLock(jobName)) {
    logger.warn("[Cron] Job already running", { job: jobName });
    return { error: "already_running" };
  }

  const start = Date.now();
  const stats: Stats = {
    checked: 0,
    skipped: 0,
    clean: 0,
    flagged: 0,
    suspended: 0,
    notified: 0,
    errors: 0,
    timedOut: false,
    aiScans: 0,
  };

  try {
    const domains = deepScan
      ? await domainContentModerationService.getDomainsNeedingAiScan(30)
      : await domainContentModerationService.getDomainsNeedingScan(24);

    for (let i = 0; i < domains.length; i += BATCH_SIZE) {
      if (Date.now() - start > CRON_MAX_RUNTIME_MS) {
        stats.timedOut = true;
        logger.warn("[Cron] Timeout", {
          processed: stats.checked + stats.skipped,
          remaining: domains.length - i,
        });
        break;
      }

      await Promise.all(
        domains.slice(i, i + BATCH_SIZE).map(async (d) => {
          try {
            const result = await domainContentModerationService.scanDomain(
              d.id,
              { deepScan, force: deepScan },
            );
            await processResult(d.id, result, stats);
          } catch (e) {
            stats.errors++;
            logger.error("[Cron] Scan failed", {
              domain: d.domain,
              error: extractErrorMessage(e),
            });
          }
        }),
      );
    }

    return { stats, duration: Date.now() - start };
  } finally {
    releaseLock(jobName);
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  logger.info("[Cron] Daily content scan");
  const result = await runScan("daily-content-scan", false);

  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 409 },
    );
  }

  logger.info("[Cron] Complete", result.stats);
  return NextResponse.json({
    success: true,
    job: "daily-scan",
    ...result,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  logger.info("[Cron] Monthly deep scan");
  const result = await runScan("monthly-deep-scan", true);

  if ("error" in result) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 409 },
    );
  }

  logger.info("[Cron] Complete", result.stats);
  return NextResponse.json({
    success: true,
    job: "monthly-deep-scan",
    ...result,
    timestamp: new Date().toISOString(),
  });
}
