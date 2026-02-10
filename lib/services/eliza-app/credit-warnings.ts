/**
 * Eliza App Credit Warnings Service
 *
 * Tracks when users were last warned about low credits to prevent spam.
 * Uses Redis cache with 24-hour TTL for warning cooldowns.
 *
 * Credit States:
 * - HEALTHY: balance >= LOW_CREDIT_THRESHOLD ($1.00)
 * - LOW: 0 < balance < LOW_CREDIT_THRESHOLD - warn once per 24h
 * - DEPLETED: balance <= 0 - block processing, send out-of-credits message
 */

import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { elizaAppConfig } from "./config";
import { isStripeConfigured } from "@/lib/stripe";

const WARNING_KEY_PREFIX = "eliza-app:credit-warning:";
const DEPLETED_KEY_PREFIX = "eliza-app:credit-depleted:";
const WARNING_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours
const DEPLETED_COOLDOWN_SECONDS = 4 * 60 * 60; // 4 hours for depleted messages

/**
 * Low credit threshold in USD.
 * Users below this balance will receive a warning.
 */
export const LOW_CREDIT_THRESHOLD = 1.0;

/**
 * Credit state for a user's organization.
 */
export type CreditState = "healthy" | "low" | "depleted";

/**
 * Determine the credit state for a given balance.
 */
export function getCreditState(balance: number): CreditState {
  if (balance <= 0) return "depleted";
  if (balance < LOW_CREDIT_THRESHOLD) return "low";
  return "healthy";
}

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
 * Check if we should send a depleted credits message.
 * Returns true if the user hasn't been notified in the last 4 hours.
 */
export async function shouldSendDepletedMessage(userId: string): Promise<boolean> {
  const key = `${DEPLETED_KEY_PREFIX}${userId}`;
  const timestamp = await cache.get(key);
  if (!timestamp) return true;
  
  const elapsed = Date.now() - Number(timestamp);
  return elapsed >= DEPLETED_COOLDOWN_SECONDS * 1000;
}

/**
 * Record that a depleted credits message was sent.
 */
export async function recordDepletedMessage(userId: string): Promise<void> {
  const key = `${DEPLETED_KEY_PREFIX}${userId}`;
  await cache.set(key, Date.now(), DEPLETED_COOLDOWN_SECONDS);
  logger.info("[ElizaApp CreditWarnings] Recorded depleted message", { userId });
}

/**
 * Build the low credits warning message.
 * Written for users who may not know what "credits" or "Eliza Cloud" means.
 */
export function buildLowCreditMessage(balance: number, platform: "telegram" | "imessage"): string {
  const balanceStr = balance.toFixed(2);
  
  let message = `⚠️ Running Low on Messages\n\n`;
  message += `You have $${balanceStr} of credit remaining. `;
  message += `Each message costs a small amount to process.\n\n`;
  
  if (isStripeConfigured()) {
    const topUpUrl = `${elizaAppConfig.appUrl}/topup`;
    if (platform === "telegram") {
      message += `👉 [Add more credit here](${topUpUrl}) to keep chatting!`;
    } else {
      message += `Add more credit to keep chatting: ${topUpUrl}`;
    }
  } else {
    message += `Contact support to add more credit.`;
  }
  
  return message;
}

/**
 * Build the out-of-credits message.
 * Clear explanation for new users who just want to keep messaging.
 */
export function buildOutOfCreditsMessage(platform: "telegram" | "imessage"): string {
  let message = `💳 Out of Credit\n\n`;
  message += `You've used all your free messages! `;
  message += `To keep chatting, you'll need to add credit to your account.\n\n`;
  
  if (isStripeConfigured()) {
    const topUpUrl = `${elizaAppConfig.appUrl}/topup`;
    if (platform === "telegram") {
      message += `👉 [Add credit here](${topUpUrl}) - it only takes a minute!\n\n`;
    } else {
      message += `Add credit here (takes 1 minute): ${topUpUrl}\n\n`;
    }
    message += `Starting at $5, you can send hundreds more messages.`;
  } else {
    message += `Contact support to add more credit to your account.`;
  }
  
  return message;
}

/**
 * Check user's credit state and return appropriate action.
 * Returns null if credits are healthy or a message has been sent recently.
 */
export async function checkCreditsAndGetMessage(
  userId: string,
  balance: number,
  platform: "telegram" | "imessage",
): Promise<{ state: CreditState; message: string | null; shouldBlockProcessing: boolean }> {
  const state = getCreditState(balance);
  
  if (state === "healthy") {
    return { state, message: null, shouldBlockProcessing: false };
  }
  
  if (state === "depleted") {
    // Always block processing when depleted
    // Only send message if cooldown has passed
    if (await shouldSendDepletedMessage(userId)) {
      await recordDepletedMessage(userId);
      return {
        state,
        message: buildOutOfCreditsMessage(platform),
        shouldBlockProcessing: true,
      };
    }
    return { state, message: null, shouldBlockProcessing: true };
  }
  
  // Low credits - warn but don't block
  if (await shouldSendCreditWarning(userId)) {
    await recordCreditWarning(userId);
    return {
      state,
      message: buildLowCreditMessage(balance, platform),
      shouldBlockProcessing: false,
    };
  }
  
  return { state, message: null, shouldBlockProcessing: false };
}
