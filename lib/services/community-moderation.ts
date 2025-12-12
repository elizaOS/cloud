/**
 * Community Moderation Service
 *
 * Core moderation logic for the community manager agent.
 * Handles spam detection, scam detection, link checking,
 * moderation actions, and token gate verification.
 */

import { db } from "@/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import {
  orgModerationEvents,
  orgSpamTracking,
  orgBlockedPatterns,
  orgTokenGates,
  orgMemberWallets,
  type OrgModerationEvent,
  type NewOrgModerationEvent,
  type OrgSpamTracking,
  type OrgBlockedPattern,
  type OrgTokenGate,
  type OrgMemberWallet,
  type ModerationAction,
  type ModerationEventType,
  type ModerationSeverity,
} from "@/db/schemas/org-community-moderation";
import { orgPlatformServers } from "@/db/schemas/org-platforms";
import { logger } from "@/lib/utils/logger";
import { createHash } from "crypto";

// =============================================================================
// TYPES
// =============================================================================

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
  confidence: number;
  recommendedAction?: ModerationAction;
}

export interface LinkCheckResult {
  isSafe: boolean;
  threats: string[];
  domain: string;
  confidence: number;
}

export interface PatternMatchResult {
  matched: boolean;
  pattern?: OrgBlockedPattern;
  matchedText?: string;
}

export interface ModerationCheckResult {
  shouldModerate: boolean;
  eventType?: ModerationEventType;
  severity?: ModerationSeverity;
  recommendedAction?: ModerationAction;
  reason?: string;
  confidence?: number;
  matchedPattern?: string;
}

export interface ModerationContext {
  organizationId: string;
  serverId: string;
  platformUserId: string;
  platform: "discord" | "telegram" | "slack";
  platformUsername?: string;
  channelId?: string;
  messageId?: string;
}

// Default scam patterns (can be extended via org_blocked_patterns)
const DEFAULT_SCAM_PATTERNS = [
  // Crypto scams
  /(?:send|transfer)\s*(?:eth|btc|sol|usdt|usdc)/i,
  /(?:airdrop|giveaway)\s*(?:link|claim)/i,
  /connect\s*(?:your\s*)?wallet/i,
  /claim\s*(?:your\s*)?(?:free\s*)?(?:tokens?|nft|reward)/i,
  // Fake support
  /(?:support|admin|mod)\s*(?:team|staff)/i,
  /dm\s*(?:me|us)\s*(?:for|to)\s*(?:help|support)/i,
  // Phishing indicators
  /verify\s*(?:your\s*)?(?:account|wallet)/i,
  /(?:your\s*)?(?:account|wallet)\s*(?:is\s*)?(?:suspended|locked|compromised)/i,
];

// Known scam domains (partial list - should be extended via external service)
const KNOWN_SCAM_DOMAINS = new Set([
  "discord-nitro-free.com",
  "discordgift.site",
  "steamcommunity.ru",
  "free-nitro-discord.com",
]);

// =============================================================================
// SPAM DETECTION
// =============================================================================

class SpamDetectionService {
  private readonly MESSAGE_WINDOW_MS = 60_000; // 1 minute
  private readonly DEFAULT_MAX_MESSAGES_PER_MINUTE = 10;
  private readonly DEFAULT_DUPLICATE_THRESHOLD = 3;

