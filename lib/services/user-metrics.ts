/**
 * User Metrics Service
 *
 * Aggregates engagement data from multiple message sources:
 * - conversation_messages (web chat)
 * - phone_message_log (SMS / iMessage)
 * - Eliza rooms + memories (Telegram / Discord)
 *
 * Provides pre-computed daily metrics via cron and live queries for the
 * admin engagement dashboard.
 */

import { dbRead, dbWrite } from "@/db/client";
import {
  dailyMetrics,
  type DailyMetric,
  type MetricsPlatform,
} from "@/db/schemas/daily-metrics";
import {
  retentionCohorts,
  type RetentionCohort,
} from "@/db/schemas/retention-cohorts";
import { users } from "@/db/schemas/users";
import {
  conversations,
  conversationMessages,
} from "@/db/schemas/conversations";
import {
  agentPhoneNumbers,
  phoneMessageLog,
} from "@/db/schemas/agent-phone-numbers";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import {
  roomTable,
  participantTable,
  memoryTable,
} from "@/db/schemas/eliza";
import {
  sql,
  eq,
  and,
  gte,
  lt,
  ne,
  isNull,
  inArray,
  count,
  countDistinct,
} from "drizzle-orm";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL, CacheStaleTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveUsersResult {
  total: number;
  byPlatform: Record<string, number>;
}

export interface SignupsResult {
  total: number;
  byDay: Array<{ date: string; count: number }>;
}

export interface MessagesPerUserResult {
  average: number;
  median: number;
}

export interface OAuthConnectionRate {
  total_users: number;
  connected_users: number;
  rate: number;
  byService: Record<string, number>;
}

export interface MetricsOverview {
  dau: number;
  wau: number;
  mau: number;
  newSignupsToday: number;
  newSignups7d: number;
  avgMessagesPerUser: number;
  platformBreakdown: Record<string, number>;
  oauthRate: OAuthConnectionRate;
  dailyTrend: DailyMetric[];
  retentionCohorts: RetentionCohort[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class UserMetricsService {
  // =========================================================================
  // LIVE QUERIES (cached with SWR)
  // =========================================================================

  /**
   * Count unique active users across all platforms in the given window.
   */
  async getActiveUsers(
    timeRange: "day" | "7d" | "30d",
  ): Promise<ActiveUsersResult> {
    const cacheKey = CacheKeys.userMetrics.activeUsers(timeRange);
    const cached = await cache.getWithSWR<ActiveUsersResult>(
      cacheKey,
      CacheStaleTTL.userMetrics.activeUsers,
      () => this._queryActiveUsers(timeRange),
      CacheTTL.userMetrics.activeUsers,
    );
    return cached ?? this._queryActiveUsers(timeRange);
  }

  private async _queryActiveUsers(
    timeRange: "day" | "7d" | "30d",
  ): Promise<ActiveUsersResult> {
    const since = this._rangeSince(timeRange);

    // Web chat: distinct user_id from conversation_messages
    const webRows = await dbRead
      .select({
        cnt: countDistinct(conversations.user_id),
      })
      .from(conversationMessages)
      .innerJoin(
        conversations,
        eq(conversationMessages.conversation_id, conversations.id),
      )
      .where(
        and(
          eq(conversationMessages.role, "user"),
          gte(conversationMessages.created_at, since),
        ),
      );
    const webDau = Number(webRows[0]?.cnt ?? 0);

    // SMS / iMessage: distinct from_number grouped by provider
    const phoneRows = await dbRead
      .select({
        provider: agentPhoneNumbers.provider,
        cnt: countDistinct(phoneMessageLog.from_number),
      })
      .from(phoneMessageLog)
      .innerJoin(
        agentPhoneNumbers,
        eq(phoneMessageLog.phone_number_id, agentPhoneNumbers.id),
      )
      .where(
        and(
          eq(phoneMessageLog.direction, "inbound"),
          gte(phoneMessageLog.created_at, since),
        ),
      )
      .groupBy(agentPhoneNumbers.provider);

    let smsDau = 0;
    let imessageDau = 0;
    for (const row of phoneRows) {
      const n = Number(row.cnt);
      if (row.provider === "blooio") {
        imessageDau += n;
      } else {
        smsDau += n;
      }
    }

    // Telegram / Discord: distinct entity_id from Eliza rooms with messages
    const elizaRows = await dbRead
      .select({
        source: roomTable.source,
        cnt: countDistinct(participantTable.entityId),
      })
      .from(roomTable)
      .innerJoin(participantTable, eq(participantTable.roomId, roomTable.id))
      .innerJoin(memoryTable, eq(memoryTable.roomId, roomTable.id))
      .where(
        and(
          sql`${roomTable.source} IN ('telegram', 'discord')`,
          gte(memoryTable.createdAt, since),
          ne(participantTable.entityId, roomTable.agentId),
        ),
      )
      .groupBy(roomTable.source);

    let telegramDau = 0;
    let discordDau = 0;
    for (const row of elizaRows) {
      const n = Number(row.cnt);
      if (row.source === "telegram") telegramDau = n;
      if (row.source === "discord") discordDau = n;
    }

    const byPlatform: Record<string, number> = {
      web: webDau,
      telegram: telegramDau,
      discord: discordDau,
      imessage: imessageDau,
      sms: smsDau,
    };

    return {
      total: webDau + telegramDau + discordDau + imessageDau + smsDau,
      byPlatform,
    };
  }

  /**
   * Count new user signups in a date range.
   */
  async getNewSignups(startDate: Date, endDate: Date): Promise<SignupsResult> {
    const rows = await dbRead
      .select({
        day: sql<string>`DATE_TRUNC('day', ${users.created_at})`,
        cnt: count(),
      })
      .from(users)
      .where(
        and(
          eq(users.is_anonymous, false),
          gte(users.created_at, startDate),
          lt(users.created_at, endDate),
        ),
      )
      .groupBy(sql`DATE_TRUNC('day', ${users.created_at})`)
      .orderBy(sql`DATE_TRUNC('day', ${users.created_at})`);

    const byDay = rows.map((r) => ({
      date: new Date(r.day).toISOString().split("T")[0],
      count: Number(r.cnt),
    }));
    const total = byDay.reduce((s, d) => s + d.count, 0);

    return { total, byDay };
  }

  /**
   * OAuth connection rate across all non-anonymous users.
   */
  async getOAuthConnectionRate(): Promise<OAuthConnectionRate> {
    const [totalRow] = await dbRead
      .select({ cnt: count() })
      .from(users)
      .where(eq(users.is_anonymous, false));
    const total_users = Number(totalRow?.cnt ?? 0);

    // Single query: get distinct (user_id, platform) pairs, then derive both
    // per-service counts and total connected users in application code.
    const credRows = await dbRead
      .selectDistinct({
        userId: platformCredentials.user_id,
        platform: platformCredentials.platform,
      })
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.status, "active"),
          sql`${platformCredentials.user_id} IS NOT NULL`,
        ),
      );

