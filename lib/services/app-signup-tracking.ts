import { appsRepository } from "@/db/repositories/apps";
import { appsService } from "./apps";
import { creditsService } from "./credits";
import {
  conversionTrackingService,
  parseUTMParams,
  type UTMParams,
} from "./conversion-tracking";
import { logger } from "@/lib/utils/logger";

export interface SignupTrackingData {
  userId: string;
  appId?: string;
  affiliateCode?: string;
  referralCode?: string;
  signupSource?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  utmParams?: UTMParams;
}

export class AppSignupTrackingService {
  async trackSignup(data: SignupTrackingData): Promise<void> {
    let appId = data.appId;

    if (!appId && data.affiliateCode) {
      const app = await appsService.getByAffiliateCode(data.affiliateCode);
      if (app) appId = app.id;
    }

    if (!appId) {
      logger.info("No app found for signup tracking", { data });
      return;
    }

    const existingAppUser = await appsRepository.findAppUser(
      appId,
      data.userId,
    );

    if (existingAppUser) {
      await appsRepository.updateAppUser(appId, data.userId, {
        metadata: {
          ...existingAppUser.metadata,
          signup_tracked: true,
          signup_source: data.signupSource,
        },
      });
    } else {
      await appsRepository.createAppUser({
        app_id: appId,
        user_id: data.userId,
        signup_source: data.signupSource || "app_referral",
        referral_code_used: data.referralCode || data.affiliateCode,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        metadata: data.metadata || {},
      });
    }

    logger.info("Tracked signup for app", {
      appId,
      userId: data.userId,
      affiliateCode: data.affiliateCode,
    });

    if (data.utmParams) {
      await conversionTrackingService.trackSignupFromUTM(
        data.userId,
        appId,
        data.utmParams,
      );
    }
  }

  async extractAffiliateCode(params: {
    queryParams?: URLSearchParams;
    cookies?: Map<string, string>;
  }): Promise<string | null> {
    const { queryParams, cookies } = params;

    if (queryParams) {
      const refCode = queryParams.get("ref");
      const affiliateCode = queryParams.get("affiliate");
      const appCode = queryParams.get("app");

      if (refCode) return refCode;
      if (affiliateCode) return affiliateCode;
      if (appCode) return appCode;
    }

    if (cookies) {
      const storedCode =
        cookies.get("affiliate_code") ||
        cookies.get("ref_code") ||
        cookies.get("app_code");

      if (storedCode) return storedCode;
    }

    return null;
  }

  extractUTMParams(params: {
    queryParams?: URLSearchParams;
    cookies?: Map<string, string>;
  }): UTMParams | null {
    const { queryParams, cookies } = params;

    if (queryParams) {
      const utmParams = parseUTMParams(queryParams);
      if (utmParams.utm_source || utmParams.utm_campaign) {
        return utmParams;
      }
    }

    if (cookies) {
      const storedUtm = cookies.get("utm_params");
      if (storedUtm) {
        const parsed = JSON.parse(storedUtm) as UTMParams;
        if (parsed.utm_source || parsed.utm_campaign) {
          return parsed;
        }
      }
    }

    return null;
  }

  async getAppFromRequest(params: {
    origin?: string;
    referrer?: string;
    affiliateCode?: string;
  }): Promise<string | null> {
    const { origin, referrer, affiliateCode } = params;

    if (affiliateCode) {
      const app = await appsService.getByAffiliateCode(affiliateCode);
      if (app) return app.id;
    }

    return null;
  }

  async awardReferralBonus(appId: string, userId: string): Promise<void> {
    const app = await appsRepository.findById(appId);

    if (!app) {
      logger.warn(`App not found: ${appId}`);
      return;
    }

    const bonusAmount = parseFloat(app.referral_bonus_credits || "0");
    if (bonusAmount <= 0) return;

    await creditsService.addCredits({
      organizationId: app.organization_id,
      amount: bonusAmount,
      description: "App signup referral bonus",
      metadata: { appId, userId, type: "app_signup_bonus" },
    });

    logger.info("Referral bonus awarded", {
      appId,
      userId,
      bonusAmount,
      organizationId: app.organization_id,
    });
  }
}

// Export singleton instance
export const appSignupTrackingService = new AppSignupTrackingService();
