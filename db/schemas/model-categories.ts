import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const modelCategories = pgTable(
  "model_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    model: varchar("model", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    tier_required: varchar("tier_required", { length: 50 }),
    rate_limit_per_minute: integer("rate_limit_per_minute"),
    rate_limit_per_day: integer("rate_limit_per_day"),
    is_active: boolean("is_active").default(true).notNull(),
    features: jsonb("features")
      .$type<{
        max_tokens?: number;
        supports_streaming?: boolean;
        supports_tools?: boolean;
        supports_vision?: boolean;
        monthly_token_limit?: number;
        max_batch_size?: number;
        dimensions?: number;
      }>()
      .default({})
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    model_provider_idx: index("model_categories_model_provider_idx").on(
      table.model,
      table.provider
    ),
    category_idx: index("model_categories_category_idx").on(table.category),
    tier_idx: index("model_categories_tier_idx").on(table.tier_required),
    provider_idx: index("model_categories_provider_idx").on(table.provider),
    active_idx: index("model_categories_active_idx").on(table.is_active),
  })
);

export type ModelCategory = InferSelectModel<typeof modelCategories>;
export type NewModelCategory = InferInsertModel<typeof modelCategories>;
