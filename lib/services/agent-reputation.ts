/**
 * Agent Reputation Service
 *
 * Tracks and calculates reputation for external agents connecting via ERC-8004/A2A.
 *
 * Reputation is built through:
 * - Payment deposits (x402, credit purchases)
 * - Service usage (API calls, successful generations)
 * - Positive moderation history
 *
 * Reputation is damaged by:
 * - Moderation violations (CSAM, self-harm, etc.)
 * - Admin flags (spam, scam, abuse)
 * - Failed payments / chargebacks
 *
 * Config is loaded from config/agent-reputation.json
 */

import { dbRead, dbWrite } from "@/db/client";
import {
  agentReputation,
  agentModerationEvents,
  agentActivityLog,
  type AgentReputation,
  type NewAgentReputation,
  type AgentModerationEvent,
} from "@/db/schemas/agent-reputation";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import reputationConfig from "@/config/agent-reputation.json";

type TrustLevel = "untrusted" | "low" | "neutral" | "trusted" | "verified";
type AgentStatus = "new" | "trusted" | "warned" | "restricted" | "banned";
type FlagType =
  | "csam"
  | "self_harm"
  | "spam"
  | "scam"
  | "harassment"
  | "copyright"
  | "malware"
  | "other";
type ViolationSeverity = "low" | "medium" | "high" | "critical";

interface ReputationUpdate {
  agentIdentifier: string;
  chainId?: number;
  tokenId?: number;
  walletAddress?: string;
  organizationId?: string;
}

interface PaymentEvent {
  agentIdentifier: string;
  amountUsd: number;
  paymentType: "x402" | "stripe" | "crypto";
  transactionId?: string;
}

interface RequestEvent {
  agentIdentifier: string;
  isSuccessful: boolean;
  method?: string;
  model?: string;
  costUsd?: number;
}

interface ViolationEvent {
  agentIdentifier: string;
  flagType: FlagType;
  severity: ViolationSeverity;
  description?: string;
  evidence?: string;
  moderationScores?: Record<string, number>;
  detectedBy: "auto" | "admin" | "report";
}

interface AdminFlagParams {
  agentIdentifier: string;
  flagType: FlagType;
  reason: string;
  adminUserId: string;
  evidence?: string;
  autoBan?: boolean;
}

const config = reputationConfig;

class AgentReputationService {
  // ===== Agent Lookup & Creation =====

  /**
   * Get or create agent reputation record
   */
  async getOrCreateAgent(params: ReputationUpdate): Promise<AgentReputation> {
    const existing = await dbRead.query.agentReputation.findFirst({
      where: eq(agentReputation.agentIdentifier, params.agentIdentifier),
    });

    if (existing) {
      // Update optional fields if provided
      if (params.organizationId && !existing.organizationId) {
        await dbWrite
          .update(agentReputation)
          .set({ organizationId: params.organizationId, updatedAt: new Date() })
          .where(eq(agentReputation.id, existing.id));
      }
      return existing;
    }

    // Create new agent reputation record
    const [newAgent] = await dbWrite
      .insert(agentReputation)
      .values({
        agentIdentifier: params.agentIdentifier,
        chainId: params.chainId,
        tokenId: params.tokenId,
        walletAddress: params.walletAddress?.toLowerCase(),
        organizationId: params.organizationId,
        status: "new",
        reputationScore: config.defaults.newAgentScore,
        trustLevel: config.defaults.newAgentTrustLevel,
      })
      .returning();

    logger.info("[AgentReputation] Created new agent record", {
      agentIdentifier: params.agentIdentifier,
      chainId: params.chainId,
      tokenId: params.tokenId,
    });

    return newAgent;
  }

  /**
   * Get agent by identifier
   */
  async getAgent(agentIdentifier: string): Promise<AgentReputation | null> {
    const result = await dbRead.query.agentReputation.findFirst({
      where: eq(agentReputation.agentIdentifier, agentIdentifier),
    });
    return result ?? null;
  }

