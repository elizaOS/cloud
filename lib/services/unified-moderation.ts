/**
 * Content Moderation Service
 * Handles all content types: images, text, agents, domains
 *
 * Features:
 * - Exponential backoff with jitter for rate limiting
 * - Smart pre-filtering (size, format, hash caching)
 * - Strike system with escalating punishments
 * - OpenAI omni-moderation for images and text
 */

import { createHash } from "node:crypto";
import { db } from "@/db";
import { eq, and, lt, isNull, or, desc, sql } from "drizzle-orm";
import {
  contentModerationItems,
  userModerationStrikes,
  type ContentModerationItem,
  type ModerationFlag,
  type ModerationScores,
} from "@/db/schemas/content-moderation";
import { users } from "@/db/schemas/users";
import { logger } from "@/lib/utils/logger";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;

// Exponential backoff config
const BACKOFF = {
  baseDelayMs: 60_000, // 1 minute
  maxDelayMs: 86_400_000, // 24 hours
  jitterFactor: 0.2,
  maxAttempts: 10,
};

// Rate limiting with exponential backoff
const RATE_STATE = {
  lastCallAt: 0,
  consecutiveFailures: 0,
  backoffUntil: 0,
};

// Pre-filter config
const FILTER = {
  minImageSizeBytes: 10_000, // 10KB
  skipFormats: [".ico", ".svg"],
  skipMimeTypes: ["image/x-icon", "image/svg+xml"],
};

// Thresholds for flagging
const THRESHOLDS: Record<
  string,
  { threshold: number; severity: ModerationFlag["severity"] }
> = {
  "sexual/minors": { threshold: 0.1, severity: "critical" },
  "self-harm/instructions": { threshold: 0.3, severity: "high" },
  "self-harm/intent": { threshold: 0.4, severity: "high" },
  "self-harm": { threshold: 0.5, severity: "medium" },
  "violence/graphic": { threshold: 0.7, severity: "medium" },
  "illicit/violent": { threshold: 0.5, severity: "high" },
};

// Strike escalation
const STRIKE_ACTIONS: Record<number, string> = {
  1: "warning",
  2: "warning",
  3: "content_deleted",
  4: "content_deleted",
  5: "suspended",
};

type ContentType = "image" | "text" | "agent" | "domain" | "file";
type Severity = "low" | "medium" | "high" | "critical";

const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

function calculateBackoff(attempts: number): number {
  const delay = Math.min(
    BACKOFF.baseDelayMs * Math.pow(2, attempts),
    BACKOFF.maxDelayMs,
  );
  const jitter = delay * BACKOFF.jitterFactor * (Math.random() - 0.5);
  return delay + jitter;
}

function shouldSkipImage(
  sizeBytes: number,
  mimeType?: string,
  url?: string,
): boolean {
  if (sizeBytes < FILTER.minImageSizeBytes) return true;
  if (mimeType && FILTER.skipMimeTypes.includes(mimeType)) return true;
  if (url) {
    const ext = url.split(".").pop()?.toLowerCase();
    if (ext && FILTER.skipFormats.includes(`.${ext}`)) return true;
  }
  return false;
}

function maxSeverity(flags: ModerationFlag[]): Severity {
  const order: Severity[] = ["low", "medium", "high", "critical"];
  return flags.reduce<Severity>(
    (max, f) =>
      order.indexOf(f.severity) > order.indexOf(max) ? f.severity : max,
    "low",
  );
}

interface OpenAIModerationResult {
  flagged: boolean;
  scores: ModerationScores;
  flags: ModerationFlag[];
}

