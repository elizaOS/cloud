/**
 * Community Moderation Service - spam detection, scam detection, moderation actions.
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
import { orgPlatformServers, orgPlatformConnections } from "@/db/schemas/org-platforms";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";
import { logger } from "@/lib/utils/logger";
import { linkSafetyService } from "./link-safety";
import { createHash } from "crypto";

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
  confidence: number;
  recommendedAction?: ModerationAction;
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
  matchedPatternId?: string;
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

export interface ViolationResult {
  violation: boolean;
  type: string;
  severity: number;
}

const DEFAULT_SCAM_PATTERNS = [
  /(?:send|transfer)\s*(?:eth|btc|sol|usdt|usdc)/i,
  /(?:airdrop|giveaway)\s*(?:link|claim)/i,
  /connect\s*(?:your\s*)?wallet/i,
  /claim\s*(?:your\s*)?(?:free\s*)?(?:tokens?|nft|reward)/i,
  /(?:support|admin|mod)\s*(?:team|staff)/i,
  /dm\s*(?:me|us)\s*(?:for|to)\s*(?:help|support)/i,
  /(?:your\s*)?(?:account|wallet)\s*(?:is\s*)?(?:suspended|locked|compromised)/i,
];

function testPattern(content: string, pattern: OrgBlockedPattern): string | null {
  const lowerContent = content.toLowerCase();
  switch (pattern.pattern_type) {
    case "exact": return lowerContent === pattern.pattern.toLowerCase() ? pattern.pattern : null;
    case "contains": return lowerContent.includes(pattern.pattern.toLowerCase()) ? pattern.pattern : null;
    case "regex": {
      const match = content.match(new RegExp(pattern.pattern, "i"));
      return match ? match[0] : null;
    }
    default: return null;
  }
}

/** Shared utility for picking most severe violation */
export function pickMostSevereViolation(results: (ViolationResult | null)[]): { shouldAct: boolean; type: string; severity: number } {
  const violations = results.filter((r): r is ViolationResult => r?.violation === true);
  if (violations.length === 0) return { shouldAct: false, type: "none", severity: 0 };
  return violations.reduce((prev, curr) => curr.severity > prev.severity ? curr : prev, { shouldAct: true, ...violations[0] });
}

/** Shared server settings lookup */
export async function getServerSettings(connectionId: string, serverId: string): Promise<{ serverId: string; organizationId: string; settings: CommunityModerationSettings } | null> {
  const [server] = await db
    .select({ id: orgPlatformServers.id, organization_id: orgPlatformServers.organization_id, agent_settings: orgPlatformServers.agent_settings })
    .from(orgPlatformServers)
    .innerJoin(orgPlatformConnections, eq(orgPlatformServers.connection_id, orgPlatformConnections.id))
    .where(and(eq(orgPlatformConnections.id, connectionId), eq(orgPlatformServers.server_id, serverId)))
    .limit(1);

  if (!server) return null;
  const settings = (server.agent_settings as { community_manager?: CommunityModerationSettings })?.community_manager ?? {};
  return { serverId: server.id, organizationId: server.organization_id, settings };
}

class SpamDetectionService {
  private readonly MESSAGE_WINDOW_MS = 60_000;