  async checkSpam(
    ctx: ModerationContext,
    messageContent: string,
    settings: {
      maxMessagesPerMinute?: number;
      duplicateThreshold?: number;
    } = {}
  ): Promise<SpamCheckResult> {
    const maxMessages = settings.maxMessagesPerMinute ?? this.DEFAULT_MAX_MESSAGES_PER_MINUTE;
    const duplicateThreshold = settings.duplicateThreshold ?? this.DEFAULT_DUPLICATE_THRESHOLD;

    // Get or create spam tracking record
    let tracking = await this.getSpamTracking(ctx);
    if (!tracking) {
      tracking = await this.createSpamTracking(ctx);
    }

    // Clean up old timestamps
    const now = Date.now();
    const timestamps = (tracking.message_timestamps as string[] || [])
      .filter((ts) => now - new Date(ts).getTime() < this.MESSAGE_WINDOW_MS);

    // Check rate limit
    if (timestamps.length >= maxMessages) {
      return {
        isSpam: true,
        reason: `Rate limit exceeded: ${timestamps.length} messages in 1 minute`,
        confidence: 95,
        recommendedAction: "timeout",
      };
    }

    // Check for duplicate messages
    const messageHash = this.hashMessage(messageContent);
    const recentHashes = tracking.recent_message_hashes as string[] || [];
    const duplicateCount = recentHashes.filter((h) => h === messageHash).length;

    if (duplicateCount >= duplicateThreshold) {
      return {
        isSpam: true,
        reason: `Duplicate message detected (${duplicateCount + 1} times)`,
        confidence: 90,
        recommendedAction: "delete",
      };
    }

    // Update tracking
    const updatedHashes = [...recentHashes.slice(-50), messageHash];
    const updatedTimestamps = [...timestamps, new Date().toISOString()];

    await db
      .update(orgSpamTracking)
      .set({
        recent_message_hashes: updatedHashes,
        message_timestamps: updatedTimestamps,
        updated_at: new Date(),
      })
      .where(eq(orgSpamTracking.id, tracking.id));

    return { isSpam: false, confidence: 0 };
  }

  async applyRateLimit(
    ctx: ModerationContext,
    durationMinutes: number
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

    await db
      .update(orgSpamTracking)
      .set({
        is_rate_limited: true,
        rate_limit_expires_at: expiresAt,
        rate_limit_count: sql`${orgSpamTracking.rate_limit_count} + 1`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgSpamTracking.server_id, ctx.serverId),
          eq(orgSpamTracking.platform_user_id, ctx.platformUserId),
          eq(orgSpamTracking.platform, ctx.platform)
        )
      );
  }

  async isRateLimited(ctx: ModerationContext): Promise<boolean> {
    const tracking = await this.getSpamTracking(ctx);
    if (!tracking?.is_rate_limited) return false;
    if (!tracking.rate_limit_expires_at) return false;

    if (new Date() > tracking.rate_limit_expires_at) {
      // Rate limit expired, clear it
      await db
        .update(orgSpamTracking)
        .set({
          is_rate_limited: false,
          rate_limit_expires_at: null,
          updated_at: new Date(),
        })
        .where(eq(orgSpamTracking.id, tracking.id));
      return false;
    }

    return true;
  }

  async recordViolation(ctx: ModerationContext): Promise<void> {
    await db
      .update(orgSpamTracking)
      .set({
        spam_violations_1h: sql`${orgSpamTracking.spam_violations_1h} + 1`,
        spam_violations_24h: sql`${orgSpamTracking.spam_violations_24h} + 1`,
        total_violations: sql`${orgSpamTracking.total_violations} + 1`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgSpamTracking.server_id, ctx.serverId),
          eq(orgSpamTracking.platform_user_id, ctx.platformUserId),
          eq(orgSpamTracking.platform, ctx.platform)
        )
      );
  }

  private async getSpamTracking(ctx: ModerationContext): Promise<OrgSpamTracking | null> {
    const [tracking] = await db
      .select()
      .from(orgSpamTracking)
      .where(
        and(
          eq(orgSpamTracking.server_id, ctx.serverId),
          eq(orgSpamTracking.platform_user_id, ctx.platformUserId),
          eq(orgSpamTracking.platform, ctx.platform)
        )
      )
      .limit(1);

    return tracking ?? null;
  }

  private async createSpamTracking(ctx: ModerationContext): Promise<OrgSpamTracking> {
    const [tracking] = await db
      .insert(orgSpamTracking)
      .values({
        organization_id: ctx.organizationId,
        server_id: ctx.serverId,
        platform_user_id: ctx.platformUserId,
        platform: ctx.platform,
      })
      .onConflictDoNothing()
      .returning();

    // Handle race condition - if insert failed due to conflict, fetch existing
    if (!tracking) {
      const existing = await this.getSpamTracking(ctx);
      if (!existing) {
        throw new Error("Failed to create or fetch spam tracking record");
      }
      return existing;
    }

    return tracking;
  }

  private hashMessage(content: string): string {
    // Normalize content before hashing (lowercase, remove extra whitespace)
    const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }
}

