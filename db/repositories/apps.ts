import { dbRead, dbWrite } from "../helpers";
import {
  apps,
  appUsers,
  appAnalytics,
  appRequests,
  type App,
  type NewApp,
  type AppUser,
  type NewAppUser,
  type AppAnalytics,
  type NewAppAnalytics,
  type AppRequest,
  type NewAppRequest,
} from "../schemas";
import { eq, and, gte, lte, desc, sql, count, countDistinct } from "drizzle-orm";

export type { App, NewApp, AppUser, NewAppUser, AppAnalytics, NewAppAnalytics, AppRequest, NewAppRequest };

/**
 * Repository for app database operations.
 *
 * Handles CRUD operations for apps, app users, and app analytics.
 *
 * Read operations → dbRead (read replica)
 * Write operations → dbWrite (NA primary)
 */
export class AppsRepository {
  // ============================================================================
  // READ OPERATIONS (use read replica)
  // ============================================================================

  /**
   * Finds an app by ID.
   */
  async findById(id: string): Promise<App | undefined> {
    return await dbRead.query.apps.findFirst({
      where: eq(apps.id, id),
    });
  }

  /**
   * Finds an app by slug.
   */
  async findBySlug(slug: string): Promise<App | undefined> {
    return await dbRead.query.apps.findFirst({
      where: eq(apps.slug, slug),
    });
  }

  /**
   * Finds an app by affiliate code.
   */
  async findByAffiliateCode(code: string): Promise<App | undefined> {
    return await dbRead.query.apps.findFirst({
      where: eq(apps.affiliate_code, code),
    });
  }

  /**
   * Finds an app by its associated API key ID.
   * This is a direct lookup instead of fetching all org apps.
   */
  async findByApiKeyId(apiKeyId: string): Promise<App | undefined> {
    return await dbRead.query.apps.findFirst({
      where: eq(apps.api_key_id, apiKeyId),
    });
  }

  /**
   * Lists all apps for an organization, ordered by creation date.
   */
  async listByOrganization(organizationId: string): Promise<App[]> {
    return await dbRead.query.apps.findMany({
      where: eq(apps.organization_id, organizationId),
      orderBy: [desc(apps.created_at)],
    });
  }

