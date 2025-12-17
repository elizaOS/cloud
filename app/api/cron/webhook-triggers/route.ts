/**
 * Cron Job: Webhook Triggers
 *
 * Processes scheduled (cron) webhooks.
 * Runs every minute to check for webhooks that need to be triggered.
 *
 * Schedule: Every minute (* * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { webhookService } from "@/lib/services/webhooks/webhook-service";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db";
import { webhooks } from "@/db/schemas/webhooks";
import { eq, and, sql } from "drizzle-orm";

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    logger.warn("[Webhook Triggers Cron] CRON_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  const secretBuffer = Buffer.from(CRON_SECRET, "utf-8");
  const providedBuffer = Buffer.from(providedSecret, "utf-8");

  if (secretBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(secretBuffer, providedBuffer);
}

function shouldExecuteCron(
  cronExpression: string,
  lastExecutedAt: Date | null,
): boolean {
  const now = new Date();
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    logger.warn(
      `[Webhook Triggers Cron] Invalid cron expression (need 5 parts): ${cronExpression}`,
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
    if (pattern === "*") return true;

    if (pattern.includes("/")) {
      const [base, stepStr] = pattern.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return false;

      if (base === "*") {
        return value % step === 0;
      }
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
      return pattern.split(",").some((p) => matches(p.trim(), value, max));
    }

    if (pattern.includes("-")) {
      const [startStr, endStr] = pattern.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      return value >= start && value <= end;
    }

    return parseInt(pattern, 10) === value;
  };

  const minuteMatch = matches(minute, currentMinute, 59);
  const hourMatch = matches(hour, currentHour, 23);
  const dayMatch = matches(dayOfMonth, currentDay, 31);
  const monthMatch = matches(month, currentMonth, 12);
  const dayOfWeekMatch = matches(dayOfWeek, currentDayOfWeek, 6);

  const allMatch =
    minuteMatch && hourMatch && dayMatch && monthMatch && dayOfWeekMatch;

  if (!lastExecutedAt) return allMatch;

  const timeSinceLastExecution = now.getTime() - lastExecutedAt.getTime();
  const oneMinute = 60 * 1000;

  return timeSinceLastExecution >= oneMinute && allMatch;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  logger.info("[Webhook Triggers Cron] Starting webhook trigger processing");

  const cronWebhooks = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.is_active, true),
        sql`${webhooks.config}->>'cronExpression' IS NOT NULL`,
      ),
    );

  logger.info(
    `[Webhook Triggers Cron] Found ${cronWebhooks.length} active cron webhooks`,
  );

  const results = {
    processed: 0,
    executed: 0,
    errors: 0,
    skipped: 0,
  };

  for (const webhook of cronWebhooks) {
    results.processed++;

    const config = webhook.config as any;
    const cronExpression = config.cronExpression as string;

    if (!cronExpression) {
      logger.warn(
        `[Webhook Triggers Cron] Webhook ${webhook.id} missing cronExpression`,
      );
      results.skipped++;
      continue;
    }

    const lastExecutedAt = webhook.last_triggered_at
      ? new Date(webhook.last_triggered_at)
      : null;

    if (shouldExecuteCron(cronExpression, lastExecutedAt)) {
      logger.info(
        `[Webhook Triggers Cron] Executing webhook ${webhook.id} (${webhook.name})`,
      );

      const rateLimitOk = await webhookService.checkRateLimit(webhook.id);
      if (!rateLimitOk) {
        logger.warn(
          `[Webhook Triggers Cron] Rate limit exceeded for webhook ${webhook.id}`,
        );
        results.skipped++;
        continue;
      }

      await webhookService
        .executeWebhook({
          webhookId: webhook.id,
          eventType: "cron.triggered",
          payload: {
            cronExpression,
            webhookId: webhook.id,
            webhookName: webhook.name,
            timestamp: new Date().toISOString(),
          },
        })
        .then(() => {
          results.executed++;
        })
        .catch((error) => {
          logger.error(
            `[Webhook Triggers Cron] Error executing webhook ${webhook.id}:`,
            error,
          );
          results.errors++;
        });
    } else {
      results.skipped++;
    }
  }

  const duration = Date.now() - startTime;

  logger.info("[Webhook Triggers Cron] Completed", {
    duration,
    ...results,
  });

  return NextResponse.json({
    success: true,
    duration,
    results,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronWebhooks = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.is_active, true),
        sql`${webhooks.config}->>'cronExpression' IS NOT NULL`,
      ),
    );

  return NextResponse.json({
    success: true,
    count: cronWebhooks.length,
    webhooks: cronWebhooks.map((w) => ({
      id: w.id,
      name: w.name,
      cronExpression: (w.config as any).cronExpression,
      lastTriggeredAt: w.last_triggered_at?.toISOString(),
    })),
  });
}