  async checkSpam(ctx: ModerationContext, content: string, settings: { maxMessagesPerMinute?: number; duplicateThreshold?: number } = {}): Promise<SpamCheckResult> {
    const maxMessages = settings.maxMessagesPerMinute ?? 10;
    const duplicateThreshold = settings.duplicateThreshold ?? 3;

    let tracking = await this.getSpamTracking(ctx) ?? await this.createSpamTracking(ctx);

    const now = Date.now();
    const timestamps = ((tracking.message_timestamps as string[]) || [])
      .filter((ts) => now - new Date(ts).getTime() < this.MESSAGE_WINDOW_MS);

    if (timestamps.length >= maxMessages) {
      return { isSpam: true, reason: `Rate limit: ${timestamps.length} msgs/min`, confidence: 95, recommendedAction: "timeout" };
    }

    const messageHash = createHash("sha256").update(content.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
    const recentHashes = (tracking.recent_message_hashes as string[]) || [];
    const duplicateCount = recentHashes.filter((h) => h === messageHash).length;

    if (duplicateCount >= duplicateThreshold) {
      return { isSpam: true, reason: `Duplicate (${duplicateCount + 1}x)`, confidence: 90, recommendedAction: "delete" };
    }

    await db.update(orgSpamTracking).set({
      recent_message_hashes: [...recentHashes.slice(-50), messageHash],
      message_timestamps: [...timestamps, new Date().toISOString()],
      updated_at: new Date(),
    }).where(eq(orgSpamTracking.id, tracking.id));

    return { isSpam: false, confidence: 0 };
  }

  async applyRateLimit(ctx: ModerationContext, durationMinutes: number): Promise<void> {
    await db.update(orgSpamTracking).set({
      is_rate_limited: true,
      rate_limit_expires_at: new Date(Date.now() + durationMinutes * 60_000),
      rate_limit_count: sql`${orgSpamTracking.rate_limit_count} + 1`,
      updated_at: new Date(),
    }).where(and(eq(orgSpamTracking.server_id, ctx.serverId), eq(orgSpamTracking.platform_user_id, ctx.platformUserId), eq(orgSpamTracking.platform, ctx.platform)));
  }

  async isRateLimited(ctx: ModerationContext): Promise<boolean> {
    const tracking = await this.getSpamTracking(ctx);
    if (!tracking?.is_rate_limited || !tracking.rate_limit_expires_at) return false;

    if (new Date() > tracking.rate_limit_expires_at) {
      await db.update(orgSpamTracking).set({ is_rate_limited: false, rate_limit_expires_at: null, updated_at: new Date() }).where(eq(orgSpamTracking.id, tracking.id));
      return false;
    }
    return true;
  }

  async recordViolation(ctx: ModerationContext): Promise<void> {
    await db.update(orgSpamTracking).set({
      spam_violations_1h: sql`${orgSpamTracking.spam_violations_1h} + 1`,
      spam_violations_24h: sql`${orgSpamTracking.spam_violations_24h} + 1`,
      total_violations: sql`${orgSpamTracking.total_violations} + 1`,
      updated_at: new Date(),
    }).where(and(eq(orgSpamTracking.server_id, ctx.serverId), eq(orgSpamTracking.platform_user_id, ctx.platformUserId), eq(orgSpamTracking.platform, ctx.platform)));
  }

  private async getSpamTracking(ctx: ModerationContext): Promise<OrgSpamTracking | null> {
    const [tracking] = await db.select().from(orgSpamTracking).where(and(eq(orgSpamTracking.server_id, ctx.serverId), eq(orgSpamTracking.platform_user_id, ctx.platformUserId), eq(orgSpamTracking.platform, ctx.platform))).limit(1);
    return tracking ?? null;
  }

  private async createSpamTracking(ctx: ModerationContext): Promise<OrgSpamTracking> {
    const [tracking] = await db.insert(orgSpamTracking).values({
      organization_id: ctx.organizationId,
      server_id: ctx.serverId,
      platform_user_id: ctx.platformUserId,
      platform: ctx.platform,
    }).onConflictDoNothing().returning();

    if (!tracking) {
      const existing = await this.getSpamTracking(ctx);
      if (!existing) throw new Error("Failed to create spam tracking");
      return existing;
    }
    return tracking;
  }
}

class ScamDetectionService {
  async checkScam(content: string, organizationId: string, serverId?: string): Promise<PatternMatchResult> {
    for (const pattern of DEFAULT_SCAM_PATTERNS) {
      const match = content.match(pattern);
      if (match) return { matched: true, matchedText: match[0] };
    }
    return this.checkPatterns(content, organizationId, serverId, "scam");
  }

  async checkPhishing(content: string, organizationId: string, serverId?: string): Promise<PatternMatchResult> {
    return this.checkPatterns(content, organizationId, serverId, "phishing");
  }

