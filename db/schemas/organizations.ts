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

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    credit_balance: numeric("credit_balance", { precision: 10, scale: 2 })
      .notNull()
      .default("100.00"),
    tier: text("tier").notNull().default("free"),
    tier_started_at: timestamp("tier_started_at").notNull().defaultNow(),
    tier_expires_at: timestamp("tier_expires_at"),
    monthly_free_credits: numeric("monthly_free_credits", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0.00"),
    free_credits_used_this_month: numeric("free_credits_used_this_month", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0.00"),
    free_credits_reset_at: timestamp("free_credits_reset_at")
      .notNull()
      .defaultNow(),
    webhook_url: text("webhook_url"),
    webhook_secret: text("webhook_secret"),
    stripe_customer_id: text("stripe_customer_id"),
    billing_email: text("billing_email"),
    tax_id_type: text("tax_id_type"),
    tax_id_value: text("tax_id_value"),
    billing_address: jsonb("billing_address").$type<Record<string, unknown>>(),
    max_api_requests: integer("max_api_requests").default(1000),
    max_tokens_per_request: integer("max_tokens_per_request"),
    allowed_models: jsonb("allowed_models")
      .$type<string[]>()
      .notNull()
      .default([]),
    allowed_providers: jsonb("allowed_providers")
      .$type<string[]>()
      .notNull()
      .default([]),
    is_active: boolean("is_active").default(true).notNull(),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    slug_idx: index("organizations_slug_idx").on(table.slug),
    stripe_customer_idx: index("organizations_stripe_customer_idx").on(
      table.stripe_customer_id
    ),
  })
);

// Type inference
export type Organization = InferSelectModel<typeof organizations>;
export type NewOrganization = InferInsertModel<typeof organizations>;
