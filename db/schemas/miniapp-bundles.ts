/**
 * Miniapp Bundles Schema
 * 
 * Stores deployed miniapp bundles (HTML/JS/CSS) in Vercel Blob storage.
 * Each app can have multiple versions, with one active at a time.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export interface MiniappRuntimeConfig {
  injectAuth?: boolean;
  injectStorage?: boolean;
  apiProxy?: boolean;
  customHead?: string;
  env?: Record<string, string>;
}

export const miniappBundles = pgTable(
  "miniapp_bundles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),

    // Bundle metadata
    version: integer("version").notNull(),
    bundle_url: text("bundle_url").notNull(),
    entry_file: text("entry_file").default("index.html").notNull(),

    // Build info
    framework: text("framework").$type<"react" | "vue" | "vanilla" | "nextjs">(),
    build_hash: text("build_hash"),
    bundle_size: integer("bundle_size"),

    // Source info
    source_project_id: uuid("source_project_id"), // Fragment project ID if from fragments
    source_type: text("source_type").$type<"fragment" | "upload" | "git">().default("fragment"),

    // Runtime config
    runtime_config: jsonb("runtime_config")
      .$type<MiniappRuntimeConfig>()
      .default({})
      .notNull(),

    // Status
    is_active: boolean("is_active").default(false).notNull(),
    status: text("status")
      .$type<"active" | "deploying" | "failed" | "archived">()
      .default("deploying")
      .notNull(),
    error_message: text("error_message"),

    // Timestamps
    created_at: timestamp("created_at").defaultNow().notNull(),
    deployed_at: timestamp("deployed_at"),
  },
  (table) => ({
    app_id_idx: index("miniapp_bundles_app_id_idx").on(table.app_id),
    app_version_idx: index("miniapp_bundles_app_version_idx").on(
      table.app_id,
      table.version
    ),
    is_active_idx: index("miniapp_bundles_is_active_idx").on(
      table.app_id,
      table.is_active
    ),
    status_idx: index("miniapp_bundles_status_idx").on(table.status),
    source_project_idx: index("miniapp_bundles_source_project_idx").on(
      table.source_project_id
    ),
  })
);

export type MiniappBundle = InferSelectModel<typeof miniappBundles>;
export type NewMiniappBundle = InferInsertModel<typeof miniappBundles>;