// =============================================================================
// SCAM DETECTION
// =============================================================================

class ScamDetectionService {
  async checkScam(
    content: string,
    organizationId: string,
    serverId?: string
  ): Promise<PatternMatchResult> {
    // Check default patterns first
    for (const pattern of DEFAULT_SCAM_PATTERNS) {
      const match = content.match(pattern);
      if (match) return { matched: true, matchedText: match[0] };
    }

    // Check org-specific patterns
    return this.checkPatterns(content, organizationId, serverId, "scam");
  }

  async checkPhishing(
    content: string,
    organizationId: string,
    serverId?: string
  ): Promise<PatternMatchResult> {
    return this.checkPatterns(content, organizationId, serverId, "phishing");
  }

  private async checkPatterns(
    content: string,
    organizationId: string,
    serverId: string | undefined,
    category: string
  ): Promise<PatternMatchResult> {
    const patterns = await db
      .select()
      .from(orgBlockedPatterns)
      .where(
        and(
          eq(orgBlockedPatterns.organization_id, organizationId),
          eq(orgBlockedPatterns.category, category),
          eq(orgBlockedPatterns.enabled, true),
          serverId
            ? sql`(${orgBlockedPatterns.server_id} = ${serverId} OR ${orgBlockedPatterns.server_id} IS NULL)`
            : sql`${orgBlockedPatterns.server_id} IS NULL`
        )
      );

    for (const pattern of patterns) {
      const matched = testPattern(content, pattern);
      if (matched) {
        // Increment match count
        await db
          .update(orgBlockedPatterns)
          .set({ match_count: sql`${orgBlockedPatterns.match_count} + 1`, updated_at: new Date() })
          .where(eq(orgBlockedPatterns.id, pattern.id));

        return { matched: true, pattern, matchedText: matched };
      }
    }

    return { matched: false };
  }
}

// Shared pattern testing utility
function testPattern(content: string, pattern: OrgBlockedPattern): string | null {
  const lowerContent = content.toLowerCase();
  
  switch (pattern.pattern_type) {
    case "exact":
      return lowerContent === pattern.pattern.toLowerCase() ? pattern.pattern : null;
    case "contains":
      return lowerContent.includes(pattern.pattern.toLowerCase()) ? pattern.pattern : null;
    case "regex": {
      const match = content.match(new RegExp(pattern.pattern, "i"));
      return match ? match[0] : null;
    }
    default:
      return null;
  }
}

// =============================================================================
// LINK CHECKING
// =============================================================================

class LinkCheckService {
  private readonly URL_REGEX = /https?:\/\/[^\s<>)"']+/gi;

  extractLinks(content: string): string[] {
    return content.match(this.URL_REGEX) ?? [];
  }

  async checkLinks(
    content: string,
    organizationId: string,
    settings: {
      allowedDomains?: string[];
      blockedDomains?: string[];
    } = {}
  ): Promise<LinkCheckResult[]> {
    const links = this.extractLinks(content);
    const results: LinkCheckResult[] = [];

    for (const link of links) {
      const result = await this.checkLink(link, organizationId, settings);
      results.push(result);
    }

    return results;
  }

