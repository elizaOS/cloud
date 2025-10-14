import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id").notNull(),
    project_id: text("project_id").notNull(),
    version: text("version").notNull(),
    checksum: text("checksum").notNull(),
    size: integer("size").notNull(),
    r2_key: text("r2_key").notNull(),
    r2_url: text("r2_url").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    created_by: text("created_by").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    org_project_idx: index("idx_artifacts_org_project").on(
      table.organization_id,
      table.project_id,
    ),
    project_version_idx: index("idx_artifacts_project_version").on(
      table.project_id,
      table.version,
    ),
    unique_version_idx: uniqueIndex("uniq_artifact_version").on(
      table.organization_id,
      table.project_id,
      table.version,
    ),
  }),
);
