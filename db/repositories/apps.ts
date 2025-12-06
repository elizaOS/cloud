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
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export type { App, NewApp, AppUser, NewAppUser, AppAnalytics, NewAppAnalytics };

export class AppsRepository {
  // ==================== Apps CRUD ====================

  async findById(id: string): Promise<App | undefined> {
    return await db.query.apps.findFirst({
      where: eq(apps.id, id),
    });
  }

  async findBySlug(slug: string): Promise<App | undefined> {
    return await db.query.apps.findFirst({
      where: eq(apps.slug, slug),
    });
  }

  async findByAffiliateCode(code: string): Promise<App | undefined> {
    return await db.query.apps.findFirst({
      where: eq(apps.affiliate_code, code),
    });
  }

  async listByOrganization(organizationId: string): Promise<App[]> {
    return await db.query.apps.findMany({
      where: eq(apps.organization_id, organizationId),
      orderBy: [desc(apps.created_at)],
    });
  }

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

  async create(data: NewApp): Promise<App> {
    const [app] = await db.insert(apps).values(data).returning();
    return app;
  }

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

  async delete(id: string): Promise<void> {
    await db.delete(apps).where(eq(apps.id, id));
  }

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

  async findAppUser(
    appId: string,
    userId: string,
  ): Promise<AppUser | undefined> {
    return await db.query.appUsers.findFirst({
      where: and(eq(appUsers.app_id, appId), eq(appUsers.user_id, userId)),
    });
  }

  async listAppUsers(appId: string, limit?: number): Promise<AppUser[]> {
    return await db.query.appUsers.findMany({
      where: eq(appUsers.app_id, appId),
      orderBy: [desc(appUsers.first_seen_at)],
      limit: limit,
    });
  }

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

  async trackAppUserActivity(
    appId: string,
    userId: string,
    creditsUsed: string = "0.00",
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // Check if app user record exists
    const existingAppUser = await this.findAppUser(appId, userId);

    if (existingAppUser) {
      // Update existing record
      await this.incrementAppUserUsage(appId, userId, creditsUsed);
    } else {
      // Create new app user record
      await this.createAppUser({
        app_id: appId,
        user_id: userId,
        total_requests: 1,
        total_credits_used: creditsUsed,
        metadata: metadata || {},
      });
    }

    // Also increment the app's usage
    await this.incrementUsage(appId, creditsUsed);
  }

  // ==================== App Analytics CRUD ====================

  async createAnalytics(data: NewAppAnalytics): Promise<AppAnalytics> {
    const [analytics] = await db.insert(appAnalytics).values(data).returning();
    return analytics;
  }

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

// Export singleton instance
export const appsRepository = new AppsRepository();
