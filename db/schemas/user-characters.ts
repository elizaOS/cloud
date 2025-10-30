import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const userCharacters = pgTable(
  "user_characters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    username: text("username"),
    system: text("system"),
    bio: jsonb("bio").$type<string | string[]>().notNull(),
    message_examples: jsonb("message_examples")
      .$type<Record<string, unknown>[][]>()
      .default([]),
    post_examples: jsonb("post_examples").$type<string[]>().default([]),
    topics: jsonb("topics").$type<string[]>().default([]),
    adjectives: jsonb("adjectives").$type<string[]>().default([]),
    knowledge: jsonb("knowledge")
      .$type<(string | { path: string; shared?: boolean })[]>()
      .default([]),
    plugins: jsonb("plugins").$type<string[]>().default([]),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    secrets: jsonb("secrets")
      .$type<Record<string, string | boolean | number>>()
      .default({}),
    style: jsonb("style")
      .$type<{
        all?: string[];
        chat?: string[];
        post?: string[];
      }>()
      .default({}),
    character_data: jsonb("character_data")
      .$type<Record<string, unknown>>()
      .notNull(),
    is_template: boolean("is_template").default(false).notNull(),
    is_public: boolean("is_public").default(false).notNull(),
    avatar_url: text("avatar_url"),
    category: text("category"),
    tags: jsonb("tags").$type<string[]>().default([]),
    featured: boolean("featured").default(false).notNull(),
    view_count: integer("view_count").default(0).notNull(),
    interaction_count: integer("interaction_count").default(0).notNull(),
    popularity_score: integer("popularity_score").default(0).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("user_characters_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("user_characters_user_idx").on(table.user_id),
    name_idx: index("user_characters_name_idx").on(table.name),
    category_idx: index("user_characters_category_idx").on(table.category),
    featured_idx: index("user_characters_featured_idx").on(table.featured),
    template_idx: index("user_characters_is_template_idx").on(table.is_template),
    public_idx: index("user_characters_is_public_idx").on(table.is_public),
    popularity_idx: index("user_characters_popularity_idx").on(table.popularity_score),
  }),
);

// Type inference
export type UserCharacter = InferSelectModel<typeof userCharacters>;
export type NewUserCharacter = InferInsertModel<typeof userCharacters>;