async function callOpenAIModeration(
  input:
    | { type: "text"; text: string }
    | { type: "image_url"; url: string }
    | { type: "image_base64"; data: string; mimeType: string },
): Promise<OpenAIModerationResult | { error: string }> {
  // Check rate limit backoff
  if (Date.now() < RATE_STATE.backoffUntil) {
    return { error: "rate_limited" };
  }

  if (!OPENAI_API_KEY) return { error: "no_key" };

  let inputPayload: unknown;
  if (input.type === "text") {
    inputPayload = input.text.slice(0, 32000);
  } else if (input.type === "image_url") {
    inputPayload = [{ type: "image_url", image_url: { url: input.url } }];
  } else {
    inputPayload = [
      {
        type: "image_url",
        image_url: { url: `data:${input.mimeType};base64,${input.data}` },
      },
    ];
  }

  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: inputPayload,
    }),
  });

  RATE_STATE.lastCallAt = Date.now();

  if (!res.ok) {
    RATE_STATE.consecutiveFailures++;
    if (res.status === 429) {
      RATE_STATE.backoffUntil =
        Date.now() + calculateBackoff(RATE_STATE.consecutiveFailures);
      logger.warn("[Moderation] Rate limited, backing off", {
        until: new Date(RATE_STATE.backoffUntil).toISOString(),
        failures: RATE_STATE.consecutiveFailures,
      });
    }
    return { error: `api_${res.status}` };
  }

  RATE_STATE.consecutiveFailures = 0;

  const data = await res.json();
  const result = data.results?.[0];
  if (!result?.category_scores) return { error: "bad_response" };

  const scores = result.category_scores as ModerationScores;
  const flags: ModerationFlag[] = [];

  for (const [category, config] of Object.entries(THRESHOLDS)) {
    const score = scores[category];
    if (score !== undefined && score >= config.threshold) {
      flags.push({
        type: categoryToType(category),
        severity: config.severity,
        confidence: score,
        source: "openai",
        description: category,
      });
    }
  }

  return {
    flagged: flags.length > 0,
    scores,
    flags,
  };
}

function categoryToType(category: string): ModerationFlag["type"] {
  if (category.includes("sexual/minors")) return "csam";
  if (category.includes("self-harm")) return "self_harm";
  if (category.includes("violence")) return "violence";
  if (category.includes("harassment")) return "harassment";
  if (category.includes("illicit")) return "illegal";
  return "other";
}

export interface ScanResult {
  status: "clean" | "flagged" | "deleted" | "skipped" | "error";
  flags: ModerationFlag[];
  confidence: number;
  strikeRecorded: boolean;
  action?: string;
  error?: string;
}

export interface ScanInput {
  contentType: ContentType;
  sourceTable: string;
  sourceId: string;
  organizationId?: string;
  userId?: string;
  isPublic: boolean;
  contentUrl?: string;
  contentData?: Buffer | string;
  contentMimeType?: string;
  contentSizeBytes?: number;
}

