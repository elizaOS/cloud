import { db } from "../client";
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
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

export type { App, NewApp, AppUser, NewAppUser, AppAnalytics, NewAppAnalytics };

/**
 * Repository for app database operations.
 *
 * Handles CRUD operations for apps, app users, and app analytics.
 */
export class AppsRepository {
  // ==================== Apps CRUD ====================

  /**
   * Finds an app by ID.
   */
  async findById(id: string): Promise<App | undefined> {
    return await db.query.apps.findFirst({
      where: eq(apps.id, id),
    });
  }

  /**
   * Finds an app by slug.
   */
  async findBySlug(slug: string): Promise<App | undefined> {
    return await db.query.apps.findFirst({
      where: eq(apps.slug, slug),
    });
  }

  /**
   * Finds an app by affiliate code.
   */
  async findByAffiliateCode(code: string): Promise<App | undefined> {
    return await db.query.apps.findFirst({
      where: eq(apps.affiliate_code, code),
    });
  }

  /**
   * Lists all apps for an organization with smart ordering.
   * Priority: 1) Pinned apps, 2) Recently used (7 days), 3) Active by usage, 4) Other active, 5) Inactive
   * Within each priority level, apps are sorted by last_used_at or created_at.
   */
  async listByOrganization(organizationId: string): Promise<App[]> {
    const allApps = await db.query.apps.findMany({
      where: eq(apps.organization_id, organizationId),
    });

    return this.sortAppsByPriority(allApps);
  }

  /**
   * Sorts apps by priority for dashboard display.
   * Priority order:
   * 1. Pinned apps (sorted by last_used_at DESC, then created_at DESC)
   * 2. Recently used apps (within 7 days, sorted by last_used_at DESC)
   * 3. Active apps with high usage (>10 requests, sorted by total_requests DESC)
   * 4. Other active apps (sorted by created_at DESC)
   * 5. Inactive apps (sorted by created_at DESC)
   */
  private sortAppsByPriority(allApps: App[]): App[] {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const pinnedApps: App[] = [];
    const recentlyUsedApps: App[] = [];
    const activeHighUsageApps: App[] = [];
    const activeOtherApps: App[] = [];
    const inactiveApps: App[] = [];

    for (const app of allApps) {
      if (app.is_pinned) {
        pinnedApps.push(app);
      } else if (!app.is_active) {
        inactiveApps.push(app);
      } else if (app.last_used_at && new Date(app.last_used_at) > sevenDaysAgo) {
        recentlyUsedApps.push(app);
      } else if (app.total_requests > 10) {
        activeHighUsageApps.push(app);
      } else {
        activeOtherApps.push(app);
      }
    }

    const sortByLastUsedOrCreated = (a: App, b: App): number => {
      const aDate = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const bDate = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      if (aDate !== bDate) return bDate - aDate;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };

    const sortByCreated = (a: App, b: App): number => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };

    const sortByUsage = (a: App, b: App): number => {
      return b.total_requests - a.total_requests;
    };

    pinnedApps.sort(sortByLastUsedOrCreated);
    recentlyUsedApps.sort(sortByLastUsedOrCreated);
    activeHighUsageApps.sort(sortByUsage);
    activeOtherApps.sort(sortByCreated);
    inactiveApps.sort(sortByCreated);

    return [
      ...pinnedApps,
      ...recentlyUsedApps,
      ...activeHighUsageApps,
      ...activeOtherApps,
      ...inactiveApps,
    ];
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

    return await db.query.apps.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(apps.created_at)],
    });
  }

  /**
   * Creates a new app.
   */
  async create(data: NewApp): Promise<App> {
    const [app] = await db.insert(apps).values(data).returning();
    return app;
  }

  /**
   * Updates an existing app.
   */
  async update(id: string, data: Partial<NewApp>): Promise<App | undefined> {
    const [updated] = await db
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
    await db.delete(apps).where(eq(apps.id, id));
  }

  /**
   * Toggles the pinned status of an app.
   */
  async togglePinned(id: string): Promise<App | undefined> {
    const app = await this.findById(id);
    if (!app) return undefined;

    const [updated] = await db
      .update(apps)
      .set({
        is_pinned: !app.is_pinned,
        updated_at: new Date(),
      })
      .where(eq(apps.id, id))
      .returning();
    return updated;
  }

  /**
   * Sets the pinned status of an app.
   */
  async setPinned(id: string, isPinned: boolean): Promise<App | undefined> {
    const [updated] = await db
      .update(apps)
      .set({
        is_pinned: isPinned,
        updated_at: new Date(),
      })
      .where(eq(apps.id, id))
      .returning();
    return updated;
  }

  /**
   * Atomically increments app usage statistics.
   */
  async incrementUsage(
    id: string,
    creditsUsed: string = "0.00",
  ): Promise<void> {
    await db
      .update(apps)
      .set({
        total_requests: sql`${apps.total_requests} + 1`,
        total_credits_used: sql`${apps.total_credits_used} + ${creditsUsed}`,
        last_used_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(apps.id, id));
  }

  // ==================== App Users CRUD ====================

  /**
   * Finds an app user by app ID and user ID.
   */
  async findAppUser(
    appId: string,
    userId: string,
  ): Promise<AppUser | undefined> {
    return await db.query.appUsers.findFirst({
      where: and(eq(appUsers.app_id, appId), eq(appUsers.user_id, userId)),
    });
  }

  /**
   * Lists app users for an app, ordered by first seen date.
   */
  async listAppUsers(appId: string, limit?: number): Promise<AppUser[]> {
    return await db.query.appUsers.findMany({
      where: eq(appUsers.app_id, appId),
      orderBy: [desc(appUsers.first_seen_at)],
      limit: limit,
    });
  }

  /**
   * Creates a new app user and increments the app's total user count.
   */
  async createAppUser(data: NewAppUser): Promise<AppUser> {
    const [appUser] = await db.insert(appUsers).values(data).returning();

    // Increment the app's total_users count
    await db
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
    const [updated] = await db
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
    await db
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
    const [analytics] = await db.insert(appAnalytics).values(data).returning();
    return analytics;
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
    return await db.query.appAnalytics.findMany({
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
    return await db.query.appAnalytics.findMany({
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
}

/**
 * Singleton instance of AppsRepository.
 */
export const appsRepository = new AppsRepository();