  /**
   * Get agent by ERC-8004 chain:tokenId
   */
  async getAgentByOnChainId(
    chainId: number,
    tokenId: number,
  ): Promise<AgentReputation | null> {
    const result = await dbRead.query.agentReputation.findFirst({
      where: and(
        eq(agentReputation.chainId, chainId),
        eq(agentReputation.tokenId, tokenId),
      ),
    });
    return result ?? null;
  }

  // ===== Reputation Tracking =====

  /**
   * Record a payment event (positive reputation)
   */
  async recordPayment(event: PaymentEvent): Promise<AgentReputation> {
    const agent = await this.getOrCreateAgent({
      agentIdentifier: event.agentIdentifier,
    });

    const now = new Date();
    const newTotalDeposited = agent.totalDeposited + event.amountUsd;
    const newPaymentCount = agent.paymentCount + 1;

    // Update agent
    await dbWrite
      .update(agentReputation)
      .set({
        totalDeposited: newTotalDeposited,
        paymentCount: newPaymentCount,
        lastPaymentAt: now,
        updatedAt: now,
      })
      .where(eq(agentReputation.id, agent.id));

    // Log activity
    await dbWrite.insert(agentActivityLog).values({
      agentReputationId: agent.id,
      activityType: "payment",
      amountUsd: event.amountUsd,
      details: {
        paymentType: event.paymentType,
        transactionId: event.transactionId,
      },
      isSuccessful: true,
    });

    // Recalculate reputation
    return this.recalculateReputation(agent.agentIdentifier);
  }

  /**
   * Record an API request event
   */
  async recordRequest(event: RequestEvent): Promise<void> {
    const agent = await this.getOrCreateAgent({
      agentIdentifier: event.agentIdentifier,
    });

    const now = new Date();
    const updates: Partial<AgentReputation> = {
      totalRequests: agent.totalRequests + 1,
      lastRequestAt: now,
      updatedAt: now,
    };

    if (event.isSuccessful) {
      updates.successfulRequests = agent.successfulRequests + 1;
      updates.totalSpent = agent.totalSpent + (event.costUsd ?? 0);
    } else {
      updates.failedRequests = agent.failedRequests + 1;
    }

    await dbWrite
      .update(agentReputation)
      .set(updates)
      .where(eq(agentReputation.id, agent.id));

    // Log activity (batch these for performance in production)
    await dbWrite.insert(agentActivityLog).values({
      agentReputationId: agent.id,
      activityType: "request",
      amountUsd: event.costUsd,
      details: { method: event.method, model: event.model },
      isSuccessful: event.isSuccessful,
    });
  }

  /**
   * Record a moderation violation (negative reputation)
   */
  async recordViolation(event: ViolationEvent): Promise<AgentReputation> {
    const agent = await this.getOrCreateAgent({
      agentIdentifier: event.agentIdentifier,
    });
    const previousScore = agent.reputationScore;

    // Get penalty from config
    const violationKey =
      `${event.flagType}Violation` as keyof typeof config.scoring.negativeFactors;
    const violationConfig =
      config.scoring.negativeFactors[violationKey] ||
      config.scoring.negativeFactors.adminFlag;
    const penalty =
      "pointsDeducted" in violationConfig
        ? violationConfig.pointsDeducted
        : violationConfig.defaultPoints;

    const now = new Date();
    const updates: Partial<AgentReputation> = {
      totalViolations: agent.totalViolations + 1,
      lastViolationAt: now,
      updatedAt: now,
    };

    // Track specific violation types
    if (event.flagType === "csam") {
      updates.csamViolations = agent.csamViolations + 1;
    } else if (event.flagType === "self_harm") {
      updates.selfHarmViolations = agent.selfHarmViolations + 1;
    } else {
      updates.otherViolations = agent.otherViolations + 1;
    }

    // Check for auto-ban
    const shouldAutoBan =
      "autoban" in violationConfig && violationConfig.autoban;
    const isPermanent =
      "permanent" in violationConfig && violationConfig.permanent;

    if (shouldAutoBan) {
      updates.status = "banned";
      updates.bannedAt = now;
      updates.banReason = `Auto-banned for ${event.flagType} violation`;
      if (!isPermanent) {
        updates.banExpiresAt = new Date(
          now.getTime() + config.defaults.banDurationDays * 24 * 60 * 60 * 1000,
        );
      }
    } else {
      // Check if should restrict based on violation count
      const newTotalViolations = agent.totalViolations + 1;
      if (newTotalViolations >= config.moderation.violationsBeforeBan) {
        updates.status = "banned";
        updates.bannedAt = now;
        updates.banReason = `Banned after ${newTotalViolations} violations`;
      } else if (
        newTotalViolations >= config.moderation.violationsBeforeRestriction
      ) {
        updates.status = "restricted";
      } else if (
        newTotalViolations >= config.moderation.violationsBeforeWarning
      ) {
        updates.status = "warned";
      }
    }

    await dbWrite
      .update(agentReputation)
      .set(updates)
      .where(eq(agentReputation.id, agent.id));

    // Recalculate score
    const updatedAgent = await this.recalculateReputation(
      agent.agentIdentifier,
    );

    // Log moderation event
    await dbWrite.insert(agentModerationEvents).values({
      agentReputationId: agent.id,
      eventType: "violation",
      flagType: event.flagType,
      severity: event.severity,
      description: event.description,
      evidence: event.evidence,
      detectedBy: event.detectedBy,
      moderationScores: event.moderationScores,
      reputationChange: -penalty,
      previousScore,
      newScore: updatedAgent.reputationScore,
    });

    logger.warn("[AgentReputation] Recorded violation", {
      agentIdentifier: event.agentIdentifier,
      flagType: event.flagType,
      severity: event.severity,
      newScore: updatedAgent.reputationScore,
      status: updatedAgent.status,
    });

    return updatedAgent;
  }

