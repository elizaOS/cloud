/**
 * Community Moderation Repository - data access for moderation tables.
 */

import { db } from "@/db";
import { eq, and, desc, gte, lte, sql, isNull, isNotNull } from "drizzle-orm";
import {
  orgTokenGates,
  orgMemberWallets,
  orgModerationEvents,
  orgSpamTracking,
  orgBlockedPatterns,
  type OrgTokenGate,
  type NewOrgTokenGate,
  type OrgMemberWallet,
  type NewOrgMemberWallet,
  type OrgModerationEvent,
  type NewOrgModerationEvent,
  type OrgSpamTracking,
  type NewOrgSpamTracking,
  type OrgBlockedPattern,
  type NewOrgBlockedPattern,
} from "@/db/schemas/org-community-moderation";

export const tokenGatesRepository = {
  async findById(id: string): Promise<OrgTokenGate | null> {
    const [gate] = await db
      .select()
      .from(orgTokenGates)
      .where(eq(orgTokenGates.id, id))
      .limit(1);
    return gate ?? null;
  },

  async findByServer(serverId: string): Promise<OrgTokenGate[]> {
    return db
      .select()
      .from(orgTokenGates)
      .where(eq(orgTokenGates.server_id, serverId))
      .orderBy(desc(orgTokenGates.priority));
  },

  async findEnabledByServer(serverId: string): Promise<OrgTokenGate[]> {
    return db
      .select()
      .from(orgTokenGates)
      .where(
        and(
          eq(orgTokenGates.server_id, serverId),
          eq(orgTokenGates.enabled, true),
        ),
      )
      .orderBy(desc(orgTokenGates.priority));
  },

  async create(data: NewOrgTokenGate): Promise<OrgTokenGate> {
    const [gate] = await db.insert(orgTokenGates).values(data).returning();
    return gate;
  },

  async update(
    id: string,
    data: Partial<NewOrgTokenGate>,
  ): Promise<OrgTokenGate | null> {
    const [updated] = await db
      .update(orgTokenGates)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orgTokenGates.id, id))
      .returning();
    return updated ?? null;
  },

  async delete(id: string): Promise<void> {
    await db.delete(orgTokenGates).where(eq(orgTokenGates.id, id));
  },
};

export const memberWalletsRepository = {
  async findById(id: string): Promise<OrgMemberWallet | null> {
    const [wallet] = await db
      .select()
      .from(orgMemberWallets)
      .where(eq(orgMemberWallets.id, id))
      .limit(1);
    return wallet ?? null;
  },

  async findByPlatformUser(
    serverId: string,
    platformUserId: string,
    platform: string,
  ): Promise<OrgMemberWallet[]> {
    return db
      .select()
      .from(orgMemberWallets)
      .where(
        and(
          eq(orgMemberWallets.server_id, serverId),
          eq(orgMemberWallets.platform_user_id, platformUserId),
          eq(orgMemberWallets.platform, platform),
        ),
      );
  },

  async findPrimaryWallet(
    serverId: string,
    platformUserId: string,
    platform: string,
  ): Promise<OrgMemberWallet | null> {
    const [wallet] = await db
      .select()
      .from(orgMemberWallets)
      .where(
        and(
          eq(orgMemberWallets.server_id, serverId),
          eq(orgMemberWallets.platform_user_id, platformUserId),
          eq(orgMemberWallets.platform, platform),
          eq(orgMemberWallets.is_primary, true),
        ),
      )
      .limit(1);
    return wallet ?? null;
  },

  async findByWalletAddress(
    serverId: string,
    walletAddress: string,
    chain: OrgMemberWallet["chain"],
  ): Promise<OrgMemberWallet | null> {
    const [wallet] = await db
      .select()
      .from(orgMemberWallets)
      .where(
        and(
          eq(orgMemberWallets.server_id, serverId),
          eq(orgMemberWallets.wallet_address, walletAddress),
          eq(orgMemberWallets.chain, chain),
        ),
      )
      .limit(1);
    return wallet ?? null;
  },

  async create(data: NewOrgMemberWallet): Promise<OrgMemberWallet> {
    const [wallet] = await db.insert(orgMemberWallets).values(data).returning();
    return wallet;
  },

  async upsert(data: NewOrgMemberWallet): Promise<OrgMemberWallet> {
    const [wallet] = await db
      .insert(orgMemberWallets)
      .values(data)
      .onConflictDoUpdate({
        target: [
          orgMemberWallets.server_id,
          orgMemberWallets.wallet_address,
          orgMemberWallets.chain,
        ],
        set: {
          platform_user_id: data.platform_user_id,
          platform: data.platform,
          verification_method: data.verification_method,
          verification_signature: data.verification_signature,
          verified_at: data.verified_at,
          updated_at: new Date(),
        },
      })
      .returning();
    return wallet;
  },

  async update(
    id: string,
    data: Partial<NewOrgMemberWallet>,
  ): Promise<OrgMemberWallet | null> {
    const [updated] = await db
      .update(orgMemberWallets)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orgMemberWallets.id, id))
      .returning();
    return updated ?? null;
  },

  async updateBalance(
    id: string,
    balance: OrgMemberWallet["last_balance"],
  ): Promise<void> {
    await db
      .update(orgMemberWallets)
      .set({
        last_balance: balance,
        last_checked_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(orgMemberWallets.id, id));
  },

  async updateAssignedRoles(id: string, roles: string[]): Promise<void> {
    await db
      .update(orgMemberWallets)
      .set({ assigned_roles: roles, updated_at: new Date() })
      .where(eq(orgMemberWallets.id, id));
  },

  async delete(id: string): Promise<void> {
    await db.delete(orgMemberWallets).where(eq(orgMemberWallets.id, id));
  },

  async findNeedingRecheck(
    serverId: string,
    olderThanHours: number,
    limit = 100,
  ): Promise<OrgMemberWallet[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 3600000);
    return db
      .select()
      .from(orgMemberWallets)
      .where(
        and(
          eq(orgMemberWallets.server_id, serverId),
          lte(orgMemberWallets.last_checked_at, cutoff),
        ),
      )
      .limit(limit);
  },
};