  async checkLink(
    url: string,
    organizationId: string,
    settings: {
      allowedDomains?: string[];
      blockedDomains?: string[];
    } = {}
  ): Promise<LinkCheckResult> {
    let domain: string;
    try {
      const parsed = new URL(url);
      domain = parsed.hostname.toLowerCase();
    } catch {
      return {
        isSafe: false,
        threats: ["malformed_url"],
        domain: url,
        confidence: 100,
      };
    }

    const threats: string[] = [];

    // Check allowlist first
    if (settings.allowedDomains?.length) {
      const isAllowed = settings.allowedDomains.some(
        (d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)
      );
      if (isAllowed) {
        return { isSafe: true, threats: [], domain, confidence: 100 };
      }
    }

    // Check blocklist
    if (settings.blockedDomains?.length) {
      const isBlocked = settings.blockedDomains.some(
        (d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)
      );
      if (isBlocked) {
        threats.push("blocked_domain");
      }
    }

    // Check known scam domains
    if (KNOWN_SCAM_DOMAINS.has(domain)) {
      threats.push("known_scam_domain");
    }

    // Check org-specific blocked domains
    const blockedPatterns = await db
      .select()
      .from(orgBlockedPatterns)
      .where(
        and(
          eq(orgBlockedPatterns.organization_id, organizationId),
          eq(orgBlockedPatterns.pattern_type, "domain"),
          eq(orgBlockedPatterns.enabled, true)
        )
      );

    for (const pattern of blockedPatterns) {
      if (domain === pattern.pattern.toLowerCase() || 
          domain.endsWith(`.${pattern.pattern.toLowerCase()}`)) {
        threats.push(`blocked_pattern:${pattern.category}`);
      }
    }

    // Check for suspicious patterns in domain
    if (this.isSuspiciousDomain(domain)) {
      threats.push("suspicious_domain");
    }

    return {
      isSafe: threats.length === 0,
      threats,
      domain,
      confidence: threats.length > 0 ? 80 : 0,
    };
  }

  private isSuspiciousDomain(domain: string): boolean {
    // Check for typosquatting of common domains
    const suspiciousPatterns = [
      /disc[o0]rd/i, // discord typos
      /telegr[a@]m/i, // telegram typos
      /metamsk/i, // metamask typos
      /opensee/i, // opensea typos
      /coinb[a@]se/i, // coinbase typos
      /-official/i, // fake official sites
      /free-.*-?nitro/i, // free nitro scams
      /claim.*airdrop/i, // airdrop scams
    ];

    return suspiciousPatterns.some((p) => p.test(domain));
  }
}

// =============================================================================
// WORD FILTER
// =============================================================================

class WordFilterService {
  async checkBannedWords(
    content: string,
    organizationId: string,
    serverId?: string,
    customBanWords?: string[]
  ): Promise<PatternMatchResult> {
    const lowerContent = content.toLowerCase();

    // Check inline ban words first
    if (customBanWords?.length) {
      const matched = customBanWords.find((word) => lowerContent.includes(word.toLowerCase()));
      if (matched) return { matched: true, matchedText: matched };
    }

    // Check org-specific banned word patterns
    const patterns = await db
      .select()
      .from(orgBlockedPatterns)
      .where(
        and(
          eq(orgBlockedPatterns.organization_id, organizationId),
          eq(orgBlockedPatterns.category, "banned_word"),
          eq(orgBlockedPatterns.enabled, true),
          serverId
            ? sql`(${orgBlockedPatterns.server_id} = ${serverId} OR ${orgBlockedPatterns.server_id} IS NULL)`
            : sql`${orgBlockedPatterns.server_id} IS NULL`
        )
      );

    for (const pattern of patterns) {
      const matched = testPattern(content, pattern);
      if (matched) return { matched: true, pattern, matchedText: matched };
    }

    return { matched: false };
  }
}

// =============================================================================
// MODERATION EVENTS
// =============================================================================

class ModerationEventsService {
  async logEvent(event: NewOrgModerationEvent): Promise<OrgModerationEvent> {
    const [created] = await db
      .insert(orgModerationEvents)
      .values(event)
      .returning();

    logger.info("[CommunityModeration] Event logged", {
      eventId: created.id,
      type: created.event_type,
      action: created.action_taken,
      userId: created.platform_user_id,
    });

    return created;
  }

  async getRecentEvents(
    serverId: string,
    limit = 50
  ): Promise<OrgModerationEvent[]> {
    return await db
      .select()
      .from(orgModerationEvents)
      .where(eq(orgModerationEvents.server_id, serverId))
      .orderBy(desc(orgModerationEvents.created_at))
      .limit(limit);
  }

