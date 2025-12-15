import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { generations } from "./generations";

/**
 * Media collections table schema.
 *
 * Allows users to organize their generated and uploaded media into named collections.
 * Collections can be used for ad campaigns, app assets, or general organization.
 */
export const mediaCollections = pgTable(
  "media_collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),

    cover_image_id: uuid("cover_image_id").references(() => generations.id, {
      onDelete: "set null",
    }),

    item_count: integer("item_count").notNull().default(0),

    is_default: boolean("is_default").notNull().default(false),

    metadata: jsonb("metadata")
      .$type<{
        purpose?: "advertising" | "app_assets" | "general";
        tags?: string[];
      }>()
      .notNull()
      .default({}),

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("media_collections_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("media_collections_user_idx").on(table.user_id),
    org_user_idx: index("media_collections_org_user_idx").on(
      table.organization_id,
      table.user_id,
    ),
    name_idx: index("media_collections_name_idx").on(table.name),
    created_at_idx: index("media_collections_created_at_idx").on(
      table.created_at,
    ),
  }),
);

export type MediaCollection = InferSelectModel<typeof mediaCollections>;
export type NewMediaCollection = InferInsertModel<typeof mediaCollections>;
