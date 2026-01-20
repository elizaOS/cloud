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
import { apps } from "./apps";

/**
 * Discord Connections table schema.
 *
 * Tracks Discord bot connections managed by the gateway service.
 * Each connection represents a bot token assigned to a gateway pod.
 */
export const discordConnections = pgTable(
  "discord_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    app_id: uuid("app_id").references(() => apps.id, { onDelete: "set null" }),

    // Discord application info
    application_id: text("application_id").notNull(),
    bot_token_encrypted: text("bot_token_encrypted").notNull(),

    // Gateway assignment
    assigned_pod: text("assigned_pod"),
    status: text("status").notNull().default("pending"), // pending, connecting, connected, disconnected, error
    error_message: text("error_message"),

    // Connection stats
    guild_count: integer("guild_count").default(0),
    events_received: integer("events_received").default(0),
    events_routed: integer("events_routed").default(0),

    // Heartbeat tracking
    last_heartbeat: timestamp("last_heartbeat", { withTimezone: true }),
    connected_at: timestamp("connected_at", { withTimezone: true }),

    // Configuration
    intents: integer("intents").default(3276799), // Default Discord intents
    is_active: boolean("is_active").default(true).notNull(),

    // Metadata for additional config
    metadata: jsonb("metadata").$type<{
      enabledChannels?: string[];
      disabledChannels?: string[];
      responseMode?: "always" | "mention" | "keyword";
      keywords?: string[];
    }>(),

    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("discord_connections_organization_id_idx").on(table.organization_id),
    index("discord_connections_app_id_idx").on(table.app_id),
    index("discord_connections_application_id_idx").on(table.application_id),
    index("discord_connections_assigned_pod_idx").on(table.assigned_pod),
    index("discord_connections_status_idx").on(table.status),
    index("discord_connections_is_active_idx").on(table.is_active),
  ],
);

export type DiscordConnection = InferSelectModel<typeof discordConnections>;
export type NewDiscordConnection = InferInsertModel<typeof discordConnections>;
