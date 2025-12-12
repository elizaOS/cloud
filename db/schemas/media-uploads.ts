import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Media uploads table schema.
 *
 * Stores user-uploaded media files (images, videos) that were not AI-generated.
 * These can be used alongside generations in collections and ad campaigns.
 */
export const mediaUploads = pgTable(
  "media_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    filename: text("filename").notNull(),
    original_filename: text("original_filename").notNull(),

    storage_url: text("storage_url").notNull(),
    thumbnail_url: text("thumbnail_url"),

    mime_type: text("mime_type").notNull(),
    file_size: bigint("file_size", { mode: "bigint" }).notNull(),

    type: text("type").$type<"image" | "video" | "audio">().notNull(),

    dimensions: jsonb("dimensions").$type<{
      width?: number;
      height?: number;
      duration?: number;
    }>(),

    metadata: jsonb("metadata")
      .$type<{
        source?: string;
        alt_text?: string;
        tags?: string[];
      }>()
      .notNull()
      .default({}),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("media_uploads_organization_idx").on(
      table.organization_id
    ),
    user_idx: index("media_uploads_user_idx").on(table.user_id),
    org_user_idx: index("media_uploads_org_user_idx").on(
      table.organization_id,
      table.user_id
    ),
    type_idx: index("media_uploads_type_idx").on(table.type),
    created_at_idx: index("media_uploads_created_at_idx").on(table.created_at),
  })
);

export type MediaUpload = InferSelectModel<typeof mediaUploads>;
export type NewMediaUpload = InferInsertModel<typeof mediaUploads>;
