/**
 * Context Enrichment Schema
 *
 * Stores identity/environment context fetched from OAuth providers.
 * Separate from platform_credentials to maintain clean separation of concerns:
 * - platform_credentials: OAuth tokens, scopes, status (pure OAuth)
 * - context_enrichment: Profile, team, workspace info (enrichment data)
 *
 * This enables the agent to personalize responses based on user identity
 * across connected platforms (name, org, team, projects, etc.)
 */

import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { platformCredentials } from "./platform-credentials";

export const contextEnrichment = pgTable(
  "context_enrichment",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Links to organization and specific OAuth connection
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    connection_id: uuid("connection_id")
      .notNull()
      .references(() => platformCredentials.id, { onDelete: "cascade" }),

    // Enrichment data (profile, teams, workspace, etc.)
    // Structure varies by platform - see enrichment service for details
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),

    // When enrichment was last fetched
    enriched_at: timestamp("enriched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Standard timestamps
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Ensure one enrichment record per connection
    unique_idx: uniqueIndex("context_enrichment_unique_idx").on(
      table.organization_id,
      table.platform,
      table.connection_id
    ),
    // Fast lookups by connection_id
    connection_idx: index("context_enrichment_connection_idx").on(
      table.connection_id
    ),
  })
);

export type ContextEnrichmentRow = typeof contextEnrichment.$inferSelect;
export type ContextEnrichmentInsert = typeof contextEnrichment.$inferInsert;