class ContentModerationService {
  /**
   * Scan content and record result
   */
  async scan(input: ScanInput): Promise<ScanResult> {
    const {
      contentType,
      sourceTable,
      sourceId,
      organizationId,
      userId,
      isPublic,
      contentUrl,
      contentData,
      contentMimeType,
      contentSizeBytes,
    } = input;

    // Check if already scanned
    const existing = await db.query.contentModerationItems.findFirst({
      where: and(
        eq(contentModerationItems.sourceTable, sourceTable),
        eq(contentModerationItems.sourceId, sourceId),
      ),
    });

    // Compute hash for caching
    const contentHash = contentData
      ? hash(contentData)
      : contentUrl
        ? hash(contentUrl)
        : undefined;

    // If already scanned with same hash, skip
    if (
      existing &&
      existing.contentHash === contentHash &&
      existing.status !== "pending"
    ) {
      return {
        status: "skipped",
        flags: existing.flags,
        confidence: existing.confidence ?? 0,
        strikeRecorded: false,
      };
    }

    // Pre-filter for images
    if (contentType === "image") {
      const size =
        contentSizeBytes ??
        (contentData
          ? typeof contentData === "string"
            ? contentData.length
            : contentData.length
          : 0);
      if (shouldSkipImage(size, contentMimeType, contentUrl)) {
        await this.upsertItem(
          input,
          existing,
          contentHash,
          "clean",
          [],
          1,
          undefined,
          undefined,
        );
        return {
          status: "clean",
          flags: [],
          confidence: 1,
          strikeRecorded: false,
        };
      }
    }

    // Check backoff for private content
    if (!isPublic && existing) {
      const now = new Date();
      if (existing.nextScanAt && existing.nextScanAt > now) {
        return {
          status: "skipped",
          flags: existing.flags,
          confidence: existing.confidence ?? 0,
          strikeRecorded: false,
        };
      }
    }

    // Call OpenAI moderation
    let modResult: OpenAIModerationResult | { error: string };

    if (contentType === "image") {
      if (contentData) {
        const base64 =
          typeof contentData === "string"
            ? contentData
            : contentData.toString("base64");
        modResult = await callOpenAIModeration({
          type: "image_base64",
          data: base64,
          mimeType: contentMimeType ?? "image/jpeg",
        });
      } else if (contentUrl) {
        modResult = await callOpenAIModeration({
          type: "image_url",
          url: contentUrl,
        });
      } else {
        return {
          status: "error",
          flags: [],
          confidence: 0,
          strikeRecorded: false,
          error: "no_content",
        };
      }
    } else if (contentType === "text" || contentType === "agent") {
      const text =
        typeof contentData === "string"
          ? contentData
          : (contentData?.toString() ?? "");
      modResult = await callOpenAIModeration({ type: "text", text });
    } else {
      // Domain/file - treat as text if we have content
      if (contentData) {
        const text =
          typeof contentData === "string"
            ? contentData
            : contentData.toString();
        modResult = await callOpenAIModeration({ type: "text", text });
      } else {
        modResult = { error: "no_content" };
      }
    }

    if ("error" in modResult) {
      // On error, schedule backoff for private content
      if (!isPublic) {
        const attempts = (existing?.scanAttempts ?? 0) + 1;
        const nextScan = new Date(Date.now() + calculateBackoff(attempts));
        await this.upsertItem(
          input,
          existing,
          contentHash,
          "pending",
          [],
          0,
          undefined,
          undefined,
          attempts,
          nextScan,
        );
      }
      return {
        status: "error",
        flags: [],
        confidence: 0,
        strikeRecorded: false,
        error: modResult.error,
      };
    }

    // Determine status and action
    const severity = maxSeverity(modResult.flags);
    let status: "clean" | "flagged" | "deleted" = "clean";
    let action: string | undefined;
    let strikeRecorded = false;

    if (modResult.flagged) {
      if (severity === "critical" || severity === "high") {
        status = "deleted";
        action = "content_deleted";
      } else {
        status = "flagged";
        action = "warning";
      }

      // Record strike if we have a user
      if (userId) {
        strikeRecorded = await this.recordStrike(
          userId,
          input,
          modResult.flags,
          action,
        );
      }
    }

    // Save result
    const confidence =
      modResult.flags.length > 0
        ? modResult.flags.reduce((max, f) => Math.max(max, f.confidence), 0)
        : 1;
    await this.upsertItem(
      input,
      existing,
      contentHash,
      status,
      modResult.flags,
      confidence,
      "omni-moderation-latest",
      modResult.scores,
    );

    return {
      status,
      flags: modResult.flags,
      confidence,
      strikeRecorded,
      action,
    };
  }

  private async upsertItem(
    input: ScanInput,
    existing: ContentModerationItem | null,
    contentHash: string | undefined,
    status:
      | "pending"
      | "scanning"
      | "clean"
      | "flagged"
      | "suspended"
      | "deleted"
      | "reviewed",
    flags: ModerationFlag[],
    confidence: number,
    aiModel?: string,
    aiScores?: ModerationScores,
    scanAttempts?: number,
    nextScanAt?: Date,
  ): Promise<void> {
    if (existing) {
      await db
        .update(contentModerationItems)
        .set({
          contentHash,
          status,
          flags,
          confidence,
          aiModel,
          aiScores,
          lastScannedAt: new Date(),
          scanAttempts: scanAttempts ?? existing.scanAttempts,
          nextScanAt,
        })
        .where(eq(contentModerationItems.id, existing.id));
    } else {
      await db.insert(contentModerationItems).values({
        contentType: input.contentType,
        sourceTable: input.sourceTable,
        sourceId: input.sourceId,
        organizationId: input.organizationId,
        userId: input.userId,
        isPublic: input.isPublic,
        contentUrl: input.contentUrl,
        contentHash,
        contentSizeBytes: input.contentSizeBytes
          ? BigInt(input.contentSizeBytes)
          : undefined,
        status,
        flags,
        confidence,
        aiModel,
        aiScores,
        lastScannedAt: new Date(),
        scanAttempts: scanAttempts ?? 1,
        nextScanAt,
      });
    }
  }