  private async checkPatterns(content: string, organizationId: string, serverId: string | undefined, category: string): Promise<PatternMatchResult> {
    const patterns = await db.select().from(orgBlockedPatterns).where(and(
      eq(orgBlockedPatterns.organization_id, organizationId),
      eq(orgBlockedPatterns.category, category),
      eq(orgBlockedPatterns.enabled, true),
      serverId ? sql`(${orgBlockedPatterns.server_id} = ${serverId} OR ${orgBlockedPatterns.server_id} IS NULL)` : sql`${orgBlockedPatterns.server_id} IS NULL`
    ));

    for (const pattern of patterns) {
      const matched = testPattern(content, pattern);
      if (matched) return { matched: true, pattern, matchedText: matched };
    }
    return { matched: false };
  }
}

class WordFilterService {
  async checkBannedWords(content: string, organizationId: string, serverId?: string, customBanWords?: string[]): Promise<PatternMatchResult> {
    const lowerContent = content.toLowerCase();

    if (customBanWords?.length) {
      const matched = customBanWords.find((word) => lowerContent.includes(word.toLowerCase()));
      if (matched) return { matched: true, matchedText: matched };
    }

    const patterns = await db.select().from(orgBlockedPatterns).where(and(
      eq(orgBlockedPatterns.organization_id, organizationId),
      eq(orgBlockedPatterns.category, "banned_word"),
      eq(orgBlockedPatterns.enabled, true),
      serverId ? sql`(${orgBlockedPatterns.server_id} = ${serverId} OR ${orgBlockedPatterns.server_id} IS NULL)` : sql`${orgBlockedPatterns.server_id} IS NULL`
    ));

    for (const pattern of patterns) {
      const matched = testPattern(content, pattern);
      if (matched) return { matched: true, pattern, matchedText: matched };
    }
    return { matched: false };
  }
}

class ModerationEventsService {
  async logEvent(event: NewOrgModerationEvent): Promise<OrgModerationEvent> {
    const [created] = await db.insert(orgModerationEvents).values(event).returning();
    logger.info("[Moderation] Event logged", { eventId: created.id, type: created.event_type, action: created.action_taken });
    return created;
  }

  async getRecentEvents(serverId: string, limit = 50): Promise<OrgModerationEvent[]> {
    return db.select().from(orgModerationEvents).where(eq(orgModerationEvents.server_id, serverId)).orderBy(desc(orgModerationEvents.created_at)).limit(limit);
  }

  async getEventsForUser(serverId: string, platformUserId: string, platform: string): Promise<OrgModerationEvent[]> {
    return db.select().from(orgModerationEvents).where(and(eq(orgModerationEvents.server_id, serverId), eq(orgModerationEvents.platform_user_id, platformUserId), eq(orgModerationEvents.platform, platform))).orderBy(desc(orgModerationEvents.created_at));
  }

  async getViolationCount(serverId: string, platformUserId: string, platform: string, sinceDays = 30): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 86400000);
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(orgModerationEvents).where(and(eq(orgModerationEvents.server_id, serverId), eq(orgModerationEvents.platform_user_id, platformUserId), eq(orgModerationEvents.platform, platform), gte(orgModerationEvents.created_at, since), eq(orgModerationEvents.false_positive, false)));
    return Number(result?.count ?? 0);
  }

  async resolveEvent(eventId: string, resolvedBy: string, notes?: string, falsePositive = false): Promise<void> {
    await db.update(orgModerationEvents).set({ resolved_at: new Date(), resolved_by: resolvedBy, resolution_notes: notes, false_positive: falsePositive }).where(eq(orgModerationEvents.id, eventId));
  }
}

