import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";

export async function canSendLowCreditsEmail(
  organizationId: string,
): Promise<boolean> {
  const cacheKey = `low-credits-email-sent:${organizationId}`;

  try {
    const lastSent = await cache.get<{ sentAt: string }>(cacheKey);

    if (lastSent) {
      logger.info("[EmailRateLimiter] Low credits email recently sent", {
        organizationId,
        lastSent: lastSent.sentAt,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[EmailRateLimiter] Error checking rate limit", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return true;
  }
}

export async function markLowCreditsEmailSent(
  organizationId: string,
): Promise<void> {
  const cacheKey = `low-credits-email-sent:${organizationId}`;
  const cooldownHours = 24;
  const cooldownSeconds = cooldownHours * 60 * 60;

  try {
    await cache.set(
      cacheKey,
      { sentAt: new Date().toISOString() },
      cooldownSeconds,
    );

    logger.info("[EmailRateLimiter] Marked low credits email sent", {
      organizationId,
      cooldownHours,
    });
  } catch (error) {
    logger.error("[EmailRateLimiter] Error setting rate limit", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