  /**
   * Lists all apps with optional filters.
   */
  async listAll(filters?: {
    isActive?: boolean;
    isApproved?: boolean;
  }): Promise<App[]> {
    const conditions = [];

    if (filters?.isActive !== undefined) {
      conditions.push(eq(apps.is_active, filters.isActive));
    }

    if (filters?.isApproved !== undefined) {
      conditions.push(eq(apps.is_approved, filters.isApproved));
    }

    return await dbRead.query.apps.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(apps.created_at)],
    });
  }

  /**
   * Finds an app user by app ID and user ID.
   */
  async findAppUser(
    appId: string,
    userId: string,
  ): Promise<AppUser | undefined> {
    return await dbRead.query.appUsers.findFirst({
      where: and(eq(appUsers.app_id, appId), eq(appUsers.user_id, userId)),
    });
  }

  /**
   * Lists app users for an app, ordered by first seen date.
   */
  async listAppUsers(appId: string, limit?: number): Promise<AppUser[]> {
    return await dbRead.query.appUsers.findMany({
      where: eq(appUsers.app_id, appId),
      orderBy: [desc(appUsers.first_seen_at)],
      limit: limit,
    });
  }

  /**
   * Gets app analytics within a date range for a specific period type.
   * Now aggregates directly from app_requests for real-time accuracy.
   */
  async getAnalytics(
    appId: string,
    periodType: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{
    period_start: Date;
    total_requests: number;
    unique_users: number;
    new_users: number;
    total_cost: string;
  }>> {
    const truncUnit = periodType === "hourly" ? "hour" : periodType === "monthly" ? "month" : "day";

    const results = await dbRead.execute<{
      period_start: string;
      total_requests: string;
      unique_users: string;
      total_cost: string;
    }>(sql`
      SELECT
        date_trunc(${sql.raw(`'${truncUnit}'`)}, ${appRequests.created_at}) as period_start,
        COUNT(*)::text as total_requests,
        COUNT(DISTINCT ${appRequests.ip_address})::text as unique_users,
        COALESCE(SUM(${appRequests.credits_used}), 0)::text as total_cost
      FROM ${appRequests}
      WHERE ${appRequests.app_id} = ${appId}
        AND ${appRequests.created_at} >= ${startDate}
        AND ${appRequests.created_at} <= ${endDate}
      GROUP BY 1
      ORDER BY period_start ASC
    `);

    return results.rows.map((r) => ({
      period_start: new Date(r.period_start),
      total_requests: parseInt(r.total_requests, 10),
      unique_users: parseInt(r.unique_users, 10),
      new_users: 0,
      total_cost: r.total_cost,
    }));
  }

  /**
   * Gets the latest app analytics records.
   */
  async getLatestAnalytics(
    appId: string,
    limit: number = 30,
  ): Promise<AppAnalytics[]> {
    return await dbRead.query.appAnalytics.findMany({
      where: eq(appAnalytics.app_id, appId),
      orderBy: [desc(appAnalytics.period_start)],
      limit,
    });
  }

  /**
   * Gets aggregated statistics for an app.
   */
  async getTotalStats(appId: string): Promise<{
    totalRequests: number;
    totalUsers: number;
    totalCreditsUsed: string;
  }> {
    const app = await this.findById(appId);

    if (!app) {
      return {
        totalRequests: 0,
        totalUsers: 0,
        totalCreditsUsed: "0.00",
      };
    }

    return {
      totalRequests: app.total_requests,
      totalUsers: app.total_users,
      totalCreditsUsed: app.total_credits_used,
    };
  }

  // ============================================================================
  // WRITE OPERATIONS (use NA primary)
  // ============================================================================

  /**
   * Creates a new app.
   */
  async create(data: NewApp): Promise<App> {
    const [app] = await dbWrite.insert(apps).values(data).returning();
    return app;
  }

  /**
   * Updates an existing app.
   */
  async update(id: string, data: Partial<NewApp>): Promise<App | undefined> {
    const [updated] = await dbWrite
      .update(apps)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(apps.id, id))
      .returning();
    return updated;
  }

  /**
   * Deletes an app by ID.
   */
  async delete(id: string): Promise<void> {
    await dbWrite.delete(apps).where(eq(apps.id, id));
  }

  /**
   * Atomically increments app usage statistics.
   */
  async incrementUsage(
    id: string,
    creditsUsed: string = "0.00",
  ): Promise<void> {
    await dbWrite
      .update(apps)
      .set({
        total_requests: sql`${apps.total_requests} + 1`,
        total_credits_used: sql`${apps.total_credits_used} + ${creditsUsed}`,
        last_used_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(apps.id, id));
  }

  /**
   * Creates a new app user and increments the app's total user count.
   */
  async createAppUser(data: NewAppUser): Promise<AppUser> {
    const [appUser] = await dbWrite.insert(appUsers).values(data).returning();

    // Increment the app's total_users count
    await dbWrite
      .update(apps)
      .set({
        total_users: sql`${apps.total_users} + 1`,
        updated_at: new Date(),
      })
      .where(eq(apps.id, data.app_id));

    return appUser;
  }

  /**
   * Updates an existing app user.
   */
  async updateAppUser(
    appId: string,
    userId: string,
    data: Partial<NewAppUser>,
  ): Promise<AppUser | undefined> {
    const [updated] = await dbWrite
      .update(appUsers)
      .set({
        ...data,
        last_seen_at: new Date(),
      })
      .where(and(eq(appUsers.app_id, appId), eq(appUsers.user_id, userId)))
      .returning();
    return updated;
  }

  /**
   * Atomically increments app user usage statistics.
   */
  async incrementAppUserUsage(
    appId: string,
    userId: string,
    creditsUsed: string = "0.00",
  ): Promise<void> {
    await dbWrite
      .update(appUsers)
      .set({
        total_requests: sql`${appUsers.total_requests} + 1`,
        total_credits_used: sql`${appUsers.total_credits_used} + ${creditsUsed}`,
        last_seen_at: new Date(),
      })
      .where(and(eq(appUsers.app_id, appId), eq(appUsers.user_id, userId)));
  }

  /**
   * Tracks app user activity, creating or updating the app user record as needed.
   *
   * Also increments the app's overall usage statistics.
   */
  async trackAppUserActivity(
    appId: string,
    userId: string,
    creditsUsed: string = "0.00",
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const existingAppUser = await this.findAppUser(appId, userId);

    if (existingAppUser) {
      await this.incrementAppUserUsage(appId, userId, creditsUsed);
    } else {
      await this.createAppUser({
        app_id: appId,
        user_id: userId,
        total_requests: 1,
        total_credits_used: creditsUsed,
        metadata: metadata || {},
      });
    }

    await this.incrementUsage(appId, creditsUsed);
  }

  /**
   * Creates a new app analytics record.
   */
  async createAnalytics(data: NewAppAnalytics): Promise<AppAnalytics> {
    const [analytics] = await dbWrite
      .insert(appAnalytics)
      .values(data)
      .returning();
    return analytics;
  }

  // ============================================================================
  // APP REQUESTS - Detailed request logging
  // ============================================================================

  /**
   * Logs an individual app request for detailed analytics.
   */
  async logRequest(data: NewAppRequest): Promise<AppRequest> {
    const [request] = await dbWrite.insert(appRequests).values(data).returning();
    return request;
  }

  /**
   * Gets recent requests for an app with pagination.
   */
  async getRecentRequests(
    appId: string,
    options: {
      limit?: number;
      offset?: number;
      requestType?: string;
      source?: string;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{ requests: AppRequest[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      requestType,
      source,
      startDate,
      endDate,
    } = options;

    const conditions = [eq(appRequests.app_id, appId)];

    if (requestType) {
      conditions.push(eq(appRequests.request_type, requestType));
    }
    if (source) {
      conditions.push(eq(appRequests.source, source));
    }
    if (startDate) {
      conditions.push(gte(appRequests.created_at, startDate));
    }
    if (endDate) {
      conditions.push(lte(appRequests.created_at, endDate));
    }

    const [requests, totalResult] = await Promise.all([
      dbRead
        .select()
        .from(appRequests)
        .where(and(...conditions))
        .orderBy(desc(appRequests.created_at))
        .limit(limit)
        .offset(offset),
      dbRead
        .select({ count: count() })
        .from(appRequests)
        .where(and(...conditions)),
    ]);

    return {
      requests,
      total: totalResult[0]?.count ?? 0,
    };
  }

  /**
   * Gets aggregated request stats for an app.
   */
  async getRequestStats(
    appId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalRequests: number;
    uniqueIps: number;
    uniqueUsers: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    totalCredits: string;
    avgResponseTime: number | null;
  }> {
    const conditions = [eq(appRequests.app_id, appId)];
    if (startDate) conditions.push(gte(appRequests.created_at, startDate));
    if (endDate) conditions.push(lte(appRequests.created_at, endDate));

    const [basicStats] = await dbRead
      .select({
        totalRequests: count(),
        uniqueIps: countDistinct(appRequests.ip_address),
        uniqueUsers: countDistinct(appRequests.user_id),
        totalCredits: sql<string>`COALESCE(SUM(${appRequests.credits_used}), 0)::text`,
        avgResponseTime: sql<number>`AVG(${appRequests.response_time_ms})::integer`,
      })
      .from(appRequests)
      .where(and(...conditions));

    const typeStats = await dbRead
      .select({
        type: appRequests.request_type,
        count: count(),
      })
      .from(appRequests)
      .where(and(...conditions))
      .groupBy(appRequests.request_type);

    const sourceStats = await dbRead
      .select({
        source: appRequests.source,
        count: count(),
      })
      .from(appRequests)
      .where(and(...conditions))
      .groupBy(appRequests.source);

    const statusStats = await dbRead
      .select({
        status: appRequests.status,
        count: count(),
      })
      .from(appRequests)
      .where(and(...conditions))
      .groupBy(appRequests.status);

    return {
      totalRequests: basicStats?.totalRequests ?? 0,
      uniqueIps: basicStats?.uniqueIps ?? 0,
      uniqueUsers: basicStats?.uniqueUsers ?? 0,
      totalCredits: basicStats?.totalCredits ?? "0",
      avgResponseTime: basicStats?.avgResponseTime ?? null,
      byType: Object.fromEntries(typeStats.map((s) => [s.type, s.count])),
      bySource: Object.fromEntries(sourceStats.map((s) => [s.source, s.count])),
      byStatus: Object.fromEntries(statusStats.map((s) => [s.status, s.count])),
    };
  }

  /**
   * Gets top IPs/visitors for an app.
   */
  async getTopVisitors(
    appId: string,
    limit: number = 10,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Array<{ ip: string; requestCount: number; lastSeen: Date }>> {
    const conditions = [eq(appRequests.app_id, appId)];
    if (startDate) conditions.push(gte(appRequests.created_at, startDate));
    if (endDate) conditions.push(lte(appRequests.created_at, endDate));

    const results = await dbRead
      .select({
        ip: appRequests.ip_address,
        requestCount: count(),
        lastSeen: sql<string>`to_char(MAX(${appRequests.created_at}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(appRequests)
      .where(and(...conditions))
      .groupBy(appRequests.ip_address)
      .orderBy(desc(count()))
      .limit(limit);

    return results.map((r) => ({
      ip: r.ip ?? "unknown",
      requestCount: r.requestCount,
      lastSeen: new Date(r.lastSeen),
    }));
  }

  /**
   * Gets request count over time for charts.
   */
  async getRequestsOverTime(
    appId: string,
    periodType: "hourly" | "daily" | "monthly",
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ period: string; count: number; credits: string }>> {
    const dateFormat =
      periodType === "hourly"
        ? "YYYY-MM-DD HH24:00"
        : periodType === "daily"
          ? "YYYY-MM-DD"
          : "YYYY-MM";

    const results = await dbRead
      .select({
        period: sql<string>`TO_CHAR(${appRequests.created_at}, ${dateFormat})`,
        count: count(),
        credits: sql<string>`COALESCE(SUM(${appRequests.credits_used}), 0)::text`,
      })
      .from(appRequests)
      .where(
        and(
          eq(appRequests.app_id, appId),
          gte(appRequests.created_at, startDate),
          lte(appRequests.created_at, endDate),
        ),
      )
      .groupBy(sql`TO_CHAR(${appRequests.created_at}, ${dateFormat})`)
      .orderBy(sql`TO_CHAR(${appRequests.created_at}, ${dateFormat})`);

    return results;
  }
}

/**
 * Singleton instance of AppsRepository.
 */
export const appsRepository = new AppsRepository();