  private async recordStrike(
    userId: string,
    input: ScanInput,
    flags: ModerationFlag[],
    actionTaken: string,
  ): Promise<boolean> {
    const severity = maxSeverity(flags);

    await db.insert(userModerationStrikes).values({
      userId,
      reason: flags.map((f) => f.description ?? f.type).join(", "),
      severity,
      contentType: input.contentType,
      contentPreview: input.contentUrl?.slice(0, 200) ?? "Content deleted",
      flags,
      actionTaken,
    });

    logger.warn("[Moderation] Strike recorded", {
      userId,
      severity,
      action: actionTaken,
    });
    return true;
  }

  /**
   * Get user risk profile for admin UI
   */
  async getUserRiskProfile(userId: string): Promise<{
    totalStrikes: number;
    criticalStrikes: number;
    recentStrikes: UserModerationStrike[];
    riskLevel: "low" | "medium" | "high" | "critical";
    nextAction: string;
  }> {
    const strikes = await db.query.userModerationStrikes.findMany({
      where: eq(userModerationStrikes.userId, userId),
      orderBy: [desc(userModerationStrikes.createdAt)],
    });

    const totalStrikes = strikes.length;
    const criticalStrikes = strikes.filter(
      (s) => s.severity === "critical",
    ).length;
    const recentStrikes = strikes.slice(0, 10);

    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (criticalStrikes > 0) riskLevel = "critical";
    else if (totalStrikes >= 5) riskLevel = "high";
    else if (totalStrikes >= 2) riskLevel = "medium";

    const nextAction = STRIKE_ACTIONS[totalStrikes + 1] ?? "banned";

    return {
      totalStrikes,
      criticalStrikes,
      recentStrikes,
      riskLevel,
      nextAction,
    };
  }

  /**
   * Get pending items for review
   */
  async getPendingReview(limit = 50): Promise<ContentModerationItem[]> {
    return db.query.contentModerationItems.findMany({
      where: eq(contentModerationItems.status, "flagged"),
      orderBy: [desc(contentModerationItems.createdAt)],
      limit,
    });
  }

  /**
   * Get items needing scan (private content with passed backoff)
   */
  async getItemsNeedingScan(limit = 100): Promise<ContentModerationItem[]> {
    const now = new Date();
    return db.query.contentModerationItems.findMany({
      where: and(
        eq(contentModerationItems.status, "pending"),
        or(
          isNull(contentModerationItems.nextScanAt),
          lt(contentModerationItems.nextScanAt, now),
        ),
        lt(contentModerationItems.scanAttempts, BACKOFF.maxAttempts),
      ),
      orderBy: [contentModerationItems.nextScanAt],
      limit,
    });
  }

  /**
   * Mark item as reviewed
   */
  async reviewItem(
    itemId: string,
    reviewerId: string,
    decision: "confirm" | "dismiss" | "escalate",
    notes?: string,
  ): Promise<void> {
    const newStatus =
      decision === "dismiss"
        ? "clean"
        : decision === "confirm"
          ? "deleted"
          : "flagged";

    await db
      .update(contentModerationItems)
      .set({
        status: newStatus,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewDecision: decision,
        reviewNotes: notes,
      })
      .where(eq(contentModerationItems.id, itemId));

    logger.info("[Moderation] Item reviewed", { itemId, decision, reviewerId });
  }