    const byService: Record<string, number> = {};
    const connectedUserIds = new Set<string>();
    for (const row of credRows) {
      byService[row.platform] = (byService[row.platform] ?? 0) + 1;
      connectedUserIds.add(row.userId!);
    }
    const connected_users = connectedUserIds.size;

    return {
      total_users,
      connected_users,
      rate: total_users > 0 ? connected_users / total_users : 0,
      byService,
    };
  }

  // =========================================================================
  // PRE-COMPUTED READS
  // =========================================================================

  async getDailyMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<DailyMetric[]> {
    const key = CacheKeys.userMetrics.daily(
      startDate.toISOString().split("T")[0],
      endDate.toISOString().split("T")[0],
    );
    const cached = await cache.get<DailyMetric[]>(key);
    if (cached) return cached;

    const rows = await dbRead
      .select()
      .from(dailyMetrics)
      .where(
        and(gte(dailyMetrics.date, startDate), lt(dailyMetrics.date, endDate)),
      )
      .orderBy(dailyMetrics.date);

    await cache.set(key, rows, CacheTTL.userMetrics.daily);
    return rows;
  }

  async getRetentionCohorts(
    startDate: Date,
    endDate: Date,
  ): Promise<RetentionCohort[]> {
    const key = CacheKeys.userMetrics.retention(
      startDate.toISOString().split("T")[0],
      endDate.toISOString().split("T")[0],
    );
    const cached = await cache.get<RetentionCohort[]>(key);
    if (cached) return cached;

    const rows = await dbRead
      .select()
      .from(retentionCohorts)
      .where(
        and(
          gte(retentionCohorts.cohort_date, startDate),
          lt(retentionCohorts.cohort_date, endDate),
        ),
      )
      .orderBy(retentionCohorts.cohort_date);

    await cache.set(key, rows, CacheTTL.userMetrics.retention);
    return rows;
  }

  // =========================================================================
  // OVERVIEW (dashboard payload)
  // =========================================================================

  async getMetricsOverview(rangeDays = 30): Promise<MetricsOverview> {
    const cacheKey = CacheKeys.userMetrics.overview(rangeDays);
    const cached = await cache.getWithSWR<MetricsOverview>(
      cacheKey,
      CacheStaleTTL.userMetrics.overview,
      () => this._buildOverview(rangeDays),
      CacheTTL.userMetrics.overview,
    );
    return cached ?? this._buildOverview(rangeDays);
  }

  private async _buildOverview(rangeDays: number): Promise<MetricsOverview> {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86_400_000);
    const rangeStart = new Date(todayStart.getTime() - rangeDays * 86_400_000);

    const [
      dauResult,
      wauResult,
      mauResult,
      signupsToday,
      signups7d,
      oauthRate,
      dailyTrend,
      retention,
    ] = await Promise.all([
      this.getActiveUsers("day"),
      this.getActiveUsers("7d"),
      this.getActiveUsers("30d"),
      this.getNewSignups(todayStart, now),
      this.getNewSignups(sevenDaysAgo, now),
      this.getOAuthConnectionRate(),
      this.getDailyMetrics(rangeStart, now),
      this.getRetentionCohorts(rangeStart, now),
    ]);

    // Compute avg messages per user from the most recent daily_metrics row
    const recentAll = dailyTrend.filter(
      (d) => d.platform === null && d.dau > 0,
    );
    const avgMessagesPerUser =
      recentAll.length > 0
        ? recentAll.reduce(
            (s, d) => s + parseFloat(d.messages_per_user ?? "0"),
            0,
          ) / recentAll.length
        : 0;

    return {
      dau: dauResult.total,
      wau: wauResult.total,
      mau: mauResult.total,
      newSignupsToday: signupsToday.total,
      newSignups7d: signups7d.total,
      avgMessagesPerUser: Math.round(avgMessagesPerUser * 100) / 100,
      platformBreakdown: dauResult.byPlatform,
      oauthRate,
      dailyTrend,
      retentionCohorts: retention,
    };
  }

  // =========================================================================
  // CRON COMPUTATION (called by /api/cron/compute-metrics)
  // =========================================================================

  /**
   * Compute and upsert daily_metrics for a given date across all platforms.
   */
  async computeDailyMetrics(date: Date): Promise<void> {
    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    logger.info("[UserMetrics] Computing daily metrics", {
      date: dayStart.toISOString(),
    });

    const platforms: Array<MetricsPlatform | null> = [
      null,
      "web",
      "telegram",
      "discord",
      "imessage",
      "sms",
    ];

    for (const platform of platforms) {
      const { dau, totalMessages } = await this._countDayActivity(
        dayStart,
        dayEnd,
        platform,
      );
      const newSignups = await this._countNewSignups(
        dayStart,
        dayEnd,
        platform,
      );
      const messagesPerUser = dau > 0 ? totalMessages / dau : 0;

      const values = {
        dau,
        new_signups: newSignups,
        total_messages: totalMessages,
        messages_per_user: messagesPerUser.toFixed(2),
      };

      if (platform === null) {
        // NULL platform = aggregate row. Manual upsert because
        // ON CONFLICT doesn't match NULLs in standard unique indexes.
        const existing = await dbRead
          .select()
          .from(dailyMetrics)
          .where(
            and(
              eq(dailyMetrics.date, dayStart),
              isNull(dailyMetrics.platform),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await dbWrite
            .update(dailyMetrics)
            .set(values)
            .where(eq(dailyMetrics.id, existing[0].id));
        } else {
          await dbWrite
            .insert(dailyMetrics)
            .values({ date: dayStart, platform: null, ...values });
        }
      } else {
        await dbWrite
          .insert(dailyMetrics)
          .values({ date: dayStart, platform, ...values })
          .onConflictDoUpdate({
            target: [dailyMetrics.date, dailyMetrics.platform],
            set: values,
          });
      }
    }
  }

  /**
   * Compute and upsert retention cohort data for a given date.
   * Updates D1 for yesterday's cohort, D7 for the cohort from 7 days ago, etc.
   *
   * Currently only writes the NULL-platform (aggregate) row. Per-platform
   * retention cohorts are supported by the schema but not yet computed.
   * TODO: add per-platform retention when the dashboard needs it.
   */
  async computeRetentionCohorts(date: Date): Promise<void> {
    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );

    logger.info("[UserMetrics] Computing retention cohorts", {
      date: dayStart.toISOString(),
    });

    const windows = [
      { field: "d1_retained" as const, daysAgo: 1 },
      { field: "d7_retained" as const, daysAgo: 7 },
      { field: "d30_retained" as const, daysAgo: 30 },
    ];

    for (const { field, daysAgo } of windows) {
      const cohortDate = new Date(dayStart.getTime() - daysAgo * 86_400_000);
      const cohortEnd = new Date(cohortDate.getTime() + 86_400_000);

      // Get users who signed up on cohort_date
      const cohortUsers = await dbRead
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.is_anonymous, false),
            gte(users.created_at, cohortDate),
            lt(users.created_at, cohortEnd),
          ),
        );

      const cohortSize = cohortUsers.length;
      if (cohortSize === 0) continue;

      // TODO: for large cohorts (thousands of users), replace inArray with a
      // JOIN against a VALUES list or temp table to avoid huge IN (...) clauses.
      const cohortUserIds = cohortUsers.map((r) => r.id);

      // Check how many of those users had activity on dayStart
      const retainedCount = await this._countRetainedUsers(
        cohortUserIds,
        dayStart,
        new Date(dayStart.getTime() + 86_400_000),
      );

      // Upsert: first check if cohort row exists
      const existing = await dbRead
        .select()
        .from(retentionCohorts)
        .where(
          and(
            eq(retentionCohorts.cohort_date, cohortDate),
            isNull(retentionCohorts.platform),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await dbWrite
          .update(retentionCohorts)
          .set({
            [field]: retainedCount,
            cohort_size: cohortSize,
            updated_at: new Date(),
          })
          .where(eq(retentionCohorts.id, existing[0].id));
      } else {
        await dbWrite.insert(retentionCohorts).values({
          cohort_date: cohortDate,
          platform: null,
          cohort_size: cohortSize,
          [field]: retainedCount,
        });
      }
    }
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private _rangeSince(range: "day" | "7d" | "30d"): Date {
    const now = new Date();
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const daysBack = { day: 0, "7d": 6, "30d": 29 };
    return new Date(todayMidnight.getTime() - daysBack[range] * 86_400_000);
  }

  /**
   * Count distinct active users and total messages for a (day, platform) pair.
   *
   * When platform is null (aggregate), the total is a sum of per-source counts.
   * Cross-platform overlap is minimal because each source uses a different
   * identifier space (user_id for web, from_number for phone, entityId for
   * Eliza rooms). If web user_ids and Eliza entityIds ever share the same
   * UUID namespace, the aggregate DAU will overcount.
   *
   * TODO: deduplicate the aggregate case with a UNION-based approach when
   * cross-platform identity linking is available.
   */
  private async _countDayActivity(
    dayStart: Date,
    dayEnd: Date,
    platform: MetricsPlatform | null,
  ): Promise<{ dau: number; totalMessages: number }> {
    let dau = 0;
    let totalMessages = 0;

    const include = (p: MetricsPlatform) => platform === null || platform === p;

    if (include("web")) {
      const [r] = await dbRead
        .select({
          users: countDistinct(conversations.user_id),
          msgs: count(),
        })
        .from(conversationMessages)
        .innerJoin(
          conversations,
          eq(conversationMessages.conversation_id, conversations.id),
        )
        .where(
          and(
            eq(conversationMessages.role, "user"),
            gte(conversationMessages.created_at, dayStart),
            lt(conversationMessages.created_at, dayEnd),
          ),
        );
      dau += Number(r?.users ?? 0);
      totalMessages += Number(r?.msgs ?? 0);
    }

    if (include("sms") || include("imessage")) {
      const providerCondition =
        platform === "imessage"
          ? eq(agentPhoneNumbers.provider, "blooio")
          : platform === "sms"
            ? ne(agentPhoneNumbers.provider, "blooio")
            : undefined;

      const conditions = [
        eq(phoneMessageLog.direction, "inbound"),
        gte(phoneMessageLog.created_at, dayStart),
        lt(phoneMessageLog.created_at, dayEnd),
      ];
      if (providerCondition) conditions.push(providerCondition);

      const [r] = await dbRead
        .select({
          users: countDistinct(phoneMessageLog.from_number),
          msgs: count(),
        })
        .from(phoneMessageLog)
        .innerJoin(
          agentPhoneNumbers,
          eq(phoneMessageLog.phone_number_id, agentPhoneNumbers.id),
        )
        .where(and(...conditions));

      dau += Number(r?.users ?? 0);
      totalMessages += Number(r?.msgs ?? 0);
    }

    if (include("telegram") || include("discord")) {
      const sourceCondition =
        platform === "telegram"
          ? sql`${roomTable.source} = 'telegram'`
          : platform === "discord"
            ? sql`${roomTable.source} = 'discord'`
            : sql`${roomTable.source} IN ('telegram', 'discord')`;

      const [r] = await dbRead
        .select({
          users: countDistinct(participantTable.entityId),
          msgs: count(),
        })
        .from(roomTable)
        .innerJoin(participantTable, eq(participantTable.roomId, roomTable.id))
        .innerJoin(memoryTable, eq(memoryTable.roomId, roomTable.id))
        .where(
          and(
            sourceCondition,
            gte(memoryTable.createdAt, dayStart),
            lt(memoryTable.createdAt, dayEnd),
            ne(participantTable.entityId, roomTable.agentId),
          ),
        );

      dau += Number(r?.users ?? 0);
      totalMessages += Number(r?.msgs ?? 0);
    }

    return { dau, totalMessages };
  }

  /**
   * Count how many signups happened on a day, optionally by platform.
   */
  private async _countNewSignups(
    dayStart: Date,
    dayEnd: Date,
    platform: MetricsPlatform | null,
  ): Promise<number> {
    const conditions = [
      eq(users.is_anonymous, false),
      gte(users.created_at, dayStart),
      lt(users.created_at, dayEnd),
    ];

    if (platform === "telegram") {
      conditions.push(sql`${users.telegram_id} IS NOT NULL`);
    } else if (platform === "discord") {
      conditions.push(sql`${users.discord_id} IS NOT NULL`);
    } else if (platform === "sms" || platform === "imessage") {
      // Both SMS and iMessage resolve to the same phone_number column;
      // the schema has no way to distinguish them at signup time.
      conditions.push(sql`${users.phone_number} IS NOT NULL`);
    } else if (platform === "web") {
      conditions.push(isNull(users.telegram_id));
      conditions.push(isNull(users.discord_id));
      conditions.push(isNull(users.phone_number));
    }

    const [r] = await dbRead
      .select({ cnt: count() })
      .from(users)
      .where(and(...conditions));

    return Number(r?.cnt ?? 0);
  }

  /**
   * Count how many of the given user IDs had activity on a given day.
   */
  private async _countRetainedUsers(
    userIds: string[],
    dayStart: Date,
    dayEnd: Date,
  ): Promise<number> {
    if (userIds.length === 0) return 0;

    const [webRows, elizaRows] = await Promise.all([
      dbRead
        .selectDistinct({ userId: conversations.user_id })
        .from(conversationMessages)
        .innerJoin(
          conversations,
          eq(conversationMessages.conversation_id, conversations.id),
        )
        .where(
          and(
            eq(conversationMessages.role, "user"),
            gte(conversationMessages.created_at, dayStart),
            lt(conversationMessages.created_at, dayEnd),
            inArray(conversations.user_id, userIds),
          ),
        ),

      dbRead
        .selectDistinct({ userId: participantTable.entityId })
        .from(roomTable)
        .innerJoin(participantTable, eq(participantTable.roomId, roomTable.id))
        .innerJoin(memoryTable, eq(memoryTable.roomId, roomTable.id))
        .where(
          and(
            sql`${roomTable.source} IN ('telegram', 'discord')`,
            gte(memoryTable.createdAt, dayStart),
            lt(memoryTable.createdAt, dayEnd),
            ne(participantTable.entityId, roomTable.agentId),
            inArray(participantTable.entityId, userIds),
          ),
        ),
    ]);

    const retainedSet = new Set<string>();
    for (const r of webRows) retainedSet.add(r.userId);
    for (const r of elizaRows) retainedSet.add(r.userId);

    return retainedSet.size;
  }
}

export const userMetricsService = new UserMetricsService();
