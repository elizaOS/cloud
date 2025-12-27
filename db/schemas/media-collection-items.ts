import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { mediaCollections } from "./media-collections";
import { generations } from "./generations";
import { mediaUploads } from "./media-uploads";

/**
 * Media collection items table schema.
 *
 * Links media items (generations or uploads) to collections.
 * Each item can be in multiple collections.
 */
export const mediaCollectionItems = pgTable(
  "media_collection_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    collection_id: uuid("collection_id")
      .notNull()
      .references(() => mediaCollections.id, { onDelete: "cascade" }),

    // Either generation_id OR upload_id should be set, not both
    generation_id: uuid("generation_id").references(() => generations.id, {
      onDelete: "cascade",
    }),

    upload_id: uuid("upload_id").references(() => mediaUploads.id, {
      onDelete: "cascade",
    }),

    // Source type for easier querying
    source_type: text("source_type").$type<"generation" | "upload">().notNull(),

    order_index: integer("order_index").notNull().default(0),

    added_at: timestamp("added_at").notNull().defaultNow(),
  },
  (table) => ({
    collection_idx: index("media_collection_items_collection_idx").on(
      table.collection_id,
    ),
    generation_idx: index("media_collection_items_generation_idx").on(
      table.generation_id,
    ),
    upload_idx: index("media_collection_items_upload_idx").on(table.upload_id),
    // Prevent duplicate items in collection
    unique_generation_idx: uniqueIndex(
      "media_collection_items_unique_generation",
    ).on(table.collection_id, table.generation_id),
    unique_upload_idx: uniqueIndex("media_collection_items_unique_upload").on(
      table.collection_id,
      table.upload_id,
    ),
    order_idx: index("media_collection_items_order_idx").on(
      table.collection_id,
      table.order_index,
    ),
  }),
);

export type MediaCollectionItem = InferSelectModel<typeof mediaCollectionItems>;
export type NewMediaCollectionItem = InferInsertModel<
  typeof mediaCollectionItems
>;