  /**
   * Get dashboard stats
   */
  async getStats(): Promise<{
    pending: number;
    flagged: number;
    deleted: number;
    clean: number;
    byType: Record<string, number>;
  }> {
    const stats = await db
      .select({
        status: contentModerationItems.status,
        contentType: contentModerationItems.contentType,
        count: sql<number>`count(*)::int`,
      })
      .from(contentModerationItems)
      .groupBy(
        contentModerationItems.status,
        contentModerationItems.contentType,
      );

    const result = {
      pending: 0,
      flagged: 0,
      deleted: 0,
      clean: 0,
      byType: {} as Record<string, number>,
    };

    for (const row of stats) {
      if (row.status === "pending") result.pending += row.count;
      if (row.status === "flagged") result.flagged += row.count;
      if (row.status === "deleted") result.deleted += row.count;
      if (row.status === "clean") result.clean += row.count;
      result.byType[row.contentType] =
        (result.byType[row.contentType] ?? 0) + row.count;
    }

    return result;
  }

  /**
   * Get users with strikes
   */
  async getUsersWithStrikes(limit = 50): Promise<
    Array<{
      userId: string;
      email?: string;
      strikeCount: number;
      lastStrikeAt: Date;
      riskLevel: "low" | "medium" | "high" | "critical";
    }>
  > {
    const result = await db
      .select({
        userId: userModerationStrikes.userId,
        email: users.email,
        strikeCount: sql<number>`count(*)::int`,
        lastStrikeAt: sql<Date>`max(${userModerationStrikes.createdAt})`,
        criticalCount: sql<number>`count(*) filter (where ${userModerationStrikes.severity} = 'critical')::int`,
      })
      .from(userModerationStrikes)
      .leftJoin(users, eq(userModerationStrikes.userId, users.id))
      .groupBy(userModerationStrikes.userId, users.email)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return result.map((r) => ({
      userId: r.userId,
      email: r.email ?? undefined,
      strikeCount: r.strikeCount,
      lastStrikeAt: r.lastStrikeAt,
      riskLevel:
        r.criticalCount > 0
          ? "critical"
          : r.strikeCount >= 5
            ? "high"
            : r.strikeCount >= 2
              ? "medium"
              : "low",
    }));
  }
}

// Import type for external use
type UserModerationStrike = typeof userModerationStrikes.$inferSelect;

export const contentModerationService = new ContentModerationService();

// Export types for consumers
export type {
  ContentType,
  Severity,
  ModerationFlag,
  ModerationScores,
  ContentModerationItem,
};

// Export constants for testing and configuration
export const MODERATION_CONFIG = {
  THRESHOLDS,
  STRIKE_ACTIONS,
  FILTER,
  BACKOFF,
} as const;

// Helper to validate scan input
export function validateScanInput(input: Partial<ScanInput>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input.contentType) errors.push("contentType is required");
  else if (
    !["image", "text", "agent", "domain", "file"].includes(input.contentType)
  ) {
    errors.push(`Invalid contentType: ${input.contentType}`);
  }

  if (!input.sourceTable) errors.push("sourceTable is required");
  if (!input.sourceId) errors.push("sourceId is required");
  if (input.isPublic === undefined) errors.push("isPublic is required");

  if (input.contentType === "image") {
    if (!input.contentUrl && !input.contentData) {
      errors.push("Image content requires contentUrl or contentData");
    }
  }

  return { valid: errors.length === 0, errors };
}

// Quick scan helper for inline moderation (does not persist to DB)
export async function quickScan(
  type: ContentType,
  content: string | Buffer,
): Promise<{
  safe: boolean;
  flags: ModerationFlag[];
  severity: Severity;
  error?: string;
}> {
  // Call OpenAI directly without DB persistence
  let modResult: OpenAIModerationResult | { error: string };

  if (type === "image") {
    const base64 =
      typeof content === "string" ? content : content.toString("base64");
    modResult = await callOpenAIModeration({
      type: "image_base64",
      data: base64,
      mimeType: "image/jpeg",
    });
  } else {
    const text = typeof content === "string" ? content : content.toString();
    modResult = await callOpenAIModeration({ type: "text", text });
  }

  if ("error" in modResult) {
    return { safe: false, flags: [], severity: "low", error: modResult.error };
  }

  return {
    safe: !modResult.flagged,
    flags: modResult.flags,
    severity: modResult.flags.length > 0 ? maxSeverity(modResult.flags) : "low",
  };
}
