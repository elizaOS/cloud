/**
 * Eliza App OTP Service
 *
 * Handles OTP generation, storage (Redis), and verification for phone authentication.
 * Uses cryptographically secure random generation and timing-safe comparison.
 */

import { randomInt, timingSafeEqual, createHash } from "crypto";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { normalizePhoneNumber } from "@/lib/utils/phone-normalization";
import { blooioApiRequest, type BlooioSendMessageResponse } from "@/lib/utils/blooio-api";
import { elizaAppConfig } from "./config";

interface OTPRecord {
  otpHash: string;
  attempts: number;
  createdAt: number;
  expiresAt: number;
}

export interface SendOTPResult {
  success: boolean;
  error?: string;
  retryAfter?: number;
}

export interface VerifyOTPResult {
  valid: boolean;
  error?: string;
  attemptsRemaining?: number;
}

// Configuration - exported for testing
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const MAX_ATTEMPTS = 5;
export const COOLDOWN_SECONDS = 60; // 1 minute between OTP sends

// Redis key prefixes
export const OTP_KEY_PREFIX = "eliza-app:otp:";
export const COOLDOWN_KEY_PREFIX = "eliza-app:otp-cooldown:";

// Dev mode - use fixed OTP for local testing
export const IS_DEV_MODE = process.env.NODE_ENV !== "production";
export const DEV_OTP = "123456";

// In-memory OTP storage fallback for local dev (when Redis not available)
const inMemoryOTPStore = new Map<string, OTPRecord>();

// Range 100000-999999 intentionally avoids leading zeros for better UX
export function generateOTP(): string {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return String(randomInt(min, max + 1));
}

