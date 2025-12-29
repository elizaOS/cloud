import { dbRead, dbWrite } from "../helpers";
import {
  apps,
  appUsers,
  appAnalytics,
  type App,
  type NewApp,
  type AppUser,
  type NewAppUser,
  type AppAnalytics,
  type NewAppAnalytics,
} from "../schemas";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export type { App, NewApp, AppUser, NewAppUser, AppAnalytics, NewAppAnalytics };

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
   */
  async getAnalytics(
    appId: string,
    periodType: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AppAnalytics[]> {
    return await dbRead.query.appAnalytics.findMany({
      where: and(
        eq(appAnalytics.app_id, appId),
        eq(appAnalytics.period_type, periodType),
        gte(appAnalytics.period_start, startDate),
        lte(appAnalytics.period_end, endDate),
      ),
      orderBy: [desc(appAnalytics.period_start)],
    });
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
}

/**
 * Singleton instance of AppsRepository.
 */
export const appsRepository = new AppsRepository();