class EscalationService {
  async determineAction(ctx: ModerationContext, settings: { warnAfterViolations?: number; timeoutAfterViolations?: number; banAfterViolations?: number; defaultTimeoutMinutes?: number } = {}): Promise<{ action: ModerationAction; durationMinutes?: number }> {
    const warnAfter = settings.warnAfterViolations ?? 1;
    const timeoutAfter = settings.timeoutAfterViolations ?? 3;
    const banAfter = settings.banAfterViolations ?? 5;
    const timeoutDuration = settings.defaultTimeoutMinutes ?? 10;

    const count = await this.events.getViolationCount(ctx.serverId, ctx.platformUserId, ctx.platform);

    if (count >= banAfter) return { action: "ban" };
    if (count >= timeoutAfter) return { action: "timeout", durationMinutes: timeoutDuration * Math.min(count - timeoutAfter + 1, 6) };
    if (count >= warnAfter) return { action: "warn" };
    return { action: "delete" };
  }

  private events = new ModerationEventsService();
}

class TokenGateService {
  async getTokenGates(serverId: string): Promise<OrgTokenGate[]> {
    return db.select().from(orgTokenGates).where(and(eq(orgTokenGates.server_id, serverId), eq(orgTokenGates.enabled, true))).orderBy(desc(orgTokenGates.priority));
  }

  async getMemberWallet(serverId: string, platformUserId: string, platform: string): Promise<OrgMemberWallet | null> {
    const [wallet] = await db.select().from(orgMemberWallets).where(and(eq(orgMemberWallets.server_id, serverId), eq(orgMemberWallets.platform_user_id, platformUserId), eq(orgMemberWallets.platform, platform), eq(orgMemberWallets.is_primary, true))).limit(1);
    return wallet ?? null;
  }

  async linkWallet(params: { organizationId: string; serverId: string; platformUserId: string; platform: string; walletAddress: string; chain: OrgMemberWallet["chain"]; verificationMethod: OrgMemberWallet["verification_method"]; signature?: string }): Promise<OrgMemberWallet> {
    const [wallet] = await db.insert(orgMemberWallets).values({
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
    }).onConflictDoUpdate({
      target: [orgMemberWallets.server_id, orgMemberWallets.wallet_address, orgMemberWallets.chain],
      set: { platform_user_id: params.platformUserId, platform: params.platform, verification_method: params.verificationMethod, verification_signature: params.signature, verified_at: new Date(), updated_at: new Date() },
    }).returning();
    return wallet;
  }

  async updateWalletBalance(walletId: string, balance: OrgMemberWallet["last_balance"]): Promise<void> {
    await db.update(orgMemberWallets).set({ last_balance: balance, last_checked_at: new Date(), updated_at: new Date() }).where(eq(orgMemberWallets.id, walletId));
  }
}

class CommunityModerationService {
  readonly spam = new SpamDetectionService();
  readonly scam = new ScamDetectionService();
  readonly words = new WordFilterService();
  readonly events = new ModerationEventsService();
  readonly escalation = new EscalationService();
  readonly tokenGates = new TokenGateService();

