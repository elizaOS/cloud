/**
 * Service for managing apps and app-related operations.
 */

import {
  appsRepository,
  type App,
  type NewApp,
  type AppUser,
  type AppAnalytics,
} from "@/db/repositories/apps";
import { apiKeysService } from "./api-keys";
import { logger } from "@/lib/utils/logger";
import crypto from "crypto";

/**
 * Service for app CRUD operations and app management.
 */
export class AppsService {
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);
  }

  async getById(id: string): Promise<App | undefined> {
    return await appsRepository.findById(id);
  }

  async getBySlug(slug: string): Promise<App | undefined> {
    return await appsRepository.findBySlug(slug);
  }

  async getByAffiliateCode(code: string): Promise<App | undefined> {
    return await appsRepository.findByAffiliateCode(code);
  }

  async listByOrganization(organizationId: string): Promise<App[]> {
    return await appsRepository.listByOrganization(organizationId);
  }

  async listAll(filters?: { isActive?: boolean; isApproved?: boolean }): Promise<App[]> {
    return await appsRepository.listAll(filters);
  }

  async create(data: {
    name: string;
    description?: string;
    organization_id: string;
    created_by_user_id: string;
    app_url: string;
    allowed_origins?: string[];
    logo_url?: string;
    website_url?: string;
    contact_email?: string;
    features_enabled?: {
      chat?: boolean;
      image?: boolean;
      video?: boolean;
      voice?: boolean;
      agents?: boolean;
      embedding?: boolean;
    };
    metadata?: Record<string, unknown>;
  }): Promise<{ app: App; apiKey: string }> {
    let slug = this.generateSlug(data.name);
    let slugAttempts = 0;

    while (slugAttempts < 10) {
      const existing = await appsRepository.findBySlug(slug);
      if (!existing) break;
      slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
      slugAttempts++;
    }

    if (slugAttempts >= 10) {
      throw new Error("Failed to generate unique slug");
    }

    const { apiKey, plainKey } = await apiKeysService.create({
      name: `${data.name} - App API Key`,
      description: `API key for app: ${data.name}`,
      organization_id: data.organization_id,
      user_id: data.created_by_user_id,
      permissions: ["apps.access", "generation.all"],
      rate_limit: 10000,
    });

    const app = await appsRepository.create({
      name: data.name,
      description: data.description,
      slug,
      organization_id: data.organization_id,
      created_by_user_id: data.created_by_user_id,
      app_url: data.app_url,
      allowed_origins: data.allowed_origins || [data.app_url],
      api_key_id: apiKey.id,
      logo_url: data.logo_url,
      website_url: data.website_url,
      contact_email: data.contact_email,
      features_enabled: data.features_enabled || { chat: true },
      metadata: data.metadata || {},
    });

    logger.info(`Created app: ${app.name} (${app.id})`, {
      appId: app.id,
      slug: app.slug,
      organizationId: app.organization_id,
    });

    return { app, apiKey: plainKey };
  }

  async update(id: string, data: Partial<NewApp>): Promise<App | undefined> {
    return await appsRepository.update(id, data);
  }

  async delete(id: string): Promise<void> {
    const app = await appsRepository.findById(id);

    if (app?.api_key_id) {
      await apiKeysService.delete(app.api_key_id);
    }

    await appsRepository.delete(id);

    logger.info(`Deleted app: ${id}`);
  }

  async trackUsage(
    appId: string,
    userId: string,
    creditsUsed: string = "0.00",
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await appsRepository.trackAppUserActivity(
      appId,
      userId,
      creditsUsed,
      metadata,
    );
  }

  async getAppUsers(appId: string, limit?: number): Promise<AppUser[]> {
    return await appsRepository.listAppUsers(appId, limit);
  }

  async getAnalytics(
    appId: string,
    periodType: "hourly" | "daily" | "monthly",
    startDate: Date,
    endDate: Date,
  ): Promise<AppAnalytics[]> {
    return await appsRepository.getAnalytics(
      appId,
      periodType,
      startDate,
      endDate,
    );
  }

  async getTotalStats(appId: string): Promise<{
    totalRequests: number;
    totalUsers: number;
    totalCreditsUsed: string;
  }> {
    return await appsRepository.getTotalStats(appId);
  }

  async validateOrigin(appId: string, origin: string): Promise<boolean> {
    const app = await appsRepository.findById(appId);

    if (!app || !app.is_active) {
      return false;
    }

    const allowedOrigins = app.allowed_origins as string[];

    if (allowedOrigins.includes("*")) {
      return true;
    }

    return allowedOrigins.some((allowed) => {
      if (allowed.includes("*")) {
        const pattern = allowed.replace(/\*/g, ".*");
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return allowed === origin;
    });
  }

  async regenerateApiKey(appId: string): Promise<string> {
    const app = await appsRepository.findById(appId);

    if (!app) {
      throw new Error("App not found");
    }

    if (app.api_key_id) {
      await apiKeysService.delete(app.api_key_id);
    }

    const { apiKey, plainKey } = await apiKeysService.create({
      name: `${app.name} - App API Key`,
      description: `Regenerated API key for app: ${app.name}`,
      organization_id: app.organization_id,
      user_id: app.created_by_user_id,
      permissions: ["apps.access", "generation.all"],
      rate_limit: 10000,
    });

    await appsRepository.update(appId, { api_key_id: apiKey.id });
    logger.info(`Regenerated API key for app: ${app.name} (${appId})`);

    return plainKey;
  }
}

export const appsService = new AppsService();