  async getEventsForUser(
    serverId: string,
    platformUserId: string,
    platform: string
  ): Promise<OrgModerationEvent[]> {
    return await db
      .select()
      .from(orgModerationEvents)
      .where(
        and(
          eq(orgModerationEvents.server_id, serverId),
          eq(orgModerationEvents.platform_user_id, platformUserId),
          eq(orgModerationEvents.platform, platform)
        )
      )
      .orderBy(desc(orgModerationEvents.created_at));
  }

  async getViolationCount(
    serverId: string,
    platformUserId: string,
    platform: string,
    sinceDays = 30
  ): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orgModerationEvents)
      .where(
        and(
          eq(orgModerationEvents.server_id, serverId),
          eq(orgModerationEvents.platform_user_id, platformUserId),
          eq(orgModerationEvents.platform, platform),
          gte(orgModerationEvents.created_at, since),
          eq(orgModerationEvents.false_positive, false)
        )
      );

    return Number(result?.count ?? 0);
  }

  async resolveEvent(
    eventId: string,
    resolvedBy: string,
    notes?: string,
    falsePositive = false
  ): Promise<void> {
    await db
      .update(orgModerationEvents)
      .set({
        resolved_at: new Date(),
        resolved_by: resolvedBy,
        resolution_notes: notes,
        false_positive: falsePositive,
      })
      .where(eq(orgModerationEvents.id, eventId));
  }
}

// =============================================================================
// ESCALATION
// =============================================================================

class EscalationService {
  async determineAction(
    ctx: ModerationContext,
    settings: {
      warnAfterViolations?: number;
      timeoutAfterViolations?: number;
      banAfterViolations?: number;
      defaultTimeoutMinutes?: number;
    } = {}
  ): Promise<{
    action: ModerationAction;
    durationMinutes?: number;
  }> {
    const warnAfter = settings.warnAfterViolations ?? 1;
    const timeoutAfter = settings.timeoutAfterViolations ?? 3;
    const banAfter = settings.banAfterViolations ?? 5;
    const timeoutDuration = settings.defaultTimeoutMinutes ?? 10;

    const violationCount = await moderationEventsService.getViolationCount(
      ctx.serverId,
      ctx.platformUserId,
      ctx.platform
    );

    if (violationCount >= banAfter) {
      return { action: "ban" };
    }
    if (violationCount >= timeoutAfter) {
      // Progressive timeout: double for each subsequent
      const multiplier = violationCount - timeoutAfter + 1;
      return {
        action: "timeout",
        durationMinutes: timeoutDuration * Math.min(multiplier, 6),
      };
    }
    if (violationCount >= warnAfter) {
      return { action: "warn" };
    }

    return { action: "delete" };
  }
}

// =============================================================================
// TOKEN GATE SERVICE
// =============================================================================

class TokenGateService {
  async getTokenGates(serverId: string): Promise<OrgTokenGate[]> {
    return await db
      .select()
      .from(orgTokenGates)
      .where(
        and(
          eq(orgTokenGates.server_id, serverId),
          eq(orgTokenGates.enabled, true)
        )
      )
      .orderBy(desc(orgTokenGates.priority));
  }

  async getMemberWallet(
    serverId: string,
    platformUserId: string,
    platform: string
  ): Promise<OrgMemberWallet | null> {
    const [wallet] = await db
      .select()
      .from(orgMemberWallets)
      .where(
        and(
          eq(orgMemberWallets.server_id, serverId),
          eq(orgMemberWallets.platform_user_id, platformUserId),
          eq(orgMemberWallets.platform, platform),
          eq(orgMemberWallets.is_primary, true)
        )
      )
      .limit(1);

    return wallet ?? null;
  }