export const moderationEventsRepository = {
  async findById(id: string): Promise<OrgModerationEvent | null> {
    const [event] = await db
      .select()
      .from(orgModerationEvents)
      .where(eq(orgModerationEvents.id, id))
      .limit(1);
    return event ?? null;
  },

  async findByServer(
    serverId: string,
    options: {
      limit?: number;
      unresolvedOnly?: boolean;
      resolvedOnly?: boolean;
    } = {},
  ): Promise<OrgModerationEvent[]> {
    const { limit = 50, unresolvedOnly, resolvedOnly } = options;
    let conditions = eq(orgModerationEvents.server_id, serverId);
    if (unresolvedOnly)
      conditions = and(conditions, isNull(orgModerationEvents.resolved_at))!;
    else if (resolvedOnly)
      conditions = and(conditions, isNotNull(orgModerationEvents.resolved_at))!;
    return db
      .select()
      .from(orgModerationEvents)
      .where(conditions)
      .orderBy(desc(orgModerationEvents.created_at))
      .limit(limit);
  },

  async findByUser(
    serverId: string,
    platformUserId: string,
    platform: string,
  ): Promise<OrgModerationEvent[]> {
    return db
      .select()
      .from(orgModerationEvents)
      .where(
        and(
          eq(orgModerationEvents.server_id, serverId),
          eq(orgModerationEvents.platform_user_id, platformUserId),
          eq(orgModerationEvents.platform, platform),
        ),
      )
      .orderBy(desc(orgModerationEvents.created_at));
  },

  async countViolations(
    serverId: string,
    platformUserId: string,
    platform: string,
    sinceDays = 30,
  ): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 86400000);
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orgModerationEvents)
      .where(
        and(
          eq(orgModerationEvents.server_id, serverId),
          eq(orgModerationEvents.platform_user_id, platformUserId),
          eq(orgModerationEvents.platform, platform),
          gte(orgModerationEvents.created_at, since),
          eq(orgModerationEvents.false_positive, false),
        ),
      );
    return Number(result?.count ?? 0);
  },

  async create(data: NewOrgModerationEvent): Promise<OrgModerationEvent> {
    const [event] = await db
      .insert(orgModerationEvents)
      .values(data)
      .returning();
    return event;
  },

  async resolve(
    id: string,
    resolvedBy: string,
    notes?: string,
    falsePositive = false,
  ): Promise<OrgModerationEvent | null> {
    const [updated] = await db
      .update(orgModerationEvents)
      .set({
        resolved_at: new Date(),
        resolved_by: resolvedBy,
        resolution_notes: notes,
        false_positive: falsePositive,
      })
      .where(eq(orgModerationEvents.id, id))
      .returning();
    return updated ?? null;
  },

  async getStats(
    serverId: string,
    sinceDays = 7,
  ): Promise<{
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    unresolved: number;
  }> {
    const since = new Date(Date.now() - sinceDays * 86400000);
    const events = await db
      .select()
      .from(orgModerationEvents)
      .where(
        and(
          eq(orgModerationEvents.server_id, serverId),
          gte(orgModerationEvents.created_at, since),
        ),
      );

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let unresolved = 0;

    for (const e of events) {
      byType[e.event_type] = (byType[e.event_type] || 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
      if (!e.resolved_at) unresolved++;
    }

    return { total: events.length, byType, bySeverity, unresolved };
  },
};