  /**
   * Admin flag an agent
   */
  async flagAgent(params: AdminFlagParams): Promise<AgentReputation> {
    const agent = await this.getOrCreateAgent({
      agentIdentifier: params.agentIdentifier,
    });
    const previousScore = agent.reputationScore;

    const now = new Date();
    const updates: Partial<AgentReputation> = {
      flagCount: agent.flagCount + 1,
      isFlaggedByAdmin: true,
      flagReason: params.reason,
      flaggedAt: now,
      flaggedBy: params.adminUserId,
      updatedAt: now,
    };

    if (params.autoBan) {
      updates.status = "banned";
      updates.bannedAt = now;
      updates.bannedBy = params.adminUserId;
      updates.banReason = params.reason;
    }

    await dbWrite
      .update(agentReputation)
      .set(updates)
      .where(eq(agentReputation.id, agent.id));

    // Recalculate
    const updatedAgent = await this.recalculateReputation(
      agent.agentIdentifier,
    );

    // Log event
    await dbWrite.insert(agentModerationEvents).values({
      agentReputationId: agent.id,
      eventType: "admin_flag",
      flagType: params.flagType,
      severity: params.autoBan ? "critical" : "high",
      description: params.reason,
      evidence: params.evidence,
      detectedBy: "admin",
      adminUserId: params.adminUserId,
      actionTaken: params.autoBan ? "banned" : "flagged",
      previousScore,
      newScore: updatedAgent.reputationScore,
    });

    logger.warn("[AgentReputation] Admin flagged agent", {
      agentIdentifier: params.agentIdentifier,
      flagType: params.flagType,
      reason: params.reason,
      banned: params.autoBan,
    });

    return updatedAgent;
  }

  /**
   * Ban an agent
   */
  async banAgent(params: {
    agentIdentifier: string;
    reason: string;
    adminUserId: string;
    permanent?: boolean;
  }): Promise<AgentReputation> {
    const agent = await this.getOrCreateAgent({
      agentIdentifier: params.agentIdentifier,
    });

    const now = new Date();
    const banExpiresAt = params.permanent
      ? null
      : new Date(
          now.getTime() + config.defaults.banDurationDays * 24 * 60 * 60 * 1000,
        );

    await dbWrite
      .update(agentReputation)
      .set({
        status: "banned",
        bannedAt: now,
        bannedBy: params.adminUserId,
        banReason: params.reason,
        banExpiresAt,
        reputationScore: 0,
        trustLevel: "untrusted",
        updatedAt: now,
      })
      .where(eq(agentReputation.id, agent.id));

    // Log event
    await dbWrite.insert(agentModerationEvents).values({
      agentReputationId: agent.id,
      eventType: "ban",
      severity: "critical",
      description: params.reason,
      detectedBy: "admin",
      adminUserId: params.adminUserId,
      actionTaken: params.permanent ? "permanent_ban" : "temporary_ban",
      previousScore: agent.reputationScore,
      newScore: 0,
    });

    logger.warn("[AgentReputation] Agent banned", {
      agentIdentifier: params.agentIdentifier,
      reason: params.reason,
      permanent: params.permanent,
    });

    const updated = await this.getAgent(params.agentIdentifier);
    return updated!;
  }

