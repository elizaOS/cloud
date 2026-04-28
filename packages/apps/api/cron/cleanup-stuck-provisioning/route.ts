/**
 * Cleanup Stuck Provisioning Cron
 *
 * Detects and recovers agents that are stuck in "provisioning" status with no
 * active job to drive them forward.  This happens when:
 *
 *   1. A container crashes while the agent is running, and something (e.g.
 *      the Next.js sync provision path) sets status = 'provisioning' but
 *      never creates a jobs-table record.
 *   2. A provision job is enqueued but the worker invocation dies before it
 *      can claim the record — in this case the job-recovery logic in
 *      process-provisioning-jobs will already handle it, but we add a belt-
 *      and-suspenders check here for the no-job case.
 *
 * Criteria for "stuck":
 *   - status = 'provisioning'
 *   - updated_at < NOW() - 10 minutes  (well beyond any normal provision time)
 *   - no jobs row in ('pending', 'in_progress') whose data->>'agentId' matches
 *
 * Action: set status = 'error', write a descriptive error_message so the user
 * can see what happened and re-provision.
 *
 * Schedule: every 5 minutes  ("* /5 * * * *" in vercel.json)
 * Protected by CRON_SECRET.
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/db/client";
import { jobs } from "@/db/schemas/jobs";
import { miladySandboxes } from "@/db/schemas/milady-sandboxes";
import { verifyCronSecret } from "@/lib/api/cron-auth";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How long an agent must be stuck before we reset it (ms). */
const STUCK_THRESHOLD_MINUTES = 10;

interface CleanupResult {
  agentId: string;
  agentName: string | null;
  organizationId: string;
  stuckSinceMinutes: number;
}

async function handleCleanupStuckProvisioning(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request, "[Cleanup Stuck Provisioning]");
    if (authError) return authError;

    logger.info("[Cleanup Stuck Provisioning] Starting scan");

    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

    /**
     * Single UPDATE … RETURNING query:
     *
     *   UPDATE milady_sandboxes
     *   SET    status = 'error',
     *          error_message = '...',
     *          updated_at = NOW()
     *   WHERE  status = 'provisioning'
     *     AND  updated_at < :cutoff
     *     AND  NOT EXISTS (
     *            SELECT 1 FROM jobs
     *            WHERE  jobs.data->>'agentId' = milady_sandboxes.id::text
     *              AND  jobs.status IN ('pending', 'in_progress')
     *          )
     *   RETURNING id, agent_name, organization_id, updated_at
     *
     * We run this inside dbWrite so it lands on the primary replica and is
     * subject to the write path's connection pool.
     */
    const stuckAgents = await dbWrite
      .update(miladySandboxes)
      .set({
        status: "error",
        error_message:
          "Agent was stuck in provisioning state with no active provisioning job. " +
          "This usually means a container crashed before the provisioning job could be created, " +
          "or the job was lost. Please try starting the agent again.",
        updated_at: new Date(),
      })
      .where(
        and(
          eq(miladySandboxes.status, "provisioning"),
          lt(miladySandboxes.updated_at, cutoff),
          sql`NOT EXISTS (
            SELECT 1 FROM ${jobs}
            WHERE  ${jobs.data}->>'agentId' = ${miladySandboxes.id}::text
            AND    ${jobs.status} IN ('pending', 'in_progress')
          )`,
        ),
      )
      .returning({
        agentId: miladySandboxes.id,
        agentName: miladySandboxes.agent_name,
        organizationId: miladySandboxes.organization_id,
        updatedAt: miladySandboxes.updated_at,
      });

    const results: CleanupResult[] = stuckAgents.map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      organizationId: row.organizationId,
      // updatedAt is now the new timestamp; we can't recover the old one here,
      // but the log message below captures the count.
      stuckSinceMinutes: STUCK_THRESHOLD_MINUTES, // minimum — actual may be longer
    }));

    if (results.length > 0) {
      logger.warn("[Cleanup Stuck Provisioning] Reset stuck agents", {
        count: results.length,
        agents: results.map((r) => ({
          agentId: r.agentId,
          agentName: r.agentName,
          organizationId: r.organizationId,
        })),
      });
    } else {
      logger.info("[Cleanup Stuck Provisioning] No stuck agents found");
    }

    return NextResponse.json({
      success: true,
      data: {
        cleaned: results.length,
        thresholdMinutes: STUCK_THRESHOLD_MINUTES,
        timestamp: new Date().toISOString(),
        agents: results,
      },
    });
  } catch (error) {
    logger.error(
      "[Cleanup Stuck Provisioning] Failed:",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cron/cleanup-stuck-provisioning
 * Cron endpoint — protected by CRON_SECRET (Vercel passes it automatically).
 */
export async function GET(request: NextRequest) {
  return handleCleanupStuckProvisioning(request);
}

/**
 * POST /api/cron/cleanup-stuck-provisioning
 * Manual trigger for testing — same auth requirement.
 */
export async function POST(request: NextRequest) {
  return handleCleanupStuckProvisioning(request);
}
