import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Apps Table
 * 
 * Represents third-party applications that integrate with the Eliza Cloud platform.
 * Apps can embed agents, use the API, and track their usage and users.
 */
export const apps = pgTable(
  "apps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    
    // App identification
    name: text("name").notNull(),
    description: text("description"),
    slug: text("slug").notNull().unique(), // URL-friendly identifier
    
    // App owner
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    created_by_user_id: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    
    // App URL and security
    app_url: text("app_url").notNull(), // Primary app URL
    allowed_origins: jsonb("allowed_origins")
      .$type<string[]>()
      .notNull()
      .default([]), // URL whitelist for CORS/security
    
    // API Key for this app (generated automatically)
    api_key_id: uuid("api_key_id").unique(), // References api_keys table
    
    // Affiliate tracking
    affiliate_code: text("affiliate_code").unique(), // Optional affiliate code
    referral_bonus_credits: numeric("referral_bonus_credits", {
      precision: 10,
      scale: 2,
    }).default("0.00"), // Credits awarded for referrals
    
    // Usage tracking
    total_requests: integer("total_requests").default(0).notNull(),
    total_users: integer("total_users").default(0).notNull(), // Users signed up through this app
    total_credits_used: numeric("total_credits_used", {
      precision: 10,
      scale: 2,
    }).default("0.00"),
    
    // LLM Usage pricing (can override organization defaults)
    custom_pricing_enabled: boolean("custom_pricing_enabled")
      .default(false)
      .notNull(),
    custom_pricing_markup: numeric("custom_pricing_markup", {
      precision: 5,
      scale: 2,
    }).default("0.00"), // % markup on LLM costs
    
    // App features/permissions
    features_enabled: jsonb("features_enabled")
      .$type<{
        chat?: boolean;
        image?: boolean;
        video?: boolean;
        voice?: boolean;
        agents?: boolean;
        embedding?: boolean;
      }>()
      .notNull()
      .default({
        chat: true,
        image: false,
        video: false,
        voice: false,
        agents: false,
        embedding: false,
      }),
    
    // Rate limiting
    rate_limit_per_minute: integer("rate_limit_per_minute").default(60),
    rate_limit_per_hour: integer("rate_limit_per_hour").default(1000),
    
    // App metadata
    logo_url: text("logo_url"),
    website_url: text("website_url"),
    contact_email: text("contact_email"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    
    // Status
    is_active: boolean("is_active").default(true).notNull(),
    is_approved: boolean("is_approved").default(true).notNull(), // For app review process
    
    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    last_used_at: timestamp("last_used_at"),
  },
  (table) => ({
    slug_idx: index("apps_slug_idx").on(table.slug),
    organization_idx: index("apps_organization_idx").on(table.organization_id),
    created_by_idx: index("apps_created_by_idx").on(table.created_by_user_id),
    affiliate_code_idx: index("apps_affiliate_code_idx").on(
      table.affiliate_code,
    ),
    is_active_idx: index("apps_is_active_idx").on(table.is_active),
    created_at_idx: index("apps_created_at_idx").on(table.created_at),
  }),
);

/**
 * App Users Table
 * 
 * Tracks users who have signed up or used the platform through a specific app.
 */
export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    
    // Tracking info
    signup_source: text("signup_source"), // How they signed up (direct, affiliate, etc.)
    referral_code_used: text("referral_code_used"), // If they used a referral code
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    
    // Usage stats for this user in this app
    total_requests: integer("total_requests").default(0).notNull(),
    total_credits_used: numeric("total_credits_used", {
      precision: 10,
      scale: 2,
    }).default("0.00"),
    
    // Timestamps
    first_seen_at: timestamp("first_seen_at").notNull().defaultNow(),
    last_seen_at: timestamp("last_seen_at").notNull().defaultNow(),
    
    // Metadata
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
  },
  (table) => ({
    app_id_idx: index("app_users_app_id_idx").on(table.app_id),
    user_id_idx: index("app_users_user_id_idx").on(table.user_id),
    // Composite unique constraint - one record per app-user pair
    app_user_unique_idx: index("app_users_app_user_idx").on(
      table.app_id,
      table.user_id,
    ),
    first_seen_idx: index("app_users_first_seen_idx").on(table.first_seen_at),
  }),
);

/**
 * App Analytics Table
 * 
 * Daily/hourly aggregated analytics for each app.
 */
export const appAnalytics = pgTable(
  "app_analytics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    
    // Time period
    period_start: timestamp("period_start").notNull(),
    period_end: timestamp("period_end").notNull(),
    period_type: text("period_type").notNull(), // 'hourly', 'daily', 'monthly'
    
    // Metrics
    total_requests: integer("total_requests").default(0).notNull(),
    successful_requests: integer("successful_requests").default(0).notNull(),
    failed_requests: integer("failed_requests").default(0).notNull(),
    unique_users: integer("unique_users").default(0).notNull(),
    new_users: integer("new_users").default(0).notNull(),
    
    // Cost metrics
    total_input_tokens: integer("total_input_tokens").default(0).notNull(),
    total_output_tokens: integer("total_output_tokens").default(0).notNull(),
    total_cost: numeric("total_cost", { precision: 10, scale: 2 }).default(
      "0.00",
    ),
    total_credits_used: numeric("total_credits_used", {
      precision: 10,
      scale: 2,
    }).default("0.00"),
    
    // Feature usage breakdown
    chat_requests: integer("chat_requests").default(0).notNull(),
    image_requests: integer("image_requests").default(0).notNull(),
    video_requests: integer("video_requests").default(0).notNull(),
    voice_requests: integer("voice_requests").default(0).notNull(),
    agent_requests: integer("agent_requests").default(0).notNull(),
    
    // Average metrics
    avg_response_time_ms: integer("avg_response_time_ms"),
    
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    app_id_idx: index("app_analytics_app_id_idx").on(table.app_id),
    period_idx: index("app_analytics_period_idx").on(
      table.period_start,
      table.period_end,
    ),
    period_type_idx: index("app_analytics_period_type_idx").on(
      table.period_type,
    ),
    // Composite index for querying app analytics by time period
    app_period_idx: index("app_analytics_app_period_idx").on(
      table.app_id,
      table.period_start,
    ),
  }),
);

// Type inference
export type App = InferSelectModel<typeof apps>;
export type NewApp = InferInsertModel<typeof apps>;
export type AppUser = InferSelectModel<typeof appUsers>;
export type NewAppUser = InferInsertModel<typeof appUsers>;
export type AppAnalytics = InferSelectModel<typeof appAnalytics>;
export type NewAppAnalytics = InferInsertModel<typeof appAnalytics>;

