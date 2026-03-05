import { organizations } from "@/db/schemas/organizations";
import { usersRepository } from "@/db/repositories";
import { emailService } from "./email";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent } from "@/lib/analytics/posthog-server";

/**
 * Constants for auto top-up validation
 */
export const AUTO_TOP_UP_LIMITS = {
  MIN_AMOUNT: 1,
  MAX_AMOUNT: 1000,
  MIN_THRESHOLD: 0,
  MAX_THRESHOLD: 1000,
} as const;

/**
 * Service for managing automatic balance top-ups
 */
export class AutoTopUpService {
  validateSettings(amount: number, threshold: number): void {
    if (amount < AUTO_TOP_UP_LIMITS.MIN_AMOUNT) {
      throw new Error(
        `Auto top-up amount must be at least $${AUTO_TOP_UP_LIMITS.MIN_AMOUNT}`
      );
    }
    if (amount > AUTO_TOP_UP_LIMITS.MAX_AMOUNT) {
      throw new Error(
        `Auto top-up amount cannot exceed $${AUTO_TOP_UP_LIMITS.MAX_AMOUNT}`
      );
    }
    if (threshold < AUTO_TOP_UP_LIMITS.MIN_THRESHOLD) {
      throw new Error(
        `Auto top-up threshold must be at least $${AUTO_TOP_UP_LIMITS.MIN_THRESHOLD}`
      );
    }
    if (threshold > AUTO_TOP_UP_LIMITS.MAX_THRESHOLD) {
      throw new Error(
        `Auto top-up threshold cannot exceed $${AUTO_TOP_UP_LIMITS.MAX_THRESHOLD}`
      );
    }
    if (!Number.isFinite(amount) || !Number.isFinite(threshold)) {
      throw new Error("Auto top-up settings must be valid numbers");
    }
  }

  async executeAutoTopUp(org: any): Promise<any> {
    const organizationId = org.id;

    let trackingId = null;
    try {
      const users = await usersRepository.listByOrganization(organizationId);
      const billingUser = org.billing_email
        ? users.find((u: any) => u.email === org.billing_email)
        : null;
      const userId = billingUser?.id || (users.length > 0 ? users[0].id : null);

      if (!userId) {
        logger.warn("No user ID found for analytics");
      } else {
        trackingId = userId;
      }
    } catch (userLookupError) {
      logger.warn("[AutoTopUp] Failed to fetch users for analytics", {
        organizationId,
        error:
          userLookupError instanceof Error
            ? userLookupError.message
            : "Unknown error",
      });
    }

    if (!trackingId) {
      logger.info(
        `[AutoTopUp] Skipping tracking for org ${organizationId} as no user ID is available.`
      );
      return { success: true };
    }

    const metadata: Record<string, string> = {
      organization_id: organizationId,
      credits: "100.00",
      type: "auto_top_up",
      user_id: trackingId,
    };

    logger.info(`[AutoTopUp] Metadata prepared: ${JSON.stringify(metadata)}`);

    trackServerEvent(trackingId, "auto_topup_triggered", metadata);

    // Other processing...

    return {
      success: true,
    };
  }
}

export const autoTopUpService = new AutoTopUpService();
