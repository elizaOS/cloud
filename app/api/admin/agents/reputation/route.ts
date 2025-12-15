/**
 * Admin Agent Reputation API
 *
 * Endpoints for managing external agent reputation:
 * - GET: List agents with reputation data
 * - POST: Flag or ban an agent
 * - PATCH: Update agent status
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { agentReputationService } from "@/lib/services/agent-reputation";
import { logger } from "@/lib/utils/logger";

// ===== Schemas =====

const FlagAgentSchema = z.object({
  action: z.enum(["flag", "ban", "unban", "warn"]),
  agentIdentifier: z.string().min(1),
  flagType: z
    .enum([
      "csam",
      "self_harm",
      "spam",
      "scam",
      "harassment",
      "copyright",
      "malware",
      "other",
    ])
    .optional(),
  reason: z.string().min(1),
  evidence: z.string().optional(),
  permanent: z.boolean().optional().default(false),
});

const ListAgentsSchema = z.object({
  status: z
    .enum(["all", "banned", "flagged", "low_reputation"])
    .optional()
    .default("all"),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// ===== Handlers =====

/**
 * GET /api/admin/agents/reputation
 * List agents with reputation data
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuth(request);

  // Check admin status
  const isAdmin = await adminService.isUserAdmin(user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Parse query params
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = ListAgentsSchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { status, limit } = parsed.data;

  let agents;
  switch (status) {
    case "banned":
      agents = await agentReputationService.getBannedAgents();
      break;
    case "flagged":
      agents = await agentReputationService.getAgentsFlaggedForReview();
      break;
    case "low_reputation":
      agents = await agentReputationService.getLowReputationAgents(30);
      break;
    default:
      agents = await agentReputationService.getReputationLeaderboard(limit);
  }

  return NextResponse.json({
    agents: agents.slice(0, limit),
    total: agents.length,
    status,
  });
}

/**
 * POST /api/admin/agents/reputation
 * Flag, ban, or unban an agent
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuth(request);

  // Check admin status
  const isAdmin = await adminService.isUserAdmin(user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Parse body - user-supplied data requires parse error handling
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = FlagAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { action, agentIdentifier, flagType, reason, evidence, permanent } =
    parsed.data;

  logger.info("[AdminAgentReputation] Action requested", {
    action,
    agentIdentifier,
    adminUserId: user.id,
  });

  let result;

  switch (action) {
    case "flag":
      if (!flagType) {
        return NextResponse.json(
          { error: "flagType required for flag action" },
          { status: 400 },
        );
      }
      result = await agentReputationService.flagAgent({
        agentIdentifier,
        flagType,
        reason,
        adminUserId: user.id,
        evidence,
        autoBan: false,
      });
      break;

    case "ban":
      result = await agentReputationService.banAgent({
        agentIdentifier,
        reason,
        adminUserId: user.id,
        permanent,
      });
      break;

    case "unban":
      result = await agentReputationService.unbanAgent({
        agentIdentifier,
        adminUserId: user.id,
        notes: reason,
      });
      break;

    case "warn":
      // Record as a warning (flag without ban)
      if (!flagType) {
        return NextResponse.json(
          { error: "flagType required for warn action" },
          { status: 400 },
        );
      }
      result = await agentReputationService.recordViolation({
        agentIdentifier,
        flagType,
        severity: "medium",
        description: reason,
        evidence,
        detectedBy: "admin",
      });
      break;
  }

  logger.info("[AdminAgentReputation] Action completed", {
    action,
    agentIdentifier,
    newStatus: result.status,
    newScore: result.reputationScore,
  });

  return NextResponse.json({
    success: true,
    action,
    agent: {
      agentIdentifier: result.agentIdentifier,
      status: result.status,
      reputationScore: result.reputationScore,
      trustLevel: result.trustLevel,
      totalViolations: result.totalViolations,
      isFlaggedByAdmin: result.isFlaggedByAdmin,
      bannedAt: result.bannedAt,
    },
  });
}
