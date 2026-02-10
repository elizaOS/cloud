/**
 * Eliza App Credit Warnings Service
 *
 * Tracks when users were last warned about low credits to prevent spam.
 * Uses Redis cache with 24-hour TTL for warning cooldowns.
 */

import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";

const WARNING_KEY_PREFIX = "eliza-app:credit-warning:";
const WARNING_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Check if a user was warned recently (within cooldown period).
 * Returns the timestamp of last warning, or null if never warned or cooldown expired.
 */
export async function getLastCreditWarning(userId: string): Promise<number | null> {
  const key = `${WARNING_KEY_PREFIX}${userId}`;
  const timestamp = await cache.get(key);
  return timestamp ? Number(timestamp) : null;
}

/**
 * Record that a credit warning was sent to a user.
 * Sets a 24-hour TTL so warnings expire automatically.
 */
export async function recordCreditWarning(userId: string): Promise<void> {
  const key = `${WARNING_KEY_PREFIX}${userId}`;
  await cache.set(key, Date.now(), WARNING_COOLDOWN_SECONDS);
  logger.info("[ElizaApp CreditWarnings] Recorded warning", { userId });
}

/**
 * Check if we should send a credit warning to a user.
 * Returns true if the user hasn't been warned in the last 24 hours.
 */
export async function shouldSendCreditWarning(userId: string): Promise<boolean> {
  const lastWarning = await getLastCreditWarning(userId);
  if (!lastWarning) return true;
  
  const elapsed = Date.now() - lastWarning;
  return elapsed >= WARNING_COOLDOWN_SECONDS * 1000;
}

/**
 * Low credit threshold in USD.
 * Users below this balance will receive a warning.
 */
export const LOW_CREDIT_THRESHOLD = 1.0;
