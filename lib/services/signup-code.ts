/**
 * Signup code service: validate codes and grant bonus credits (one-time per org).
 *
 * WHY: Marketing/ads need shareable links that grant extra credits; a JSON config
 * lets us add codes per campaign without env or DB. One per org keeps abuse low.
 *
 * Config: config/signup-codes.json — { "codes": { "code": amount, ... } }
 * See docs/signup-codes.md for design WHYs and API.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { creditsService } from "@/lib/services/credits";
import { creditTransactionsRepository } from "@/db/repositories/credit-transactions";
import { logger } from "@/lib/utils/logger";
import { isUniqueConstraintError } from "@/lib/utils/db-errors";
import { isUniqueConstraintError } from "@/lib/utils/db-errors";

const CONFIG_PATH = join(process.cwd(), "config/signup-codes.json");

interface SignupCodesConfig {
  codes?: Record<string, number>;
}

/** Load codes from JSON; WHY file not env: versioned, reviewable, many codes without env bloat. */
function loadCodes(): Map<string, number> {
  if (!existsSync(CONFIG_PATH)) {
    return new Map();
  }
  let data: SignupCodesConfig;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    data = JSON.parse(raw) as SignupCodesConfig;
  } catch (err) {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logger.warn(
      `[SignupCode] Failed to load config/signup-codes.json (${message}), using no codes`
    );
    return new Map();
  }
  const codes = data.codes;
  if (!codes || typeof codes !== "object") {
    return new Map();
  }
  const map = new Map<string, number>();
  for (const [code, amount] of Object.entries(codes)) {
    const normalized = code?.trim().toLowerCase();
    if (!normalized) continue;
    const num = typeof amount === "number" ? amount : parseFloat(String(amount));
    if (!isNaN(num) && num > 0) {
      map.set(normalized, num);
    }
  }
  return map;
}

let cachedCodes: Map<string, number> | null = null;

/** Cached so we don't read disk on every redeem; new codes apply after cold start. */
function getCodes(): Map<string, number> {
  if (cachedCodes === null) {
    cachedCodes = loadCodes();
  }
  return cachedCodes;
}

/**
 * Returns bonus credit amount for a valid code, or undefined if invalid.
 */
export function getBonusForCode(code: string): number | undefined {
  if (!code?.trim()) return undefined;
  return getCodes().get(code.trim().toLowerCase());
}

/**
 * True if the organization has already received a signup code bonus.
 * WHY hasSignupCodeBonus uses primary (dbWrite): read replica can be stale; primary avoids double-grant.
 */
export async function hasUsedSignupCode(organizationId: string): Promise<boolean> {
  return creditTransactionsRepository.hasSignupCodeBonus(organizationId);
}

/** WHY redact: code is a shared secret; logs need audit trail without leaking full value. */
function redactCode(code: string): string {
  const s = code.trim().toLowerCase();
  if (s.length <= 2) return "***";
  return s.slice(0, 2) + "***";
}

/**
 * Apply a signup code for an organization: validate, check not already used, add credits.
 * WHY catch unique violation: concurrent requests can both pass hasUsedSignupCode; DB index rejects 2nd insert.
 * @returns Applied bonus amount, or throws if invalid or already used.
 */
export async function redeemSignupCode(
  organizationId: string,
  code: string,
): Promise<number> {
  const bonus = getBonusForCode(code);
  if (bonus === undefined) {
    throw new Error("Invalid signup code");
  }

  const used = await hasUsedSignupCode(organizationId);
  if (used) {
    throw new Error("Your account has already used a signup code");
  }

  try {
    await creditsService.addCredits({
      organizationId,
      amount: bonus,
      description: "Signup code bonus",
      metadata: {
        type: "signup_code_bonus",
        code: redactCode(code),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Your account has already used a signup code");
    }
    throw error;
  }

  logger.info("[SignupCode] Redeemed", {
    organizationId,
    code: redactCode(code),
    bonus,
  });

  return bonus;
}
