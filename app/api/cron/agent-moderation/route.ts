/**
 * Agent Moderation Cron - Weekly (Sun 2 AM UTC)
 * Scans public agents for policy violations
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { userCharacters } from "@/db/schemas/user-characters";
import { domainContentModerationService } from "@/lib/services/domain-content-moderation";
import { suspensionNotificationService } from "@/lib/services/suspension-notification";
import { managedDomainsRepository } from "@/db/repositories/managed-domains";
import { verifyCronSecret, CRON_MAX_RUNTIME_MS, acquireLock, releaseLock } from "@/lib/utils/cron";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";

const BATCH_SIZE = 20;

interface Stats { scanned: number; clean: number; flagged: number; suspended: number; errors: number; timedOut: boolean }

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!acquireLock("agent-moderation")) {
    logger.warn("[Cron] Agent moderation already running");
    return NextResponse.json({ success: false, error: "already_running" }, { status: 409 });
  }

  const start = Date.now();
  const stats: Stats = { scanned: 0, clean: 0, flagged: 0, suspended: 0, errors: 0, timedOut: false };
  
  try {
    logger.info("[Cron] Agent moderation");
    const agents = await domainContentModerationService.getPublicAgentsForModeration(500);

    for (let i = 0; i < agents.length; i += BATCH_SIZE) {
      if (Date.now() - start > CRON_MAX_RUNTIME_MS) {
        stats.timedOut = true;
        break;
      }

      await Promise.all(agents.slice(i, i + BATCH_SIZE).map(async (agent) => {
        try {
          const result = await domainContentModerationService.sampleAgentResponses(agent.id);
          stats.scanned++;

          if (result.status === "clean") {
            stats.clean++;
          } else if (result.status === "suspended") {
            stats.suspended++;
            await db.update(userCharacters)
              .set({ is_public: false, settings: { suspended: true, suspendedAt: new Date().toISOString(), suspensionReason: result.reasoning } })
              .where(eq(userCharacters.id, agent.id));

            const domain = await managedDomainsRepository.findByAgentId(agent.id);
            if (domain) await suspensionNotificationService.suspendAndNotify(domain.id, result.reasoning || "Agent violation", result.flags);
            
            logger.warn("[Cron] Agent suspended", { id: agent.id, name: agent.name });
          } else {
            stats.flagged++;
          }
        } catch (e) {
          stats.errors++;
          logger.error("[Cron] Agent scan failed", { id: agent.id, error: extractErrorMessage(e) });
        }
      }));
    }

    logger.info("[Cron] Complete", stats);
    return NextResponse.json({ success: true, job: "agent-moderation", stats, duration: Date.now() - start, timestamp: new Date().toISOString() });
  } finally {
    releaseLock("agent-moderation");
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const count = (await domainContentModerationService.getPublicAgentsForModeration(10)).length;
  return NextResponse.json({ success: true, job: "agent-moderation", status: "healthy", sampleCount: count, timestamp: new Date().toISOString() });
}
