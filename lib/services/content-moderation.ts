/**
 * Content Moderation Service
 *
 * Two-fold auto-moderation system:
 * 1. First layer: Keyword trigger using expletives package (fast, sync)
 * 2. Second layer: OpenAI Moderation API for serious violations (async, parallel)
 *
 * IMPORTANT: This runs async and does NOT block generation responses.
 * Violations are tracked and escalated (refuse → warn → flag for ban).
 *
 * We only care about: sexual/minors and self-harm categories.
 */

import { hasBadWords, minimalBadWordsArray } from "expletives";
import { logger } from "@/lib/utils/logger";

// OpenAI Moderation API types
interface ModerationCategory {
  "sexual": boolean;
  "sexual/minors": boolean;
  "harassment": boolean;
  "harassment/threatening": boolean;
  "hate": boolean;
  "hate/threatening": boolean;
  "illicit": boolean;
  "illicit/violent": boolean;
  "self-harm": boolean;
  "self-harm/intent": boolean;
  "self-harm/instructions": boolean;
  "violence": boolean;
  "violence/graphic": boolean;
}

interface ModerationCategoryScores {
  "sexual": number;
  "sexual/minors": number;
  "harassment": number;
  "harassment/threatening": number;
  "hate": number;
  "hate/threatening": number;
  "illicit": number;
  "illicit/violent": number;
  "self-harm": number;
  "self-harm/intent": number;
  "self-harm/instructions": number;
  "violence": number;
  "violence/graphic": number;
}

interface ModerationResult {
  flagged: boolean;
  categories: ModerationCategory;
  category_scores: ModerationCategoryScores;
}

interface OpenAIModerationResponse {
  id: string;
  model: string;
  results: ModerationResult[];
}

/**
 * Categories we care about for legal compliance
 */
export type CriticalCategory = "sexual/minors" | "self-harm" | "self-harm/intent" | "self-harm/instructions";

/**
 * Result of async moderation check
 */
export interface AsyncModerationResult {
  /** Whether critical content was detected */
  flagged: boolean;
  /** Categories that were flagged */
  flaggedCategories: CriticalCategory[];
  /** Confidence scores for flagged categories */
  scores: Partial<Record<CriticalCategory, number>>;
  /** Raw response from OpenAI */
  raw?: ModerationResult;
}

/**
 * User violation record for escalation tracking
 */
export interface ModerationViolation {
  userId: string;
  roomId?: string;
  messageText: string;
  categories: CriticalCategory[];
  scores: Partial<Record<CriticalCategory, number>>;
  timestamp: Date;
  action: "refused" | "warned" | "flagged_for_ban";
}

/**
 * Escalation thresholds
 */
const THRESHOLDS = {
  // Score thresholds for flagging (0-1 scale)
  "sexual/minors": 0.3, // Very strict for CSAM
  "self-harm": 0.5,
  "self-harm/intent": 0.4,
  "self-harm/instructions": 0.4,
  
  // Violation counts for escalation
  WARN_AFTER_VIOLATIONS: 2,
  FLAG_FOR_BAN_AFTER_VIOLATIONS: 5,
} as const;

/**
 * Check if text contains minimal bad words that warrant deeper moderation
 */
function containsMinimalBadWords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return minimalBadWordsArray.some((word: string) =>
    lowerText.includes(word.toLowerCase())
  );
}

/**
 * Call OpenAI's free moderation endpoint
 */
async function callOpenAIModeration(text: string): Promise<AsyncModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or AI_GATEWAY_API_KEY required for content moderation");
  }

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI moderation API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as OpenAIModerationResponse;
  const result = data.results[0];

  if (!result) {
    throw new Error("OpenAI moderation API returned no results");
  }

  // Check only the categories we care about
  const flaggedCategories: CriticalCategory[] = [];
  const scores: Partial<Record<CriticalCategory, number>> = {};

  const criticalCategories: CriticalCategory[] = [
    "sexual/minors",
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",
  ];

  for (const category of criticalCategories) {
    const score = result.category_scores[category];
    const threshold = THRESHOLDS[category];
    
    if (score >= threshold) {
      flaggedCategories.push(category);
      scores[category] = score;
    }
  }

  return {
    flagged: flaggedCategories.length > 0,
    flaggedCategories,
    scores,
    raw: result,
  };
}

