/**
 * Workflow Scheduler Service
 *
 * Handles scheduled workflow triggers using cron expressions.
 * This service checks for workflows that need to run based on their schedule.
 */

import { workflowsRepository } from "@/db/repositories";
import { workflowExecutorService } from "./workflow-executor";
import { logger } from "@/lib/utils/logger";
import type { Workflow } from "@/db/schemas";

// ============================================================================
// Types
// ============================================================================

interface ScheduledRun {
  workflowId: string;
  workflowName: string;
  scheduledFor: Date;
  executed: boolean;
  result?: {
    success: boolean;
    error?: string;
  };
}

// ============================================================================
// Cron Parser (Simple Implementation)
// ============================================================================

// Parse a simple cron expression and check if it matches current time.
// Supports: minute hour day-of-month month day-of-week
// Examples:
//   "0 * * * *" = Every hour at minute 0
//   "0 0 * * *" = Every day at midnight
//   "0 9 * * 1-5" = 9am on weekdays
//   star/15 * * * * = Every 15 minutes (replace star with *)
function matchesCron(cronExpression: string, date: Date): boolean {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    logger.warn("[Scheduler] Invalid cron expression", { cronExpression });
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const currentMinute = date.getMinutes();
  const currentHour = date.getHours();
  const currentDayOfMonth = date.getDate();
  const currentMonth = date.getMonth() + 1; // 1-12
  const currentDayOfWeek = date.getDay(); // 0-6, Sunday = 0

  return (
    matchesCronField(minute, currentMinute, 0, 59) &&
    matchesCronField(hour, currentHour, 0, 23) &&
    matchesCronField(dayOfMonth, currentDayOfMonth, 1, 31) &&
    matchesCronField(month, currentMonth, 1, 12) &&
    matchesCronField(dayOfWeek, currentDayOfWeek, 0, 6)
  );
}

/**
 * Match a single cron field value
 */
function matchesCronField(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  // Wildcard matches everything
  if (field === "*") return true;

  // Handle step values: */5 means every 5
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }

  // Handle ranges: 1-5 means 1 through 5
  if (field.includes("-")) {
    const [start, end] = field.split("-").map((n) => parseInt(n, 10));
    return value >= start && value <= end;
  }

  // Handle lists: 1,3,5 means 1 or 3 or 5
  if (field.includes(",")) {
    const values = field.split(",").map((n) => parseInt(n, 10));
    return values.includes(value);
  }

  // Exact match
  return parseInt(field, 10) === value;
}

// ============================================================================
// Service
// ============================================================================

