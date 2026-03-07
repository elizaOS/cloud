import { affiliatesRepository } from "@/db/repositories/affiliates";
import type { AffiliateCode, UserAffiliate } from "@/db/schemas/affiliates";
import { logger } from "@/lib/utils/logger";
import { nanoid } from "nanoid";

// Error codes for consistent error handling
export const ERRORS = {
  INVALID_CODE: "Invalid affiliate code",
  CODE_NOT_FOUND: "Affiliate code not found",
  ALREADY_LINKED: "User is already linked to an affiliate",
  SELF_REFERRAL: "Users cannot refer themselves",
} as const;

function normalizeAffiliateCode(code: string): string {
  return code.trim().toUpperCase();
}

function isUniqueViolation(error: unknown): boolean {
  const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
  return (
    code === "23505" ||
    (error instanceof Error && error.message.includes("unique constraint"))
  );
}

/**
 * Affiliate (revenue-share) service. WHY separate from referrals: Referrals split
 * purchase revenue (50/40/10) at signup attribution; affiliates get a markup added
 * to what the customer pays (auto top-up, MCP). So we never apply both to the same
 * transaction, avoiding over-payout. getReferrer() is used by auto-top-up and
 * user-mcps to resolve markup; linkUserToAffiliateCode is used at signup or via API.
 */
export class AffiliatesService {
  /**
   * Returns the user's affiliate code if it exists. Read-only; does not create.
   */
  async getAffiliateCode(userId: string): Promise<AffiliateCode | null> {
    return affiliatesRepository.getAffiliateCodeByUserId(userId);
  }

  /**
   * Generates or returns an existing affiliate code for the user.
   */
  async getOrCreateAffiliateCode(
    userId: string,
    markupPercent?: number,
  ): Promise<AffiliateCode> {
    let affiliateCode = await affiliatesRepository.getAffiliateCodeByUserId(userId);
    if (affiliateCode) {
      if (
        markupPercent !== undefined &&
        Number(affiliateCode.markup_percent) !== markupPercent
      ) {
        return this.updateMarkup(userId, markupPercent);
      }
      return affiliateCode;
    }

    // WHY default 20%: Balances affiliate incentive with customer acceptance; can be overridden per code.
    const markup = markupPercent ?? 20.0;
    if (markup < 0 || markup > 1000) {
      throw new Error("Markup percent must be between 0 and 1000");
    }
    let attempts = 0;
    while (attempts < 10) {
      const code = `AFF-${nanoid(8).toUpperCase()}`;

      try {
        affiliateCode = await affiliatesRepository.createAffiliateCodeIfNotExists({
          user_id: userId,
          code,
          markup_percent: markup.toFixed(2) as string,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          affiliateCode =
            await affiliatesRepository.getAffiliateCodeByUserId(userId);
          if (affiliateCode) {
            logger.info("[Affiliates] Using concurrently created affiliate code", {
              userId,
            });
            break;
          }
          attempts++;
          continue;
        }
        throw error;
      }

      if (!affiliateCode) {
        affiliateCode =
          await affiliatesRepository.getAffiliateCodeByUserId(userId);
        if (affiliateCode) {
          logger.info("[Affiliates] Using concurrently created affiliate code", {
            userId,
          });
          break;
        }
        throw new Error("Failed to create or retrieve affiliate code");
      }

      logger.info("[Affiliates] Created new affiliate code", { userId, code });
      break;
    }

    if (!affiliateCode) {
      throw new Error("Failed to generate a unique affiliate code");
    }

    if (
      markupPercent !== undefined &&
      Number(affiliateCode.markup_percent) !== markupPercent
    ) {
      return this.updateMarkup(userId, markupPercent);
    }

    return affiliateCode;
  }

  /**
   * Updates the markup percentage for an affiliate code
   */
  async updateMarkup(userId: string, markupPercent: number): Promise<AffiliateCode> {
    if (markupPercent < 0 || markupPercent > 1000) {
      throw new Error("Markup percent must be between 0 and 1000");
    }

    const existing = await affiliatesRepository.getAffiliateCodeByUserId(userId);
    if (!existing) {
      throw new Error(ERRORS.CODE_NOT_FOUND);
    }

    const updated = await affiliatesRepository.updateAffiliateCode(existing.id, {
      markup_percent: markupPercent.toFixed(2) as string,
    });

    if (!updated) {
      throw new Error("Failed to update affiliate code");
    }

    logger.info("[Affiliates] Updated affiliate markup", { userId, markupPercent });
    return updated;
  }

  /**
   * Links a user to an affiliate code (invoked during signup)
   */
  async linkUserToAffiliateCode(userId: string, code: string): Promise<UserAffiliate> {
    const normalizedCode = normalizeAffiliateCode(code);
    const affiliateCode =
      await affiliatesRepository.getAffiliateCodeByCode(normalizedCode);
    if (!affiliateCode) {
      throw new Error(ERRORS.INVALID_CODE);
    }

    if (!affiliateCode.is_active) {
      throw new Error(ERRORS.INVALID_CODE);
    }

    if (affiliateCode.user_id === userId) {
      throw new Error(ERRORS.SELF_REFERRAL);
    }

    const existingLink = await affiliatesRepository.getUserAffiliate(userId);
    if (existingLink) {
      if (existingLink.affiliate_code_id === affiliateCode.id) {
        return existingLink;
      }
      throw new Error(ERRORS.ALREADY_LINKED);
    }

    let link: UserAffiliate;
    try {
      link = await affiliatesRepository.linkUserToAffiliate({
        user_id: userId,
        affiliate_code_id: affiliateCode.id,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentLink = await affiliatesRepository.getUserAffiliate(userId);
        if (concurrentLink?.affiliate_code_id === affiliateCode.id) {
          return concurrentLink;
        }
        throw new Error(ERRORS.ALREADY_LINKED);
      }
      throw error;
    }

    logger.info("[Affiliates] Linked user to affiliate code", {
      userId,
      code: normalizedCode,
    });
    return link;
  }

  /**
   * Retrieves the affiliate who referred the user (if any). Used by auto-top-up
   * and MCP to add markup to the charge and pay the affiliate from it.
   */
  async getReferrer(userId: string): Promise<AffiliateCode | null> {
    const link = await affiliatesRepository.getUserAffiliate(userId);
    if (!link) {
      return null;
    }
    const affiliateCode = await affiliatesRepository.getAffiliateCodeById(
      link.affiliate_code_id,
    );
    return affiliateCode?.is_active ? affiliateCode : null;
  }
}

export const affiliatesService = new AffiliatesService();