  /** Check links using the unified link safety service */
  async checkLinks(content: string, settings: { allowedDomains?: string[]; blockedDomains?: string[] } = {}) {
    const urls = linkSafetyService.extractUrls(content);
    if (urls.length === 0) return { hasThreat: false, threats: [] };

    for (const url of urls) {
      const domain = this.parseDomain(url);
      if (!domain) continue;

      if (settings.allowedDomains?.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))) continue;
      if (settings.blockedDomains?.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`))) {
        return { hasThreat: true, threats: ["blocked_domain"], url, domain };
      }
    }

    const results = await linkSafetyService.checkUrls(urls);
    const threat = results.find((r) => !r.safe);
    return threat ? { hasThreat: true, threats: threat.threats, url: threat.url, domain: threat.domain } : { hasThreat: false, threats: [] };
  }

  private parseDomain(url: string): string | null {
    try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
  }

  async moderateMessage(ctx: ModerationContext, content: string, settings: {
    antiSpamEnabled?: boolean; antiScamEnabled?: boolean; linkCheckingEnabled?: boolean; badWordFilterEnabled?: boolean;
    banWords?: string[]; maxMessagesPerMinute?: number; duplicateThreshold?: number; allowedDomains?: string[]; blockedDomains?: string[];
  } = {}): Promise<ModerationCheckResult> {
    if (await this.spam.isRateLimited(ctx)) {
      return { shouldModerate: true, eventType: "spam", severity: "medium", recommendedAction: "delete", reason: "Rate limited", confidence: 100 };
    }

    if (settings.antiSpamEnabled !== false) {
      const result = await this.spam.checkSpam(ctx, content, { maxMessagesPerMinute: settings.maxMessagesPerMinute, duplicateThreshold: settings.duplicateThreshold });
      if (result.isSpam) return { shouldModerate: true, eventType: "spam", severity: "medium", recommendedAction: result.recommendedAction, reason: result.reason, confidence: result.confidence };
    }

    if (settings.antiScamEnabled !== false) {
      const scamResult = await this.scam.checkScam(content, ctx.organizationId, ctx.serverId);
      if (scamResult.matched) return { shouldModerate: true, eventType: "scam", severity: "high", recommendedAction: "delete", reason: "Scam pattern", confidence: 90, matchedPattern: scamResult.matchedText, matchedPatternId: scamResult.pattern?.id };

      const phishResult = await this.scam.checkPhishing(content, ctx.organizationId, ctx.serverId);
      if (phishResult.matched) return { shouldModerate: true, eventType: "phishing", severity: "high", recommendedAction: "delete", reason: "Phishing pattern", confidence: 85, matchedPattern: phishResult.matchedText, matchedPatternId: phishResult.pattern?.id };
    }

    if (settings.linkCheckingEnabled !== false) {
      const linkResult = await this.checkLinks(content, { allowedDomains: settings.allowedDomains, blockedDomains: settings.blockedDomains });
      if (linkResult.hasThreat) return { shouldModerate: true, eventType: "malicious_link", severity: linkResult.threats.includes("scam") ? "critical" : "high", recommendedAction: "delete", reason: `Unsafe link: ${linkResult.threats.join(", ")}`, confidence: 85, matchedPattern: linkResult.domain };
    }

    if (settings.badWordFilterEnabled) {
      const wordResult = await this.words.checkBannedWords(content, ctx.organizationId, ctx.serverId, settings.banWords);
      if (wordResult.matched) return { shouldModerate: true, eventType: "banned_word", severity: "low", recommendedAction: "delete", reason: "Banned word", confidence: 100, matchedPattern: wordResult.matchedText, matchedPatternId: wordResult.pattern?.id };
    }

    return { shouldModerate: false };
  }

  async executeModeration(ctx: ModerationContext, check: ModerationCheckResult, escalationSettings?: { warnAfterViolations?: number; timeoutAfterViolations?: number; banAfterViolations?: number; defaultTimeoutMinutes?: number }): Promise<{ event: OrgModerationEvent; action: ModerationAction; durationMinutes?: number }> {
    const { action, durationMinutes } = escalationSettings
      ? await this.escalation.determineAction(ctx, escalationSettings)
      : { action: check.recommendedAction ?? "delete", durationMinutes: undefined };

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
      action_expires_at: durationMinutes ? new Date(Date.now() + durationMinutes * 60_000) : undefined,
      detected_by: "auto",
      confidence_score: check.confidence,
    });

    if (check.eventType === "spam") await this.spam.recordViolation(ctx);
    if (action === "timeout" && durationMinutes) await this.spam.applyRateLimit(ctx, durationMinutes);
    if (check.matchedPatternId) {
      await db.update(orgBlockedPatterns).set({ match_count: sql`${orgBlockedPatterns.match_count} + 1`, updated_at: new Date() }).where(eq(orgBlockedPatterns.id, check.matchedPatternId));
    }

    return { event, action, durationMinutes };
  }

  getSettingsLink(organizationId: string, section?: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";
    return `${baseUrl}/dashboard/org/${organizationId}/settings/agents/community-manager${section ? `/${section}` : ""}`;
  }
}

export const communityModerationService = new CommunityModerationService();