/**
 * Content Moderation Service
 *
 * Implements async moderation that doesn't block generation:
 * 1. Fast keyword check (sync) - triggers deeper moderation
 * 2. OpenAI Moderation API (async) - runs in parallel
 * 3. Escalating responses based on violation history (stored in DB via adminService)
 */
class ContentModerationService {
  /**
   * Quick sync check if content needs async moderation
   * Use this to decide whether to trigger async moderation
   */
  needsAsyncModeration(text: string): boolean {
    return hasBadWords(text) || containsMinimalBadWords(text);
  }

  /**
   * Perform async moderation using OpenAI's moderation endpoint
   * This should be called in parallel with generation, not blocking it
   *
   * @param text - The text to moderate
   * @param userId - User ID for violation tracking
   * @param roomId - Optional room ID for context
   * @returns Moderation result with action to take
   */
  async moderateAsync(
    text: string,
    userId: string,
    roomId?: string
  ): Promise<AsyncModerationResult & { action?: "refused" | "warned" | "flagged_for_ban" }> {
    const result = await callOpenAIModeration(text);

    if (!result.flagged) {
      return result;
    }

    // Lazy import to avoid circular dependency
    const { adminService } = await import("./admin");

    // Get current violation count from DB
    const status = await adminService.getUserModerationStatus(userId);
    const currentCount = status?.totalViolations ?? 0;

    // Determine action based on history
    let action: "refused" | "warned" | "flagged_for_ban" = "refused";
    if (currentCount >= THRESHOLDS.FLAG_FOR_BAN_AFTER_VIOLATIONS) {
      action = "flagged_for_ban";
    } else if (currentCount >= THRESHOLDS.WARN_AFTER_VIOLATIONS) {
      action = "warned";
    }

    // Record the violation in DB
    await adminService.recordViolation({
      userId,
      roomId,
      messageText: text.slice(0, 500),
      categories: result.flaggedCategories,
      scores: result.scores as Record<string, number>,
      action,
    });

    return { ...result, action };
  }

  /**
   * Fire-and-forget async moderation
   * Runs moderation in background and handles violations without blocking
   *
   * @param text - The text to moderate
   * @param userId - User ID for violation tracking
   * @param roomId - Optional room ID
   * @param onViolation - Callback when violation is detected
   */
  moderateInBackground(
    text: string,
    userId: string,
    roomId?: string,
    onViolation?: (result: AsyncModerationResult & { action: "refused" | "warned" | "flagged_for_ban" }) => void
  ): void {
    // Only run async moderation if keywords suggest it's needed
    if (!this.needsAsyncModeration(text)) {
      return;
    }

    // Fire and forget - errors are logged but don't propagate
    // This is intentional: moderation should not block user experience
    this.moderateAsync(text, userId, roomId)
      .then((result) => {
        if (result.flagged && result.action && onViolation) {
          onViolation(result as AsyncModerationResult & { action: "refused" | "warned" | "flagged_for_ban" });
        }
      })
      .catch((error) => {
        // Log error but don't propagate - moderation failures should not block users
        logger.error("[ContentModeration] Background moderation failed", { 
          error: error instanceof Error ? error.message : String(error),
          userId,
          roomId,
        });
      });
  }

  /**
   * Check if user should be blocked based on violation history (from DB)
   */
  async shouldBlockUser(userId: string): Promise<boolean> {
    const { adminService } = await import("./admin");
    return adminService.shouldBlockUser(userId);
  }

  /**
   * Get violation count for a user (from DB)
   */
  async getViolationCount(userId: string): Promise<number> {
    const { adminService } = await import("./admin");
    const status = await adminService.getUserModerationStatus(userId);
    return status?.totalViolations ?? 0;
  }

  /**
   * Get recent violations for admin view (from DB)
   */
  async getRecentViolations(limit = 100): Promise<ModerationViolation[]> {
    const { adminService } = await import("./admin");
    const violations = await adminService.getRecentViolations(limit);
    return violations.map((v) => ({
      userId: v.userId,
      roomId: v.roomId ?? undefined,
      messageText: v.messageText,
      categories: v.categories as CriticalCategory[],
      scores: v.scores as Partial<Record<CriticalCategory, number>>,
      timestamp: v.createdAt,
      action: v.action as "refused" | "warned" | "flagged_for_ban",
    }));
  }

