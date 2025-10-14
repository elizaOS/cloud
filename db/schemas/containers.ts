import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { apiKeys } from "./api-keys";

export const containers = pgTable(
  "containers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    api_key_id: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    cloudflare_worker_id: text("cloudflare_worker_id"),
    cloudflare_container_id: text("cloudflare_container_id"),
    cloudflare_url: text("cloudflare_url"),
    status: text("status").default("pending").notNull(),
    image_tag: text("image_tag"),
    dockerfile_path: text("dockerfile_path"),
    environment_vars: jsonb("environment_vars")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    max_instances: integer("max_instances").default(1).notNull(),
    port: integer("port").default(3000).notNull(),
    health_check_path: text("health_check_path").default("/health"),
    last_deployed_at: timestamp("last_deployed_at"),
    last_health_check: timestamp("last_health_check"),
    deployment_log: text("deployment_log"),
    error_message: text("error_message"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    organization_idx: index("containers_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("containers_user_idx").on(table.user_id),
    status_idx: index("containers_status_idx").on(table.status),
    cloudflare_worker_idx: index("containers_cloudflare_worker_idx").on(
      table.cloudflare_worker_id,
    ),
  }),
);

