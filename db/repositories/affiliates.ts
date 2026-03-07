import { dbRead, dbWrite } from "@/db/client";
import {
    affiliateCodes,
    userAffiliates,
    type AffiliateCode,
    type UserAffiliate,
    type NewAffiliateCode,
    type NewUserAffiliate,
} from "@/db/schemas/affiliates";
import { eq, and } from "drizzle-orm";

export class AffiliatesRepository {
    async createAffiliateCode(data: NewAffiliateCode): Promise<AffiliateCode> {
        const [result] = await dbWrite
            .insert(affiliateCodes)
            .values(data)
            .returning();
        return result;
    }

    async updateAffiliateCode(
        id: string,
        data: Partial<AffiliateCode>
    ): Promise<AffiliateCode | null> {
        const [result] = await dbWrite
            .update(affiliateCodes)
            .set({ ...data, updated_at: new Date() })
            .where(eq(affiliateCodes.id, id))
            .returning();
        return result || null;
    }

    async getAffiliateCodeByUserId(userId: string): Promise<AffiliateCode | null> {
        const result = await dbRead.query.affiliateCodes.findFirst({
            where: eq(affiliateCodes.user_id, userId),
        });
        return result || null;
    }

    async getAffiliateCodeByCode(code: string): Promise<AffiliateCode | null> {
        const result = await dbRead.query.affiliateCodes.findFirst({
            where: eq(affiliateCodes.code, code),
        });
        return result || null;
    }

    async getAffiliateCodeById(id: string): Promise<AffiliateCode | null> {
        const result = await dbRead.query.affiliateCodes.findFirst({
            where: eq(affiliateCodes.id, id),
        });
        return result || null;
    }

    async linkUserToAffiliate(data: NewUserAffiliate): Promise<UserAffiliate> {
        const [result] = await dbWrite
            .insert(userAffiliates)
            .values(data)
            .returning();
        return result;
    }

    async getUserAffiliate(userId: string): Promise<UserAffiliate | null> {
        const result = await dbRead.query.userAffiliates.findFirst({
            where: eq(userAffiliates.user_id, userId),
        });
        return result || null;
    }
}

export const affiliatesRepository = new AffiliatesRepository();
