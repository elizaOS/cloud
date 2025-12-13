/**
 * Admin Agent Reputation Detail API
 *
 * GET /api/admin/agents/reputation/[agentId]
 * Get detailed reputation info and moderation history for a specific agent
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { agentReputationService } from "@/lib/services/agent-reputation";
import { logger } from "@/lib/utils/logger";

interface RouteContext {
  params: Promise<{ agentId: string }>;
}

/**
 * GET /api/admin/agents/reputation/[agentId]
 * Get detailed agent reputation info and moderation history
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAdmin(request);

  const { agentId } = await ctx.params;

  // Decode agent identifier (it may be URL encoded)
  const agentIdentifier = decodeURIComponent(agentId);

  // Get agent
  const agent = await agentReputationService.getAgent(agentIdentifier);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Get moderation events
  const moderationEvents =
    await agentReputationService.getAgentModerationEvents(agentIdentifier);

  logger.info("[AdminAgentReputation] Fetched agent details", {
    agentIdentifier,
    adminUserId: user.id,
  });

  return NextResponse.json({
    agent: {
      id: agent.id,
      agentIdentifier: agent.agentIdentifier,
      chainId: agent.chainId,
      tokenId: agent.tokenId,
      walletAddress: agent.walletAddress,
      organizationId: agent.organizationId,

      // Status
      status: agent.status,
      reputationScore: agent.reputationScore,
      trustLevel: agent.trustLevel,
      confidenceScore: agent.confidenceScore,

      // Positive factors
      totalDeposited: agent.totalDeposited,
      totalSpent: agent.totalSpent,
      paymentCount: agent.paymentCount,
      lastPaymentAt: agent.lastPaymentAt,
      totalRequests: agent.totalRequests,
      successfulRequests: agent.successfulRequests,
      failedRequests: agent.failedRequests,
      lastRequestAt: agent.lastRequestAt,

      // Negative factors
      totalViolations: agent.totalViolations,
      csamViolations: agent.csamViolations,
      selfHarmViolations: agent.selfHarmViolations,
      otherViolations: agent.otherViolations,
      lastViolationAt: agent.lastViolationAt,

      // Admin flags
      flagCount: agent.flagCount,
      isFlaggedByAdmin: agent.isFlaggedByAdmin,
      flagReason: agent.flagReason,
      flaggedAt: agent.flaggedAt,
      flaggedBy: agent.flaggedBy,

      // Ban info
      bannedAt: agent.bannedAt,
      bannedBy: agent.bannedBy,
      banReason: agent.banReason,
      banExpiresAt: agent.banExpiresAt,

      // Timestamps
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      firstSeenAt: agent.firstSeenAt,
    },
    moderationEvents: moderationEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      flagType: e.flagType,
      severity: e.severity,
      description: e.description,
      evidence: e.evidence?.slice(0, 200), // Truncate evidence for listing
      detectedBy: e.detectedBy,
      adminUserId: e.adminUserId,
      adminNotes: e.adminNotes,
      actionTaken: e.actionTaken,
      reputationChange: e.reputationChange,
      previousScore: e.previousScore,
      newScore: e.newScore,
      createdAt: e.createdAt,
      resolvedAt: e.resolvedAt,
      resolvedBy: e.resolvedBy,
    })),
    summary: {
      totalModerationEvents: moderationEvents.length,
      unresolvedEvents: moderationEvents.filter((e) => !e.resolvedAt).length,
      totalReputationChange: moderationEvents.reduce(
        (sum, e) => sum + (e.reputationChange ?? 0),
        0,
      ),
    },
  });
}