  async linkWallet(params: {
    organizationId: string;
    serverId: string;
    platformUserId: string;
    platform: string;
    walletAddress: string;
    chain: OrgMemberWallet["chain"];
    verificationMethod: OrgMemberWallet["verification_method"];
    signature?: string;
  }): Promise<OrgMemberWallet> {
    const [wallet] = await db
      .insert(orgMemberWallets)
      .values({
        organization_id: params.organizationId,
        server_id: params.serverId,
        platform_user_id: params.platformUserId,
        platform: params.platform,
        wallet_address: params.walletAddress,
        chain: params.chain,
        verification_method: params.verificationMethod,
        verification_signature: params.signature,
        verified_at: new Date(),
        is_primary: true,
      })
      .onConflictDoUpdate({
        target: [
          orgMemberWallets.server_id,
          orgMemberWallets.wallet_address,
          orgMemberWallets.chain,
        ],
        set: {
          platform_user_id: params.platformUserId,
          platform: params.platform,
          verification_method: params.verificationMethod,
          verification_signature: params.signature,
          verified_at: new Date(),
          updated_at: new Date(),
        },
      })
      .returning();

    return wallet;
  }

  async updateWalletBalance(
    walletId: string,
    balance: OrgMemberWallet["last_balance"]
  ): Promise<void> {
    await db
      .update(orgMemberWallets)
      .set({
        last_balance: balance,
        last_checked_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(orgMemberWallets.id, walletId));
  }

  async updateAssignedRoles(walletId: string, roles: string[]): Promise<void> {
    await db
      .update(orgMemberWallets)
      .set({
        assigned_roles: roles,
        updated_at: new Date(),
      })
      .where(eq(orgMemberWallets.id, walletId));
  }
}

// =============================================================================
// MAIN SERVICE
// =============================================================================

class CommunityModerationService {
  readonly spam = new SpamDetectionService();
  readonly scam = new ScamDetectionService();
  readonly links = new LinkCheckService();
  readonly words = new WordFilterService();
  readonly events = new ModerationEventsService();
  readonly escalation = new EscalationService();
  readonly tokenGates = new TokenGateService();

  /**
   * Run all moderation checks on a message.
   */
  async moderateMessage(
    ctx: ModerationContext,
    content: string,
    settings: {
      antiSpamEnabled?: boolean;
      antiScamEnabled?: boolean;
      linkCheckingEnabled?: boolean;
      badWordFilterEnabled?: boolean;
      banWords?: string[];
      maxMessagesPerMinute?: number;
      duplicateThreshold?: number;
      allowedDomains?: string[];
      blockedDomains?: string[];
    } = {}
  ): Promise<ModerationCheckResult> {
    // Check if user is rate limited
    if (await this.spam.isRateLimited(ctx)) {
      return {
        shouldModerate: true,
        eventType: "spam",
        severity: "medium",
        recommendedAction: "delete",
        reason: "User is rate limited",
        confidence: 100,
      };
    }

    // Spam check
    if (settings.antiSpamEnabled !== false) {
      const spamResult = await this.spam.checkSpam(ctx, content, {
        maxMessagesPerMinute: settings.maxMessagesPerMinute,
        duplicateThreshold: settings.duplicateThreshold,
      });

      if (spamResult.isSpam) {
        return {
          shouldModerate: true,
          eventType: "spam",
          severity: "medium",
          recommendedAction: spamResult.recommendedAction,
          reason: spamResult.reason,
          confidence: spamResult.confidence,
        };
      }
    }

    // Scam check
    if (settings.antiScamEnabled !== false) {
      const scamResult = await this.scam.checkScam(
        content,
        ctx.organizationId,
        ctx.serverId
      );

      if (scamResult.matched) {
        return {
          shouldModerate: true,
          eventType: "scam",
          severity: "high",
          recommendedAction: "delete",
          reason: "Scam pattern detected",
          confidence: 90,
          matchedPattern: scamResult.matchedText,
        };
      }

      const phishingResult = await this.scam.checkPhishing(
        content,
        ctx.organizationId,
        ctx.serverId
      );

      if (phishingResult.matched) {
        return {
          shouldModerate: true,
          eventType: "phishing",
          severity: "high",
          recommendedAction: "delete",
          reason: "Phishing pattern detected",
          confidence: 85,
          matchedPattern: phishingResult.matchedText,
        };
      }
    }

    // Link check
    if (settings.linkCheckingEnabled !== false) {
      const linkResults = await this.links.checkLinks(
        content,
        ctx.organizationId,
        {
          allowedDomains: settings.allowedDomains,
          blockedDomains: settings.blockedDomains,
        }
      );

      const unsafeLink = linkResults.find((r) => !r.isSafe);
      if (unsafeLink) {
        return {
          shouldModerate: true,
          eventType: "malicious_link",
          severity: unsafeLink.threats.includes("known_scam_domain") ? "critical" : "high",
          recommendedAction: "delete",
          reason: `Unsafe link detected: ${unsafeLink.threats.join(", ")}`,
          confidence: unsafeLink.confidence,
          matchedPattern: unsafeLink.domain,
        };
      }
    }

    // Word filter
    if (settings.badWordFilterEnabled) {
      const wordResult = await this.words.checkBannedWords(
        content,
        ctx.organizationId,
        ctx.serverId,
        settings.banWords
      );

      if (wordResult.matched) {
        return {
          shouldModerate: true,
          eventType: "banned_word",
          severity: "low",
          recommendedAction: "delete",
          reason: "Banned word detected",
          confidence: 100,
          matchedPattern: wordResult.matchedText,
        };
      }
    }

    return { shouldModerate: false };
  }

