import { affiliatesRepository } from "@/db/repositories/affiliates";
import type { AffiliateCode, UserAffiliate } from "@/db/schemas/affiliates";
import { logger } from "@/lib/utils/logger";
import { nanoid } from "nanoid";

// Error codes for consistent error handling
export const ERRORS = {
    INVALID_CODE: "Invalid affiliate code",
    CODE_NOT_FOUND: "Affiliate code not found",
    ALREADY_LINKED: "User is already linked to an affiliate",
    SELF_REFERRAL: "Users cannot refer themselves"
} as const;

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
        markupPercent?: number
    ): Promise<AffiliateCode> {
        // First try to get existing code
        let affiliateCode = await affiliatesRepository.getAffiliateCodeByUserId(userId);
        if (affiliateCode) {
            if (markupPercent !== undefined && Number(affiliateCode.markup_percent) !== markupPercent) {
                return this.updateMarkup(userId, markupPercent);
            }
            return affiliateCode;
        }

        // WHY default 20%: Balances affiliate incentive with customer acceptance; can be overridden per code.
        const markup = markupPercent ?? 20.0;
        if (markup < 0 || markup > 1000) {
            throw new Error("Markup percent must be between 0 and 1000");
        }

        const code = `AFF-${nanoid(8).toUpperCase()}`;

        // Try to insert, but if a concurrent insert happened, get the existing record
        affiliateCode = await affiliatesRepository.createAffiliateCodeIfNotExists({
            user_id: userId,
            code,
            markup_percent: markup.toFixed(2) as string,
        });

        if (!affiliateCode) {
            // Another request won the race, get the existing code
            affiliateCode = await affiliatesRepository.getAffiliateCodeByUserId(userId);
            if (!affiliateCode) {
                throw new Error("Failed to create or retrieve affiliate code");
            }
            logger.info("[Affiliates] Using concurrently created affiliate code", { userId });
        } else {
            logger.info("[Affiliates] Created new affiliate code", { userId, code });
        }

        // Check if markup needs to be updated
        if (markupPercent !== undefined && Number(affiliateCode.markup_percent) !== markupPercent) {
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
            throw new Error("Affiliate code not found for user");
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
        const existingLink = await affiliatesRepository.getUserAffiliate(userId);
        if (existingLink) {
            throw new Error("User is already linked to an affiliate");
        }

        const affiliateCode = await affiliatesRepository.getAffiliateCodeByCode(code);
        if (!affiliateCode) {
            throw new Error("Invalid affiliate code");
        }

        if (affiliateCode.user_id === userId) {
            throw new Error("Users cannot refer themselves");
        }

        const link = await affiliatesRepository.linkUserToAffiliate({
            user_id: userId,
            affiliate_code_id: affiliateCode.id,
        });

        logger.info("[Affiliates] Linked user to affiliate code", { userId, code });
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
        return affiliatesRepository.getAffiliateCodeById(link.affiliate_code_id);
    }
}

export const affiliatesService = new AffiliatesService();
