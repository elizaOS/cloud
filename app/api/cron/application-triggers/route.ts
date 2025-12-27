/**
 * Cron Job: Application Triggers
 *
 * Processes scheduled (cron) triggers for apps, agents, and MCPs.
 * Runs every minute to check for triggers that need to be executed.
 *
 * Schedule: Every minute (* * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { applicationTriggersService } from "@/lib/services/application-triggers";
import { logger } from "@/lib/utils/logger";

const CRON_SECRET = process.env.CRON_SECRET;

// =============================================================================
// AUTH
// =============================================================================

function verifyCronSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    logger.warn("[App Triggers Cron] CRON_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  try {
    const secretBuffer = Buffer.from(CRON_SECRET, "utf-8");
    const providedBuffer = Buffer.from(providedSecret, "utf-8");

    if (secretBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(secretBuffer, providedBuffer);
  } catch {
    return false;
  }
}

// =============================================================================
// CRON EXPRESSION MATCHER
// =============================================================================

function shouldExecuteCron(
  cronExpression: string,
  lastExecutedAt: Date | null,
): boolean {
  try {
    const now = new Date();
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length !== 5) {
      logger.warn(
        `[App Triggers Cron] Invalid cron expression (need 5 parts): ${cronExpression}`,
      );
      return false;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentDayOfWeek = now.getDay();

    const matches = (pattern: string, value: number): boolean => {
      if (pattern === "*") return true;

      if (pattern.includes("/")) {
        const [base, stepStr] = pattern.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) return false;

        if (base === "*") return value % step === 0;
        if (base.includes("-")) {
          const [startStr, endStr] = base.split("-");
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (value < start || value > end) return false;
          return (value - start) % step === 0;
        }
        return false;
      }

      if (pattern.includes(",")) {
        return pattern.split(",").some((p) => matches(p.trim(), value));
      }

      if (pattern.includes("-")) {
        const [startStr, endStr] = pattern.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        return value >= start && value <= end;
      }

      return parseInt(pattern, 10) === value;
    };

    const allMatch =
      matches(minute, currentMinute) &&
      matches(hour, currentHour) &&
      matches(dayOfMonth, currentDay) &&
      matches(month, currentMonth) &&
      matches(dayOfWeek, currentDayOfWeek);

    if (!lastExecutedAt) return allMatch;

    const timeSinceLastExecution = now.getTime() - lastExecutedAt.getTime();
    const oneMinute = 60 * 1000;

    return timeSinceLastExecution >= oneMinute && allMatch;
  } catch (error) {
    logger.error(
      `[App Triggers Cron] Invalid cron expression: ${cronExpression}`,
      error,
    );
    return false;
  }
}

// =============================================================================
// POST /api/cron/application-triggers
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    logger.info("[App Triggers Cron] Starting trigger processing");

    const triggers = await applicationTriggersService.getActiveCronTriggers();
    logger.info(
      `[App Triggers Cron] Found ${triggers.length} active cron triggers`,
    );

    const results = {
      processed: 0,
      executed: 0,
      errors: 0,
      skipped: 0,
    };

    for (const trigger of triggers) {
      try {
        const cronExpression = trigger.config.cronExpression;
        if (!cronExpression) {
          logger.warn(
            `[App Triggers Cron] Trigger ${trigger.id} missing cronExpression`,
          );
          results.skipped++;
          continue;
        }

        const lastExecutedAt = trigger.last_executed_at
          ? new Date(trigger.last_executed_at)
          : null;

        if (shouldExecuteCron(cronExpression, lastExecutedAt)) {
          logger.info(
            `[App Triggers Cron] Executing trigger ${trigger.id} (${trigger.name})`,
          );

          await applicationTriggersService.executeTrigger(
            trigger.id,
            trigger.config.inputData as Record<string, unknown>,
            "scheduled",
          );

          results.executed++;
        } else {
          results.skipped++;
        }

        results.processed++;
      } catch (error) {
        logger.error(
          `[App Triggers Cron] Error processing trigger ${trigger.id}:`,
          error,
        );
        results.errors++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info("[App Triggers Cron] Completed", {
      duration,
      ...results,
    });

    return NextResponse.json({
      success: true,
      duration,
      results,
    });
  } catch (error) {
    logger.error("[App Triggers Cron] Failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// =============================================================================
// GET /api/cron/application-triggers
// =============================================================================

export async function GET(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const triggers = await applicationTriggersService.getActiveCronTriggers();

    return NextResponse.json({
      success: true,
      activeTriggers: triggers.length,
      triggers: triggers.map((t) => ({
        id: t.id,
        name: t.name,
        targetType: t.target_type,
        targetId: t.target_id,
        cronExpression: t.config.cronExpression,
        lastExecutedAt: t.last_executed_at?.toISOString() || null,
        executionCount: t.execution_count,
        errorCount: t.error_count,
      })),
    });
  } catch (error) {
    logger.error("[App Triggers Cron] Status check failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
