import { affiliatesRepository } from "@/db/repositories/affiliates";
import type { AffiliateCode, UserAffiliate } from "@/db/schemas/affiliates";
import { logger } from "@/lib/utils/logger";
import { nanoid } from "nanoid";

/**
 * Affiliate (revenue-share) service. WHY separate from referrals: Referrals split
 * purchase revenue (50/40/10) at signup attribution; affiliates get a markup added
 * to what the customer pays (auto top-up, MCP). So we never apply both to the same
 * transaction, avoiding over-payout. getReferrer() is used by auto-top-up and
 * user-mcps to resolve markup; linkUserToAffiliateCode is used at signup or via API.
 */
export class AffiliatesService {
    /**
     * Generates or returns an existing affiliate code for the user.
     */
    async getOrCreateAffiliateCode(
        userId: string,
        markupPercent?: number
    ): Promise<AffiliateCode> {
        const existing = await affiliatesRepository.getAffiliateCodeByUserId(userId);
        if (existing) {
            if (markupPercent !== undefined && Number(existing.markup_percent) !== markupPercent) {
                return this.updateMarkup(userId, markupPercent);
            }
            return existing;
        }

        // WHY default 20%: Balances affiliate incentive with customer acceptance; can be overridden per code.
        const markup = markupPercent ?? 20.0;
        if (markup < 0 || markup > 1000) {
            throw new Error("Markup percent must be between 0 and 1000");
        }

        const code = `AFF-${nanoid(8).toUpperCase()}`;

        const newCode = await affiliatesRepository.createAffiliateCode({
            user_id: userId,
            code,
            markup_percent: Number(markup.toFixed(2)),
        });

        logger.info("[Affiliates] Created new affiliate code", { userId, code });
        return newCode;
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
            markup_percent: markupPercent.toFixed(2) as any,
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