export const spamTrackingRepository = {
  async findByUser(
    serverId: string,
    platformUserId: string,
    platform: string,
  ): Promise<OrgSpamTracking | null> {
    const [tracking] = await db
      .select()
      .from(orgSpamTracking)
      .where(
        and(
          eq(orgSpamTracking.server_id, serverId),
          eq(orgSpamTracking.platform_user_id, platformUserId),
          eq(orgSpamTracking.platform, platform),
        ),
      )
      .limit(1);
    return tracking ?? null;
  },

  async upsert(data: NewOrgSpamTracking): Promise<OrgSpamTracking> {
    const [tracking] = await db
      .insert(orgSpamTracking)
      .values(data)
      .onConflictDoNothing()
      .returning();
    if (!tracking) {
      const existing = await this.findByUser(
        data.server_id,
        data.platform_user_id,
        data.platform,
      );
      if (!existing) throw new Error("Failed to create spam tracking");
      return existing;
    }
    return tracking;
  },

  async update(
    id: string,
    data: Partial<NewOrgSpamTracking>,
  ): Promise<OrgSpamTracking | null> {
    const [updated] = await db
      .update(orgSpamTracking)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orgSpamTracking.id, id))
      .returning();
    return updated ?? null;
  },

  async incrementViolations(
    serverId: string,
    platformUserId: string,
    platform: string,
  ): Promise<void> {
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
          eq(orgSpamTracking.server_id, serverId),
          eq(orgSpamTracking.platform_user_id, platformUserId),
          eq(orgSpamTracking.platform, platform),
        ),
      );
  },

  async setRateLimit(
    serverId: string,
    platformUserId: string,
    platform: string,
    expiresAt: Date,
  ): Promise<void> {
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
          eq(orgSpamTracking.server_id, serverId),
          eq(orgSpamTracking.platform_user_id, platformUserId),
          eq(orgSpamTracking.platform, platform),
        ),
      );
  },

  async clearRateLimit(
    serverId: string,
    platformUserId: string,
    platform: string,
  ): Promise<void> {
    await db
      .update(orgSpamTracking)
      .set({
        is_rate_limited: false,
        rate_limit_expires_at: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgSpamTracking.server_id, serverId),
          eq(orgSpamTracking.platform_user_id, platformUserId),
          eq(orgSpamTracking.platform, platform),
        ),
      );
  },

  async resetHourlyViolations(): Promise<void> {
    await db
      .update(orgSpamTracking)
      .set({ spam_violations_1h: 0, updated_at: new Date() });
  },

  async resetDailyViolations(): Promise<void> {
    await db
      .update(orgSpamTracking)
      .set({ spam_violations_24h: 0, updated_at: new Date() });
  },
};

export const blockedPatternsRepository = {
  async findById(id: string): Promise<OrgBlockedPattern | null> {
    const [pattern] = await db
      .select()
      .from(orgBlockedPatterns)
      .where(eq(orgBlockedPatterns.id, id))
      .limit(1);
    return pattern ?? null;
  },

  async findByOrganization(
    organizationId: string,
    options: {
      serverId?: string;
      category?: string;
      enabledOnly?: boolean;
    } = {},
  ): Promise<OrgBlockedPattern[]> {
    const { serverId, category, enabledOnly = true } = options;
    let conditions = eq(orgBlockedPatterns.organization_id, organizationId);
    if (enabledOnly)
      conditions = and(conditions, eq(orgBlockedPatterns.enabled, true))!;
    if (category)
      conditions = and(conditions, eq(orgBlockedPatterns.category, category))!;
    const patterns = await db
      .select()
      .from(orgBlockedPatterns)
      .where(conditions);
    return serverId
      ? patterns.filter((p) => p.server_id === serverId || p.server_id === null)
      : patterns;
  },

  async create(data: NewOrgBlockedPattern): Promise<OrgBlockedPattern> {
    const [pattern] = await db
      .insert(orgBlockedPatterns)
      .values(data)
      .returning();
    return pattern;
  },

  async update(
    id: string,
    data: Partial<NewOrgBlockedPattern>,
  ): Promise<OrgBlockedPattern | null> {
    const [updated] = await db
      .update(orgBlockedPatterns)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orgBlockedPatterns.id, id))
      .returning();
    return updated ?? null;
  },

  async delete(id: string): Promise<void> {
    await db.delete(orgBlockedPatterns).where(eq(orgBlockedPatterns.id, id));
  },

  async incrementMatchCount(id: string): Promise<void> {
    await db
      .update(orgBlockedPatterns)
      .set({
        match_count: sql`${orgBlockedPatterns.match_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(orgBlockedPatterns.id, id));
  },
};
