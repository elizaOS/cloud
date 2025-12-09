/**
 * Fragment Projects Schema
 * 
 * Stores saved fragment projects that can be deployed as miniapps
 */

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { apps } from "./apps";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { FragmentSchema } from "@/lib/fragments/schema";

export const fragmentProjects = pgTable(
  "fragment_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Project identification
    name: text("name").notNull(),
    description: text("description"),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Fragment data
    fragment_data: jsonb("fragment_data")
      .$type<FragmentSchema>()
      .notNull(),

    // Template and status
    template: text("template").notNull(),
    status: text("status").default("draft").notNull(), // draft, deployed, archived

    // Deployment
    deployed_app_id: uuid("deployed_app_id").references(() => apps.id, {
      onDelete: "set null",
    }),
    deployed_container_id: text("deployed_container_id"), // If deployed as container

    // Metadata
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    deployed_at: timestamp("deployed_at"),
  },
  (table) => ({
    organization_idx: index("fragment_projects_organization_idx").on(
      table.organization_id
    ),
    user_idx: index("fragment_projects_user_idx").on(table.user_id),
    status_idx: index("fragment_projects_status_idx").on(table.status),
    deployed_app_idx: index("fragment_projects_deployed_app_idx").on(
      table.deployed_app_id
    ),
  })
);

export type FragmentProject = InferSelectModel<typeof fragmentProjects>;
export type NewFragmentProject = InferInsertModel<typeof fragmentProjects>;

