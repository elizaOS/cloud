import { eq, and, gte, sql, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  referralCodes,
  referralSignups,
  socialShareRewards,
  type ReferralCode,
  type NewReferralCode,
  type ReferralSignup,
  type NewReferralSignup,
  type SocialShareReward,
  type NewSocialShareReward,
} from "@/db/schemas/referrals";

class ReferralCodesRepository {
  async findById(id: string): Promise<ReferralCode | null> {
    const [result] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.id, id))
      .limit(1);
    return result || null;
  }

  async findByUserId(userId: string): Promise<ReferralCode | null> {
    const [result] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.user_id, userId))
      .limit(1);
    return result || null;
  }

  async findByCode(code: string): Promise<ReferralCode | null> {
    const [result] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code.toUpperCase()))
      .limit(1);
    return result || null;
  }

  async create(data: NewReferralCode): Promise<ReferralCode> {
    const [result] = await db.insert(referralCodes).values(data).returning();
    return result;
  }

  async incrementReferrals(id: string): Promise<void> {
    await db
      .update(referralCodes)
      .set({
        total_referrals: sql`${referralCodes.total_referrals} + 1`,
      })
      .where(eq(referralCodes.id, id));
  }

  async addSignupEarnings(id: string, amount: number): Promise<void> {
    await db
      .update(referralCodes)
      .set({
        total_signup_earnings: sql`${referralCodes.total_signup_earnings} + ${amount}`,
      })
      .where(eq(referralCodes.id, id));
  }

  async addCommissionEarnings(id: string, amount: number): Promise<void> {
    await db
      .update(referralCodes)
      .set({
        total_commission_earnings: sql`${referralCodes.total_commission_earnings} + ${amount}`,
      })
      .where(eq(referralCodes.id, id));
  }

  async addQualifiedEarnings(id: string, amount: number): Promise<void> {
    await db
      .update(referralCodes)
      .set({
        total_qualified_earnings: sql`${referralCodes.total_qualified_earnings} + ${amount}`,
      })
      .where(eq(referralCodes.id, id));
  }
}

class ReferralSignupsRepository {
  async findById(id: string): Promise<ReferralSignup | null> {
    const [result] = await db
      .select()
      .from(referralSignups)
      .where(eq(referralSignups.id, id))
      .limit(1);
    return result || null;
  }

  async findByReferredUserId(userId: string): Promise<ReferralSignup | null> {
    const [result] = await db
      .select()
      .from(referralSignups)
      .where(eq(referralSignups.referred_user_id, userId))
      .limit(1);
    return result || null;
  }

  async listByReferrerId(referrerId: string, limit = 50): Promise<ReferralSignup[]> {
    return db
      .select()
      .from(referralSignups)
      .where(eq(referralSignups.referrer_user_id, referrerId))
      .orderBy(desc(referralSignups.created_at))
      .limit(limit);
  }

  async create(data: NewReferralSignup): Promise<ReferralSignup> {
    const [result] = await db.insert(referralSignups).values(data).returning();
    return result;
  }

  async markBonusCredited(
    id: string,
    amount: number
  ): Promise<ReferralSignup | null> {
    const [result] = await db
      .update(referralSignups)
      .set({
        signup_bonus_credited: true,
        signup_bonus_amount: String(amount),
      })
      .where(eq(referralSignups.id, id))
      .returning();
    return result || null;
  }

  async addCommission(id: string, amount: number): Promise<void> {
    await db
      .update(referralSignups)
      .set({
        total_commission_earned: sql`${referralSignups.total_commission_earned} + ${amount}`,
      })
      .where(eq(referralSignups.id, id));
  }

  async markQualified(id: string, amount: number): Promise<ReferralSignup | null> {
    const [result] = await db
      .update(referralSignups)
      .set({
        qualified_at: new Date(),
        qualified_bonus_credited: true,
        qualified_bonus_amount: String(amount),
      })
      .where(eq(referralSignups.id, id))
      .returning();
    return result || null;
  }

  async findUnqualifiedByReferredUserId(userId: string): Promise<ReferralSignup | null> {
    const [result] = await db
      .select()
      .from(referralSignups)
      .where(
        and(
          eq(referralSignups.referred_user_id, userId),
          sql`${referralSignups.qualified_at} IS NULL`
        )
      )
      .limit(1);
    return result || null;
  }
}

class SocialShareRewardsRepository {
  async create(data: NewSocialShareReward): Promise<SocialShareReward> {
    const [result] = await db
      .insert(socialShareRewards)
      .values({
        ...data,
        share_intent_at: new Date(),
      })
      .returning();
    return result;
  }

  async markVerified(id: string): Promise<SocialShareReward | null> {
    const [result] = await db
      .update(socialShareRewards)
      .set({ verified: true })
      .where(eq(socialShareRewards.id, id))
      .returning();
    return result || null;
  }

  async listByUserId(userId: string, limit = 50): Promise<SocialShareReward[]> {
    return db
      .select()
      .from(socialShareRewards)
      .where(eq(socialShareRewards.user_id, userId))
      .orderBy(desc(socialShareRewards.created_at))
      .limit(limit);
  }

  async hasClaimedToday(
    userId: string,
    platform: "x" | "farcaster" | "telegram" | "discord"
  ): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [result] = await db
      .select()
      .from(socialShareRewards)
      .where(
        and(
          eq(socialShareRewards.user_id, userId),
          eq(socialShareRewards.platform, platform),
          gte(socialShareRewards.created_at, startOfDay)
        )
      )
      .limit(1);

    return !!result;
  }

  async getTotalEarnings(userId: string): Promise<number> {
    const [result] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${socialShareRewards.credits_awarded}), 0)`,
      })
      .from(socialShareRewards)
      .where(eq(socialShareRewards.user_id, userId));

    return Number(result?.total || 0);
  }
}

export const referralCodesRepository = new ReferralCodesRepository();
export const referralSignupsRepository = new ReferralSignupsRepository();
export const socialShareRewardsRepository = new SocialShareRewardsRepository();

export {
  type ReferralCode,
  type NewReferralCode,
  type ReferralSignup,
  type NewReferralSignup,
  type SocialShareReward,
  type NewSocialShareReward,
};