export function hashOTP(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export function verifyOTPHash(providedOTP: string, storedHash: string): boolean {
  const providedHash = hashOTP(providedOTP);
  const providedBuffer = Buffer.from(providedHash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (providedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, storedBuffer);
}

class OTPService {
  private readonly blooioApiKey: string;
  private readonly blooioPhoneNumber: string;

  constructor() {
    this.blooioApiKey = elizaAppConfig.blooio.apiKey;
    this.blooioPhoneNumber = elizaAppConfig.blooio.phoneNumber;
  }

  async sendOTP(phoneNumber: string): Promise<SendOTPResult> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!IS_DEV_MODE) {
      const cooldownKey = `${COOLDOWN_KEY_PREFIX}${normalizedPhone}`;
      const cooldownActive = await cache.get<boolean>(cooldownKey);

      if (cooldownActive) {
        logger.warn("[OTP] Cooldown active for phone", {
          phone: `***${normalizedPhone.slice(-2)}`,
        });
        return {
          success: false,
          error: "Please wait before requesting another code",
          retryAfter: COOLDOWN_SECONDS,
        };
      }
    }

    if (IS_DEV_MODE) {
      const otp = DEV_OTP;
      const otpHash = hashOTP(otp);
      const now = Math.floor(Date.now() / 1000);

      const otpKey = `${OTP_KEY_PREFIX}${normalizedPhone}`;
      const record: OTPRecord = {
        otpHash,
        attempts: 0,
        createdAt: now,
        expiresAt: now + OTP_EXPIRY_SECONDS,
      };

      await cache.set(otpKey, record, OTP_EXPIRY_SECONDS);
      inMemoryOTPStore.set(otpKey, record);

      logger.info("[OTP] DEV MODE - OTP set to 123456", {
        phone: `***${normalizedPhone.slice(-2)}`,
      });

      return { success: true };
    }

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const now = Math.floor(Date.now() / 1000);

    const otpKey = `${OTP_KEY_PREFIX}${normalizedPhone}`;
    const record: OTPRecord = {
      otpHash,
      attempts: 0,
      createdAt: now,
      expiresAt: now + OTP_EXPIRY_SECONDS,
    };

    await cache.set(otpKey, record, OTP_EXPIRY_SECONDS);

    const message = `Your Eliza verification code is: ${otp}. It expires in 5 minutes.`;
    const idempotencyKey = `otp-${normalizedPhone}-${now}`;

    try {
      await blooioApiRequest<BlooioSendMessageResponse>(
        this.blooioApiKey,
        "POST",
        `/chats/${encodeURIComponent(normalizedPhone)}/messages`,
        { text: message },
        { fromNumber: this.blooioPhoneNumber, idempotencyKey }
      );

      // Set cooldown only after successful send
      const cooldownKey = `${COOLDOWN_KEY_PREFIX}${normalizedPhone}`;
      await cache.set(cooldownKey, true, COOLDOWN_SECONDS);

      logger.info("[OTP] Sent OTP via iMessage", {
        phone: `***${normalizedPhone.slice(-2)}`,
      });

      return { success: true };
    } catch (error) {
      logger.error("[OTP] Failed to send OTP via Blooio", {
        phone: `***${normalizedPhone.slice(-2)}`,
        error: error instanceof Error ? error.message : String(error),
      });

      await cache.del(otpKey);

      return {
        success: false,
        error: "Failed to send verification code. Please try again.",
      };
    }
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<VerifyOTPResult> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const otpKey = `${OTP_KEY_PREFIX}${normalizedPhone}`;

    let record = await cache.get<OTPRecord>(otpKey);
    if (!record && IS_DEV_MODE) {
      record = inMemoryOTPStore.get(otpKey) || null;
    }

    if (!record) {
      logger.warn("[OTP] No OTP found for phone", {
        phone: `***${normalizedPhone.slice(-2)}`,
      });
      return {
        valid: false,
        error: "Verification code expired or not found. Please request a new code.",
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > record.expiresAt) {
      await cache.del(otpKey);
      if (IS_DEV_MODE) inMemoryOTPStore.delete(otpKey);
      return {
        valid: false,
        error: "Verification code expired. Please request a new code.",
      };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await cache.del(otpKey);
      if (IS_DEV_MODE) inMemoryOTPStore.delete(otpKey);
      return {
        valid: false,
        error: "Too many attempts. Please request a new code.",
      };
    }

    const isValid = verifyOTPHash(otp, record.otpHash);

    if (!isValid) {
      record.attempts += 1;
      const remainingTTL = record.expiresAt - now;
      await cache.set(otpKey, record, remainingTTL);
      if (IS_DEV_MODE) inMemoryOTPStore.set(otpKey, record);

      const attemptsRemaining = MAX_ATTEMPTS - record.attempts;

      logger.warn("[OTP] Invalid OTP attempt", {
        phone: `***${normalizedPhone.slice(-2)}`,
        attempts: record.attempts,
        attemptsRemaining,
      });

      return {
        valid: false,
        error: `Invalid code. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining.`,
        attemptsRemaining,
      };
    }

    await cache.del(otpKey);
    if (IS_DEV_MODE) inMemoryOTPStore.delete(otpKey);

    logger.info("[OTP] OTP verified successfully", {
      phone: `***${normalizedPhone.slice(-2)}`,
    });

    return { valid: true };
  }

  async hasActiveOTP(phoneNumber: string): Promise<boolean> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const otpKey = `${OTP_KEY_PREFIX}${normalizedPhone}`;

    let record = await cache.get<OTPRecord>(otpKey);
    if (!record && IS_DEV_MODE) {
      record = inMemoryOTPStore.get(otpKey) || null;
    }
    if (!record) return false;

    const now = Math.floor(Date.now() / 1000);
    return now <= record.expiresAt && record.attempts < MAX_ATTEMPTS;
  }

  async getCooldownRemaining(phoneNumber: string): Promise<number> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const cooldownKey = `${COOLDOWN_KEY_PREFIX}${normalizedPhone}`;
    const cooldownActive = await cache.get<boolean>(cooldownKey);

    // If cooldown is active, we don't know exact remaining time without Redis TTL
    // Return full cooldown as estimate
    return cooldownActive ? COOLDOWN_SECONDS : 0;
  }
}

export const otpService = new OTPService();