  /**
   * Execute a moderation action and log it.
   */
  async executeModeration(
    ctx: ModerationContext,
    check: ModerationCheckResult,
    escalationSettings?: {
      warnAfterViolations?: number;
      timeoutAfterViolations?: number;
      banAfterViolations?: number;
      defaultTimeoutMinutes?: number;
    }
  ): Promise<{
    event: OrgModerationEvent;
    action: ModerationAction;
    durationMinutes?: number;
  }> {
    // Determine action based on escalation
    const { action, durationMinutes } = escalationSettings
      ? await this.escalation.determineAction(ctx, escalationSettings)
      : { action: check.recommendedAction ?? "delete", durationMinutes: undefined };

    // Log the event
    const event = await this.events.logEvent({
      organization_id: ctx.organizationId,
      server_id: ctx.serverId,
      platform_user_id: ctx.platformUserId,
      platform: ctx.platform,
      platform_username: ctx.platformUsername,
      event_type: check.eventType!,
      severity: check.severity!,
      message_id: ctx.messageId,
      channel_id: ctx.channelId,
      content_sample: check.reason?.slice(0, 500),
      matched_pattern: check.matchedPattern,
      action_taken: action,
      action_duration_minutes: durationMinutes,
      action_expires_at: durationMinutes
        ? new Date(Date.now() + durationMinutes * 60_000)
        : undefined,
      detected_by: "auto",
      confidence_score: check.confidence,
    });

    // Record spam violation for escalation tracking
    if (check.eventType === "spam") {
      await this.spam.recordViolation(ctx);
    }

    // Apply rate limit if action is timeout
    if (action === "timeout" && durationMinutes) {
      await this.spam.applyRateLimit(ctx, durationMinutes);
    }

    return { event, action, durationMinutes };
  }

  /**
   * Get settings link for the community manager settings UI.
   */
  getSettingsLink(organizationId: string, section?: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";
    let path = `/dashboard/org/${organizationId}/settings/agents/community-manager`;
    
    if (section) {
      path += `/${section}`;
    }

    return `${baseUrl}${path}`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const communityModerationService = new CommunityModerationService();

// For direct access to sub-services
export const spamDetectionService = communityModerationService.spam;
export const scamDetectionService = communityModerationService.scam;
export const linkCheckService = communityModerationService.links;
export const wordFilterService = communityModerationService.words;
export const moderationEventsService = communityModerationService.events;
export const escalationService = communityModerationService.escalation;
export const tokenGateService = communityModerationService.tokenGates;