  /**
   * Unban an agent
   */
  async unbanAgent(params: {
    agentIdentifier: string;
    adminUserId: string;
    notes?: string;
  }): Promise<AgentReputation> {
    const agent = await this.getAgent(params.agentIdentifier);
    if (!agent) {
      throw new Error(`Agent not found: ${params.agentIdentifier}`);
    }

    await dbWrite
      .update(agentReputation)
      .set({
        status: "warned", // Reset to warned, not clean
        bannedAt: null,
        bannedBy: null,
        banReason: null,
        banExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(agentReputation.id, agent.id));

    // Recalculate
    const updatedAgent = await this.recalculateReputation(
      params.agentIdentifier,
    );

    // Log event
    await dbWrite.insert(agentModerationEvents).values({
      agentReputationId: agent.id,
      eventType: "unban",
      severity: "low",
      detectedBy: "admin",
      adminUserId: params.adminUserId,
      adminNotes: params.notes,
      actionTaken: "unbanned",
      previousScore: 0,
      newScore: updatedAgent.reputationScore,
    });

    logger.info("[AgentReputation] Agent unbanned", {
      agentIdentifier: params.agentIdentifier,
    });

    return updatedAgent;
  }

  // ===== Reputation Calculation =====

  /**
   * Recalculate reputation score for an agent
   */
  async recalculateReputation(
    agentIdentifier: string,
  ): Promise<AgentReputation> {
    const agent = await this.getAgent(agentIdentifier);
    if (!agent) {
      throw new Error(`Agent not found: ${agentIdentifier}`);
    }

    // If banned, score is 0
    if (agent.status === "banned") {
      await dbWrite
        .update(agentReputation)
        .set({
          reputationScore: 0,
          trustLevel: "untrusted",
          updatedAt: new Date(),
        })
        .where(eq(agentReputation.id, agent.id));

      return { ...agent, reputationScore: 0, trustLevel: "untrusted" };
    }

    const scoring = config.scoring;
    let score = scoring.baseScore;

    // === Positive factors ===

    // Payment reputation
    const paymentPoints = Math.min(
      agent.totalDeposited *
        scoring.positiveFactors.paymentDeposit.pointsPerDollar,
      scoring.positiveFactors.paymentDeposit.maxPoints,
    );
    score += paymentPoints;

    // Request reputation
    const requestPoints = Math.min(
      agent.successfulRequests *
        scoring.positiveFactors.successfulRequest.pointsPerRequest,
      scoring.positiveFactors.successfulRequest.maxPoints,
    );
    score += requestPoints;

    // Account age
    const ageInDays =
      (Date.now() - agent.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24);
    const agePoints = Math.min(
      ageInDays * scoring.positiveFactors.accountAge.pointsPerDay,
      scoring.positiveFactors.accountAge.maxPoints,
    );
    score += agePoints;

    // === Negative factors ===

    // CSAM violations (most severe)
    if (agent.csamViolations > 0) {
      score = 0; // Instant zero
    }

    // Self-harm violations
    score -=
      agent.selfHarmViolations *
      scoring.negativeFactors.selfHarmViolation.pointsDeducted;

    // Other violations
    score -=
      agent.otherViolations *
      scoring.negativeFactors.spamViolation.pointsDeducted;

    // Admin flags
    if (agent.isFlaggedByAdmin) {
      score -= scoring.negativeFactors.adminFlag.defaultPoints;
    }

    // Failed requests penalty
    const failedRequestPenalty = Math.min(
      agent.failedRequests *
        scoring.negativeFactors.failedRequest.pointsPerRequest,
      scoring.negativeFactors.failedRequest.maxPoints,
    );
    score -= failedRequestPenalty;

    // Clamp score
    score = Math.max(scoring.minScore, Math.min(scoring.maxScore, score));

    // Determine trust level
    const trustLevel = this.getTrustLevelForScore(score);

    // Calculate confidence (more data = higher confidence)
    const dataPoints =
      agent.paymentCount + agent.totalRequests + agent.totalViolations;
    const confidenceScore = Math.min(100, dataPoints / 10);

    // Update agent
    await dbWrite
      .update(agentReputation)
      .set({
        reputationScore: score,
        trustLevel,
        confidenceScore,
        updatedAt: new Date(),
      })
      .where(eq(agentReputation.id, agent.id));

    const updated = await this.getAgent(agentIdentifier);
    return updated!;
  }

  /**
   * Get trust level for a given score
   */
  private getTrustLevelForScore(score: number): TrustLevel {
    const levels = config.trustLevels;

    if (score <= levels.untrusted.maxScore) return "untrusted";
    if (score <= levels.low.maxScore) return "low";
    if (score <= levels.neutral.maxScore) return "neutral";
    if (score <= levels.trusted.maxScore) return "trusted";
    return "verified";
  }

  // ===== Access Control =====

  /**
   * Check if agent should be blocked
   */
  async shouldBlockAgent(agentIdentifier: string): Promise<boolean> {
    const agent = await this.getAgent(agentIdentifier);
    if (!agent) return false;

    // Check if banned
    if (agent.status === "banned") {
      // Check if ban has expired
      if (agent.banExpiresAt && agent.banExpiresAt < new Date()) {
        // Auto-unban (but keep warned status)
        await dbWrite
          .update(agentReputation)
          .set({
            status: "warned",
            bannedAt: null,
            banReason: null,
            banExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(agentReputation.id, agent.id));
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Get rate limit for agent based on trust level
   */
  getRateLimitForTrustLevel(trustLevel: TrustLevel): number {
    return config.trustLevels[trustLevel]?.maxRequestsPerMinute ?? 50;
  }

  // ===== Admin Queries =====

  /**
   * Get agents flagged for review
   */
  async getAgentsFlaggedForReview(): Promise<AgentReputation[]> {
    return dbRead.query.agentReputation.findMany({
      where: sql`${agentReputation.isFlaggedByAdmin} = true OR ${agentReputation.totalViolations} >= 3 OR ${agentReputation.reputationScore} < 30`,
      orderBy: [desc(agentReputation.lastViolationAt)],
    });
  }

  /**
   * Get banned agents
   */
  async getBannedAgents(): Promise<AgentReputation[]> {
    return dbRead.query.agentReputation.findMany({
      where: eq(agentReputation.status, "banned"),
      orderBy: [desc(agentReputation.bannedAt)],
    });
  }

  /**
   * Get moderation events for an agent
   */
  async getAgentModerationEvents(
    agentIdentifier: string,
  ): Promise<AgentModerationEvent[]> {
    const agent = await this.getAgent(agentIdentifier);
    if (!agent) return [];

    return dbRead.query.agentModerationEvents.findMany({
      where: eq(agentModerationEvents.agentReputationId, agent.id),
      orderBy: [desc(agentModerationEvents.createdAt)],
    });
  }

  /**
   * Get reputation leaderboard (top agents)
   */
  async getReputationLeaderboard(limit = 50): Promise<AgentReputation[]> {
    return dbRead.query.agentReputation.findMany({
      where: sql`${agentReputation.status} != 'banned'`,
      orderBy: [desc(agentReputation.reputationScore)],
      limit,
    });
  }

  /**
   * Get agents with low reputation (for monitoring)
   */
  async getLowReputationAgents(
    scoreThreshold = 30,
  ): Promise<AgentReputation[]> {
    return dbRead.query.agentReputation.findMany({
      where: and(
        sql`${agentReputation.reputationScore} < ${scoreThreshold}`,
        sql`${agentReputation.status} != 'banned'`,
      ),
      orderBy: [agentReputation.reputationScore],
    });
  }
}

export const agentReputationService = new AgentReputationService();