  /**
   * Get violations for a specific user (from DB)
   */
  async getUserViolations(userId: string): Promise<ModerationViolation[]> {
    const { adminService } = await import("./admin");
    const violations = await adminService.getUserViolations(userId);
    return violations.map((v) => ({
      userId: v.userId,
      roomId: v.roomId ?? undefined,
      messageText: v.messageText,
      categories: v.categories as CriticalCategory[],
      scores: v.scores as Partial<Record<CriticalCategory, number>>,
      timestamp: v.createdAt,
      action: v.action as "refused" | "warned" | "flagged_for_ban",
    }));
  }

  /**
   * Reset violation count for a user (admin action)
   */
  async resetViolations(userId: string): Promise<void> {
    const { adminService } = await import("./admin");
    await adminService.unbanUser(userId, "system");
  }

  /**
   * Get all users flagged for ban (from DB)
   */
  async getUsersFlaggedForBan(): Promise<string[]> {
    const { adminService } = await import("./admin");
    const flagged = await adminService.getUsersFlaggedForReview();
    return flagged
      .filter((u) => u.totalViolations >= THRESHOLDS.FLAG_FOR_BAN_AFTER_VIOLATIONS)
      .map((u) => u.userId);
  }

  /**
   * Fire-and-forget async moderation for external agents (ERC-8004/A2A)
   * Also records violations to the agent reputation system
   *
   * @param text - The text to moderate
   * @param userId - User ID for violation tracking
   * @param agentIdentifier - Agent identifier (chainId:tokenId or org:orgId)
   * @param roomId - Optional room ID
   * @param onViolation - Callback when violation is detected
   */
  moderateAgentInBackground(
    text: string,
    userId: string,
    agentIdentifier: string,
    roomId?: string,
    onViolation?: (result: AsyncModerationResult & { action: "refused" | "warned" | "flagged_for_ban" }) => void
  ): void {
    // Only run async moderation if keywords suggest it's needed
    if (!this.needsAsyncModeration(text)) {
      return;
    }

    // Fire and forget
    this.moderateAsync(text, userId, roomId)
      .then(async (result) => {
        if (result.flagged && result.action) {
          // Also record to agent reputation system
          const { agentReputationService } = await import("./agent-reputation");
          
          // Map moderation categories to flag types
          let flagType: "csam" | "self_harm" | "harassment" | "spam" | "other" = "other";
          let severity: "low" | "medium" | "high" | "critical" = "medium";
          
          if (result.flaggedCategories.includes("sexual/minors")) {
            flagType = "csam";
            severity = "critical";
          } else if (result.flaggedCategories.some(c => c.startsWith("self-harm"))) {
            flagType = "self_harm";
            severity = "high";
          }

          await agentReputationService.recordViolation({
            agentIdentifier,
            flagType,
            severity,
            description: `Moderation violation: ${result.flaggedCategories.join(", ")}`,
            evidence: text.slice(0, 500),
            moderationScores: result.scores as Record<string, number>,
            detectedBy: "auto",
          });

          if (onViolation) {
            onViolation(result as AsyncModerationResult & { action: "refused" | "warned" | "flagged_for_ban" });
          }
        }
      })
      .catch((error) => {
        logger.error("[ContentModeration] Agent moderation failed", { 
          error: error instanceof Error ? error.message : String(error),
          userId,
          agentIdentifier,
        });
      });
  }

  /**
   * Legacy sync moderate function - now just does keyword check
   * For blocking behavior, use moderateAsync instead
   * @deprecated Use moderateInBackground for async moderation
   */
  async moderate(text: string): Promise<{ allowed: boolean; keywordTriggered: boolean }> {
    const keywordTriggered = this.needsAsyncModeration(text);
    return {
      allowed: true, // Never block sync - let async handle it
      keywordTriggered,
    };
  }
}

export const contentModerationService = new ContentModerationService();