class WorkflowSchedulerService {
  /**
   * Check and execute all scheduled workflows that should run now.
   * This should be called by a cron job every minute.
   */
  async checkAndRunScheduledWorkflows(): Promise<ScheduledRun[]> {
    const now = new Date();
    const runs: ScheduledRun[] = [];

    // Get all active workflows with schedule triggers
    const workflows = await workflowsRepository.listScheduledWorkflows();

    logger.info("[Scheduler] Checking scheduled workflows", {
      count: workflows.length,
      timestamp: now.toISOString(),
    });

    for (const workflow of workflows) {
      const schedule = workflow.trigger_config.schedule;
      if (!schedule) continue;

      // Apply timezone if specified
      const timezone = workflow.trigger_config.timezone ?? "UTC";
      const checkDate = this.getDateInTimezone(now, timezone);

      // Check if workflow should run
      if (matchesCron(schedule, checkDate)) {
        logger.info("[Scheduler] Executing scheduled workflow", {
          workflowId: workflow.id,
          workflowName: workflow.name,
          schedule,
        });

        const run: ScheduledRun = {
          workflowId: workflow.id,
          workflowName: workflow.name,
          scheduledFor: now,
          executed: true,
        };

        try {
          const result = await workflowExecutorService.execute(
            workflow.id,
            workflow.organization_id,
            workflow.created_by_user_id,
            {
              _trigger: {
                type: "schedule",
                schedule,
                timestamp: now.toISOString(),
              },
            },
          );

          run.result = {
            success: result.success,
            error: result.error,
          };

          logger.info("[Scheduler] Workflow execution completed", {
            workflowId: workflow.id,
            success: result.success,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          run.result = {
            success: false,
            error: errorMessage,
          };

          logger.error("[Scheduler] Workflow execution failed", {
            workflowId: workflow.id,
            error: errorMessage,
          });
        }

        runs.push(run);
      }
    }

    return runs;
  }

  /**
   * Get the next scheduled run time for a workflow
   */
  getNextRunTime(workflow: Workflow): Date | null {
    const schedule = workflow.trigger_config.schedule;
    if (!schedule || workflow.trigger_config.type !== "schedule") {
      return null;
    }

    const timezone = workflow.trigger_config.timezone ?? "UTC";
    const now = this.getDateInTimezone(new Date(), timezone);

    // Check next 1440 minutes (24 hours)
    for (let minutes = 1; minutes <= 1440; minutes++) {
      const checkDate = new Date(now.getTime() + minutes * 60000);
      if (matchesCron(schedule, checkDate)) {
        return checkDate;
      }
    }

    return null;
  }

  /**
   * Validate a cron expression
   */
  validateCronExpression(expression: string): {
    valid: boolean;
    error?: string;
  } {
    const parts = expression.trim().split(/\s+/);

    if (parts.length !== 5) {
      return {
        valid: false,
        error: "Cron expression must have 5 fields: minute hour day month weekday",
      };
    }

    const fieldNames = ["minute", "hour", "day of month", "month", "day of week"];
    const ranges = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ];

    for (let i = 0; i < 5; i++) {
      const field = parts[i];
      const [min, max] = ranges[i];

      if (field === "*") continue;

      // Check step values
      if (field.startsWith("*/")) {
        const step = parseInt(field.slice(2), 10);
        if (isNaN(step) || step < 1) {
          return {
            valid: false,
            error: `Invalid step value for ${fieldNames[i]}: ${field}`,
          };
        }
        continue;
      }

      // Check ranges
      if (field.includes("-")) {
        const [start, end] = field.split("-").map((n) => parseInt(n, 10));
        if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
          return {
            valid: false,
            error: `Invalid range for ${fieldNames[i]}: ${field}`,
          };
        }
        continue;
      }

      // Check lists
      if (field.includes(",")) {
        const values = field.split(",").map((n) => parseInt(n, 10));
        for (const v of values) {
          if (isNaN(v) || v < min || v > max) {
            return {
              valid: false,
              error: `Invalid value in list for ${fieldNames[i]}: ${v}`,
            };
          }
        }
        continue;
      }

      // Check exact value
      const value = parseInt(field, 10);
      if (isNaN(value) || value < min || value > max) {
        return {
          valid: false,
          error: `Invalid value for ${fieldNames[i]}: ${field} (must be ${min}-${max})`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get common schedule presets
   */
  getSchedulePresets(): Array<{ label: string; cron: string; description: string }> {
    return [
      { label: "Every minute", cron: "* * * * *", description: "Runs every minute" },
      { label: "Every 5 minutes", cron: "*/5 * * * *", description: "Runs every 5 minutes" },
      { label: "Every 15 minutes", cron: "*/15 * * * *", description: "Runs every 15 minutes" },
      { label: "Every hour", cron: "0 * * * *", description: "Runs at the start of every hour" },
      { label: "Every day at midnight", cron: "0 0 * * *", description: "Runs at 12:00 AM daily" },
      { label: "Every day at 9am", cron: "0 9 * * *", description: "Runs at 9:00 AM daily" },
      { label: "Every Monday at 9am", cron: "0 9 * * 1", description: "Runs every Monday at 9:00 AM" },
      { label: "Weekdays at 9am", cron: "0 9 * * 1-5", description: "Runs Mon-Fri at 9:00 AM" },
      { label: "First of month", cron: "0 0 1 * *", description: "Runs at midnight on the 1st" },
    ];
  }

  /**
   * Convert date to a specific timezone
   */
  private getDateInTimezone(date: Date, timezone: string): Date {
    try {
      // Create a date string in the target timezone
      const dateStr = date.toLocaleString("en-US", { timeZone: timezone });
      return new Date(dateStr);
    } catch {
      // Fallback to UTC if timezone is invalid
      return date;
    }
  }
}

export const workflowSchedulerService = new WorkflowSchedulerService();
