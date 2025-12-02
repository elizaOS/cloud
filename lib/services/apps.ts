import { appsRepository, type App, type NewApp, type AppUser, type AppAnalytics } from "@/db/repositories/apps";
import { apiKeysService } from "./api-keys";
import { logger } from "@/lib/utils/logger";
import crypto from "crypto";

export class AppsService {
  /**
   * Generate a unique slug from app name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);
  }

  /**
   * Generate a unique affiliate code
   */
  private generateAffiliateCode(appName: string): string {
    const prefix = appName
      .substring(0, 4)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `${prefix}-${random}`;
  }

  /**
   * Get app by ID
   */
  async getById(id: string): Promise<App | undefined> {
    return await appsRepository.findById(id);
  }

  /**
   * Get app by slug
   */
  async getBySlug(slug: string): Promise<App | undefined> {
    return await appsRepository.findBySlug(slug);
  }

  /**
   * Get app by affiliate code
   */
  async getByAffiliateCode(code: string): Promise<App | undefined> {
    return await appsRepository.findByAffiliateCode(code);
  }

  /**
   * List all apps for an organization
   */
  async listByOrganization(organizationId: string): Promise<App[]> {
    return await appsRepository.listByOrganization(organizationId);
  }

  /**
   * List all apps (admin function)
   */
  async listAll(filters?: {
    isActive?: boolean;
    isApproved?: boolean;
  }): Promise<App[]> {
    return await appsRepository.listAll(filters);
  }

  /**
   * Create a new app with automatic API key generation
   */
  async create(data: {
    name: string;
    description?: string;
    organization_id: string;
    created_by_user_id: string;
    app_url: string;
    allowed_origins?: string[];
    features_enabled?: Record<string, boolean>;
    custom_pricing_enabled?: boolean;
    custom_pricing_markup?: string;
    rate_limit_per_minute?: number;
    rate_limit_per_hour?: number;
    logo_url?: string;
    website_url?: string;
    contact_email?: string;
    generate_affiliate_code?: boolean;
  }): Promise<{
    app: App;
    apiKey: string;
  }> {
    // Generate slug
    let slug = this.generateSlug(data.name);
    let slugAttempts = 0;

    // Ensure slug is unique
    while (slugAttempts < 10) {
      const existing = await appsRepository.findBySlug(slug);
      if (!existing) break;
      slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
      slugAttempts++;
    }

    if (slugAttempts >= 10) {
      throw new Error("Failed to generate unique slug");
    }

    // Generate affiliate code if requested
    let affiliateCode: string | undefined;
    if (data.generate_affiliate_code) {
      affiliateCode = this.generateAffiliateCode(data.name);
      let codeAttempts = 0;

      while (codeAttempts < 10) {
        const existing = await appsRepository.findByAffiliateCode(affiliateCode);
        if (!existing) break;
        affiliateCode = this.generateAffiliateCode(data.name);
        codeAttempts++;
      }

      if (codeAttempts >= 10) {
        throw new Error("Failed to generate unique affiliate code");
      }
    }

    // Create API key for the app
    const { apiKey, plainKey } = await apiKeysService.create({
      name: `${data.name} - App API Key`,
      description: `Automatically generated API key for app: ${data.name}`,
      organization_id: data.organization_id,
      user_id: data.created_by_user_id,
      permissions: ["apps.access", "generation.all"],
      rate_limit: data.rate_limit_per_hour || 10000,
    });

    // Create the app
    const app = await appsRepository.create({
      name: data.name,
      description: data.description,
      slug,
      organization_id: data.organization_id,
      created_by_user_id: data.created_by_user_id,
      app_url: data.app_url,
      allowed_origins: data.allowed_origins || [data.app_url],
      api_key_id: apiKey.id,
      affiliate_code: affiliateCode,
      features_enabled: data.features_enabled || {
        chat: true,
        image: false,
        video: false,
        voice: false,
        agents: false,
        embedding: false,
      },
      custom_pricing_enabled: data.custom_pricing_enabled || false,
      custom_pricing_markup: data.custom_pricing_markup || "0.00",
      rate_limit_per_minute: data.rate_limit_per_minute || 60,
      rate_limit_per_hour: data.rate_limit_per_hour || 1000,
      logo_url: data.logo_url,
      website_url: data.website_url,
      contact_email: data.contact_email,
    });

    logger.info(`Created app: ${app.name} (${app.id})`, {
      appId: app.id,
      slug: app.slug,
      organizationId: app.organization_id,
    });

    return {
      app,
      apiKey: plainKey,
    };
  }

  /**
   * Update an app
   */
  async update(
    id: string,
    data: Partial<NewApp>
  ): Promise<App | undefined> {
    return await appsRepository.update(id, data);
  }

  /**
   * Delete an app
   */
  async delete(id: string): Promise<void> {
    const app = await appsRepository.findById(id);
    
    if (app?.api_key_id) {
      // Delete associated API key
      await apiKeysService.delete(app.api_key_id);
    }

    await appsRepository.delete(id);
    
    logger.info(`Deleted app: ${id}`);
  }

  /**
   * Track usage for an app
   */
  async trackUsage(
    appId: string,
    userId: string,
    creditsUsed: string = "0.00",
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await appsRepository.trackAppUserActivity(appId, userId, creditsUsed, metadata);
  }

  /**
   * Get app users
   */
  async getAppUsers(appId: string, limit?: number): Promise<AppUser[]> {
    return await appsRepository.listAppUsers(appId, limit);
  }

  /**
   * Get app analytics
   */
  async getAnalytics(
    appId: string,
    periodType: "hourly" | "daily" | "monthly",
    startDate: Date,
    endDate: Date
  ): Promise<AppAnalytics[]> {
    return await appsRepository.getAnalytics(appId, periodType, startDate, endDate);
  }

  /**
   * Get app total stats
   */
  async getTotalStats(appId: string): Promise<{
    totalRequests: number;
    totalUsers: number;
    totalCreditsUsed: string;
  }> {
    return await appsRepository.getTotalStats(appId);
  }

  /**
   * Validate origin against app's allowed origins
   */
  async validateOrigin(appId: string, origin: string): Promise<boolean> {
    const app = await appsRepository.findById(appId);
    
    if (!app || !app.is_active) {
      return false;
    }

    // Check if origin is in allowed list
    const allowedOrigins = app.allowed_origins as string[];
    
    if (allowedOrigins.includes("*")) {
      return true; // Allow all origins
    }

    return allowedOrigins.some((allowed) => {
      // Support wildcard subdomains like *.example.com
      if (allowed.includes("*")) {
        const pattern = allowed.replace(/\*/g, ".*");
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return allowed === origin;
    });
  }

  /**
   * Regenerate API key for an app
   */
  async regenerateApiKey(appId: string): Promise<string> {
    const app = await appsRepository.findById(appId);
    
    if (!app) {
      throw new Error("App not found");
    }

    // Delete old API key if exists
    if (app.api_key_id) {
      await apiKeysService.delete(app.api_key_id);
    }

    // Create new API key
    const { apiKey, plainKey } = await apiKeysService.create({
      name: `${app.name} - App API Key`,
      description: `Regenerated API key for app: ${app.name}`,
      organization_id: app.organization_id,
      user_id: app.created_by_user_id,
      permissions: ["apps.access", "generation.all"],
      rate_limit: app.rate_limit_per_hour || 10000,
    });

    // Update app with new API key ID
    await appsRepository.update(appId, {
      api_key_id: apiKey.id,
    });

    logger.info(`Regenerated API key for app: ${app.name} (${appId})`);

    return plainKey;
  }
}

// Export singleton instance
export const appsService = new AppsService();

