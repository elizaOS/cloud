/**
 * Cron Job: N8N Workflow Triggers
 *
 * Processes scheduled (cron) workflow triggers.
 * Runs every minute to check for workflows that need to be executed.
 *
 * Schedule: Every minute (* * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { n8nWorkflowTriggersRepository } from "@/db/repositories/n8n-workflows";
import { logger } from "@/lib/utils/logger";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Verify cron secret for authentication using timing-safe comparison.
 */
function verifyCronSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    logger.warn("[N8N Workflow Triggers Cron] CRON_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  try {
    const secretBuffer = Buffer.from(CRON_SECRET, "utf-8");
    const providedBuffer = Buffer.from(providedSecret, "utf-8");

    if (secretBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(secretBuffer, providedBuffer);
  } catch {
    return false;
  }
}

/**
 * Cron expression matcher supporting:
 * - * (any value)
 * - N (specific value)
 * - N-M (range)
 * - N,M,O (list)
 * - *\/N or N-M/S (step)
 */
function shouldExecuteCron(
  cronExpression: string,
  lastExecutedAt: Date | null,
): boolean {
  try {
    const now = new Date();
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length !== 5) {
      logger.warn(
        `[N8N Workflow Triggers Cron] Invalid cron expression (need 5 parts): ${cronExpression}`,
      );
      return false;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentDayOfWeek = now.getDay();

    const matches = (pattern: string, value: number, max: number): boolean => {
      // Wildcard
      if (pattern === "*") return true;

      // Step pattern: */N or N-M/S
      if (pattern.includes("/")) {
        const [base, stepStr] = pattern.split("/");
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) return false;

        if (base === "*") {
          return value % step === 0;
        }
        // Range with step: N-M/S
        if (base.includes("-")) {
          const [startStr, endStr] = base.split("-");
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (value < start || value > end) return false;
          return (value - start) % step === 0;
        }
        return false;
      }

      // List pattern: N,M,O
      if (pattern.includes(",")) {
        return pattern.split(",").some((p) => matches(p.trim(), value, max));
      }

      // Range pattern: N-M
      if (pattern.includes("-")) {
        const [startStr, endStr] = pattern.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        return value >= start && value <= end;
      }

      // Exact value
      return parseInt(pattern, 10) === value;
    };

    const minuteMatch = matches(minute, currentMinute, 59);
    const hourMatch = matches(hour, currentHour, 23);
    const dayMatch = matches(dayOfMonth, currentDay, 31);
    const monthMatch = matches(month, currentMonth, 12);
    const dayOfWeekMatch = matches(dayOfWeek, currentDayOfWeek, 6);

    const allMatch =
      minuteMatch && hourMatch && dayMatch && monthMatch && dayOfWeekMatch;

    // If never executed, execute if matches now
    if (!lastExecutedAt) {
      return allMatch;
    }

    // If executed before, only execute if at least 1 minute has passed
    const timeSinceLastExecution = now.getTime() - lastExecutedAt.getTime();
    const oneMinute = 60 * 1000;

    return timeSinceLastExecution >= oneMinute && allMatch;
  } catch (error) {
    logger.error(
      `[N8N Workflow Triggers Cron] Invalid cron expression: ${cronExpression}`,
      error,
    );
    return false;
  }
}

/**
 * POST /api/cron/n8n-workflow-triggers
 * Process scheduled workflow triggers
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    logger.info("[N8N Workflow Triggers Cron] Starting trigger processing");

    // Get all active cron triggers
    const triggers = await n8nWorkflowsService.getActiveCronTriggers();
    logger.info(
      `[N8N Workflow Triggers Cron] Found ${triggers.length} active cron triggers`,
    );

    const results = {
      processed: 0,
      executed: 0,
      errors: 0,
      skipped: 0,
    };

    for (const trigger of triggers) {
      try {
        const cronExpression = trigger.config.cronExpression as string;
        if (!cronExpression) {
          logger.warn(
            `[N8N Workflow Triggers Cron] Trigger ${trigger.id} missing cronExpression`,
          );
          results.skipped++;
          continue;
        }

        const lastExecutedAt = trigger.last_executed_at
          ? new Date(trigger.last_executed_at)
          : null;

        if (shouldExecuteCron(cronExpression, lastExecutedAt)) {
          logger.info(
            `[N8N Workflow Triggers Cron] Executing trigger ${trigger.id} (${trigger.trigger_key})`,
          );

          await n8nWorkflowsService.executeWorkflowTrigger(
            trigger.id,
            trigger.config.inputData as Record<string, unknown>,
          );

          results.executed++;
        } else {
          results.skipped++;
        }

        results.processed++;
      } catch (error) {
        logger.error(
          `[N8N Workflow Triggers Cron] Error processing trigger ${trigger.id}:`,
          error,
        );
        await n8nWorkflowTriggersRepository.incrementErrorCount(trigger.id);
        results.errors++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info("[N8N Workflow Triggers Cron] Completed", {
      duration,
      ...results,
    });

    return NextResponse.json({
      success: true,
      duration,
      results,
    });
  } catch (error) {
    logger.error("[N8N Workflow Triggers Cron] Failed", {
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

/**
 * GET /api/cron/n8n-workflow-triggers
 * Health check and status
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const triggers = await n8nWorkflowsService.getActiveCronTriggers();
    return NextResponse.json({
      success: true,
      activeTriggers: triggers.length,
      triggers: triggers.map((t) => ({
        id: t.id,
        workflowId: t.workflow_id,
        triggerKey: t.trigger_key,
        cronExpression: t.config.cronExpression,
        lastExecutedAt: t.last_executed_at,
        executionCount: t.execution_count,
        errorCount: t.error_count,
      })),
    });
  } catch (error) {
    logger.error("[N8N Workflow Triggers Cron] Status check failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
