import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./users";

/**
 * Social platform enum for referral sharing.
 */
export const socialPlatformEnum = pgEnum("social_platform", [
  "x",
  "farcaster",
  "telegram",
  "discord",
]);

/**
 * Share type enum for referral sharing.
 */
export const shareTypeEnum = pgEnum("share_type", [
  "app_share",
  "character_share",
  "invite_share",
]);

/**
 * Commission tier for referral codes.
 *
 * WHY two tiers: We support both lightweight affiliates (5% of purchase) and
 * premium/strategic partners who get 50% of our margin. The tier is set once
 * when the code is created so commission is predictable and auditable.
 */
export const referralCommissionTierEnum = pgEnum(
  "referral_commission_tier",
  ["pct_5", "pct_50"],
);

/**
 * Referral codes table schema.
 *
 * One code per user (user_idx unique). Stores the code string, commission tier,
 * and aggregated earnings so we can display stats and pay commissions without
 * scanning signups every time.
 */
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    /** pct_5 = 5% of purchase; pct_50 = 50% of our margin (~8.33% of revenue). Default pct_5 so existing codes stay unchanged after migration. */
    commission_tier: referralCommissionTierEnum("commission_tier")
      .default("pct_5")
      .notNull(),
    total_referrals: integer("total_referrals").default(0).notNull(),
    total_signup_earnings: numeric("total_signup_earnings", {
      precision: 10,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    total_qualified_earnings: numeric("total_qualified_earnings", {
      precision: 10,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    total_commission_earnings: numeric("total_commission_earnings", {
      precision: 10,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    user_idx: uniqueIndex("referral_codes_user_idx").on(table.user_id),
    code_idx: index("referral_codes_code_idx").on(table.code),
  }),
);

/**
 * Referral signups table schema.
 *
 * One row per referred user (referred_user_unique). Links referrer → referred user
 * and the code used, so we can pay commission on that user's future purchases and
 * track qualified bonus (social link). Commission is stored on the signup and
 * rolled up on the code for stats.
 */
export const referralSignups = pgTable(
  "referral_signups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referral_code_id: uuid("referral_code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "cascade" }),
    referrer_user_id: uuid("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referred_user_id: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signup_bonus_credited: boolean("signup_bonus_credited")
      .default(false)
      .notNull(),
    signup_bonus_amount: numeric("signup_bonus_amount", {
      precision: 10,
      scale: 2,
    }).default("0.00"),
    // Qualified referral tracking - referrer gets bonus when referred user links social
    qualified_at: timestamp("qualified_at"),
    qualified_bonus_credited: boolean("qualified_bonus_credited")
      .default(false)
      .notNull(),
    qualified_bonus_amount: numeric("qualified_bonus_amount", {
      precision: 10,
      scale: 2,
    }).default("0.00"),
    total_commission_earned: numeric("total_commission_earned", {
      precision: 10,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    referred_user_unique: uniqueIndex("referral_signups_referred_user_idx").on(
      table.referred_user_id,
    ),
    referrer_idx: index("referral_signups_referrer_idx").on(
      table.referrer_user_id,
    ),
    code_idx: index("referral_signups_code_idx").on(table.referral_code_id),
  }),
);

/**
 * Social share rewards table schema.
 *
 * Tracks social media shares and associated credit rewards.
 */
export const socialShareRewards = pgTable(
  "social_share_rewards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: socialPlatformEnum("platform").notNull(),
    share_type: shareTypeEnum("share_type").notNull(),
    share_url: text("share_url"),
    // Server-side tracking
    share_intent_at: timestamp("share_intent_at"),
    verified: boolean("verified").default(false).notNull(),
    credits_awarded: numeric("credits_awarded", {
      precision: 10,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    user_idx: index("social_share_rewards_user_idx").on(table.user_id),
    platform_idx: index("social_share_rewards_platform_idx").on(table.platform),
    user_platform_date_idx: index(
      "social_share_rewards_user_platform_date_idx",
    ).on(table.user_id, table.platform, table.created_at),
  }),
);

export type ReferralCode = InferSelectModel<typeof referralCodes>;
export type NewReferralCode = InferInsertModel<typeof referralCodes>;
export type ReferralSignup = InferSelectModel<typeof referralSignups>;
export type NewReferralSignup = InferInsertModel<typeof referralSignups>;
export type SocialShareReward = InferSelectModel<typeof socialShareRewards>;
export type NewSocialShareReward = InferInsertModel<typeof socialShareRewards>;
