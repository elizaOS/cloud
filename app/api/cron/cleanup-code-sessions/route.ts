/**
 * Cron Job: Cleanup Expired Code Agent Sessions
 *
 * This endpoint should be called periodically to:
 * 1. Terminate expired code agent sessions
 * 2. Delete old interpreter executions
 * 3. Clean up orphaned snapshots
 *
 * Setup with Vercel Cron:
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-code-sessions",
 *     "schedule": "0,15,30,45 * * * *"  // Every 15 minutes
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq, lt, and, inArray } from "drizzle-orm";
import {
  codeAgentSessions,
  codeAgentSnapshots,
  interpreterExecutions,
} from "@/db/schemas/code-agent-sessions";
import { codeAgentService } from "@/lib/services/code-agent";
import { logger } from "@/lib/utils/logger";
import { del } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/cleanup-code-sessions
 * Cleanup expired code agent sessions and related data.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("[Cleanup Code Sessions] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  const providedSecret = authHeader?.replace("Bearer ", "");
  if (providedSecret !== cronSecret) {
    logger.warn("[Cleanup Code Sessions] Invalid cron secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[Cleanup Code Sessions] Starting cleanup");

  const now = new Date();
  const stats = {
    expiredSessionsTerminated: 0,
    expiredSnapshotsDeleted: 0,
    oldInterpreterExecutionsDeleted: 0,
    errors: [] as string[],
  };

  // Step 1: Find and terminate expired sessions
  const expiredSessions = await db.query.codeAgentSessions.findMany({
    where: and(
      lt(codeAgentSessions.expires_at, now),
      inArray(codeAgentSessions.status, ["ready", "executing", "suspended"]),
    ),
    limit: 50, // Process in batches
  });

  logger.info("[Cleanup Code Sessions] Found expired sessions", {
    count: expiredSessions.length,
  });

  for (const session of expiredSessions) {
    try {
      await codeAgentService.terminateSession(
        session.id,
        session.organization_id,
      );
      stats.expiredSessionsTerminated++;
    } catch (error) {
      const msg = `Failed to terminate session ${session.id}: ${error instanceof Error ? error.message : "Unknown"}`;
      stats.errors.push(msg);
      logger.error("[Cleanup Code Sessions]", msg);
    }
  }

  // Step 2: Delete expired snapshots
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const expiredSnapshots = await db.query.codeAgentSnapshots.findMany({
    where: lt(codeAgentSnapshots.expires_at, now),
    limit: 100,
  });

  logger.info("[Cleanup Code Sessions] Found expired snapshots", {
    count: expiredSnapshots.length,
  });

  for (const snapshot of expiredSnapshots) {
    try {
      // Delete from blob storage
      if (snapshot.storage_key) {
        await del(snapshot.storage_key);
      }

      // Delete record
      await db
        .delete(codeAgentSnapshots)
        .where(eq(codeAgentSnapshots.id, snapshot.id));

      stats.expiredSnapshotsDeleted++;
    } catch (error) {
      const msg = `Failed to delete snapshot ${snapshot.id}: ${error instanceof Error ? error.message : "Unknown"}`;
      stats.errors.push(msg);
      logger.error("[Cleanup Code Sessions]", msg);
    }
  }

  // Step 3: Delete old interpreter executions (older than 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const deletedExecutions = await db
    .delete(interpreterExecutions)
    .where(lt(interpreterExecutions.created_at, sevenDaysAgo))
    .returning({ id: interpreterExecutions.id });

  stats.oldInterpreterExecutionsDeleted = deletedExecutions.length;

  logger.info("[Cleanup Code Sessions] Deleted old interpreter executions", {
    count: stats.oldInterpreterExecutionsDeleted,
  });

  // Step 4: Mark sessions that have been "creating" for too long as "error"
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const stuckSessions = await db
    .update(codeAgentSessions)
    .set({
      status: "error",
      status_message: "Session creation timed out",
      updated_at: now,
    })
    .where(
      and(
        eq(codeAgentSessions.status, "creating"),
        lt(codeAgentSessions.created_at, oneHourAgo),
      ),
    )
    .returning({ id: codeAgentSessions.id });

  if (stuckSessions.length > 0) {
    logger.info("[Cleanup Code Sessions] Marked stuck sessions as error", {
      count: stuckSessions.length,
    });
  }

  logger.info("[Cleanup Code Sessions] Cleanup completed", { stats });

  return NextResponse.json({
    success: true,
    message: "Cleanup completed",
    stats: {
      ...stats,
      stuckSessionsMarkedError: stuckSessions.length,
      timestamp: now.toISOString(),
    },
  });
}
