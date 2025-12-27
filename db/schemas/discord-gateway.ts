/**
 * Discord Gateway Schema
 *
 * Tables for managing persistent Discord gateway connections and event routing
 * for the multi-tenant Discord service.
 */

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { orgPlatformConnections } from "./org-platforms";

// =============================================================================
// ENUMS
// =============================================================================

export const discordConnectionStatusEnum = pgEnum("discord_connection_status", [
  "connected",
  "disconnected",
  "reconnecting",
  "error",
  "starting",
]);

export const discordEventTypeEnum = pgEnum("discord_event_type", [
  "MESSAGE_CREATE",
  "MESSAGE_UPDATE",
  "MESSAGE_DELETE",
  "MESSAGE_REACTION_ADD",
  "MESSAGE_REACTION_REMOVE",
  "GUILD_MEMBER_ADD",
  "GUILD_MEMBER_REMOVE",
  "GUILD_MEMBER_UPDATE",
  "INTERACTION_CREATE",
  "VOICE_STATE_UPDATE",
  "PRESENCE_UPDATE",
  "TYPING_START",
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "CHANNEL_DELETE",
  "THREAD_CREATE",
  "THREAD_UPDATE",
  "THREAD_DELETE",
]);

export const discordRouteTypeEnum = pgEnum("discord_route_type", [
  "a2a",
  "mcp",
  "webhook",
  "container",
  "internal",
]);

// =============================================================================
// DISCORD BOT CONNECTIONS TABLE
// =============================================================================

/**
 * Tracks gateway connection state for each Discord bot including sharding info.
 */
export const discordBotConnections = pgTable(
  "discord_bot_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Link to org platform connection
    platform_connection_id: uuid("platform_connection_id")
      .notNull()
      .references(() => orgPlatformConnections.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Bot identity
    application_id: text("application_id").notNull(),
    bot_user_id: text("bot_user_id"),
    bot_username: text("bot_username"),

    // Sharding
    shard_id: integer("shard_id").default(0),
    shard_count: integer("shard_count").default(1),

    // Gateway connection state
    gateway_pod: text("gateway_pod"),
    session_id: text("session_id"),
    resume_gateway_url: text("resume_gateway_url"),
    sequence_number: integer("sequence_number").default(0),

    // Connection status
    status: discordConnectionStatusEnum("status")
      .notNull()
      .default("disconnected"),
    error_message: text("error_message"),
    last_heartbeat: timestamp("last_heartbeat"),
    heartbeat_interval_ms: integer("heartbeat_interval_ms").default(41250),

    // Stats
    guild_count: integer("guild_count").default(0),
    events_received: bigint("events_received", { mode: "number" }).default(0),
    events_routed: bigint("events_routed", { mode: "number" }).default(0),
    last_event_at: timestamp("last_event_at"),

    // Discord gateway intents bitmask
    intents: integer("intents").default(3276799),

    // Timestamps
    connected_at: timestamp("connected_at"),
    disconnected_at: timestamp("disconnected_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_idx: index("discord_bot_connections_org_idx").on(table.organization_id),
    platform_idx: index("discord_bot_connections_platform_idx").on(
      table.platform_connection_id,
    ),
    app_id_idx: index("discord_bot_connections_app_id_idx").on(
      table.application_id,
    ),
    status_idx: index("discord_bot_connections_status_idx").on(table.status),
    shard_idx: index("discord_bot_connections_shard_idx").on(
      table.shard_id,
      table.shard_count,
    ),
    pod_idx: index("discord_bot_connections_pod_idx").on(table.gateway_pod),
    unique_shard: uniqueIndex("discord_bot_connections_unique").on(
      table.platform_connection_id,
      table.shard_id,
    ),
  }),
);

// =============================================================================
// DISCORD EVENT ROUTES TABLE
// =============================================================================

/**
 * Configures how Discord events should be routed to agents.
 */
export const discordEventRoutes = pgTable(
  "discord_event_routes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    platform_connection_id: uuid("platform_connection_id")
      .notNull()
      .references(() => orgPlatformConnections.id, { onDelete: "cascade" }),

    // Scope
    guild_id: text("guild_id").notNull(),
    channel_id: text("channel_id"), // NULL = all channels
    event_type: discordEventTypeEnum("event_type").notNull(),

    // Route configuration
    route_type: discordRouteTypeEnum("route_type").notNull(),
    route_target: text("route_target").notNull(),

    // Filtering
    filter_bot_messages: boolean("filter_bot_messages").default(true),
    filter_self_messages: boolean("filter_self_messages").default(true),
    mention_only: boolean("mention_only").default(false),
    command_prefix: text("command_prefix"),

    // Rate limiting
    rate_limit_per_minute: integer("rate_limit_per_minute").default(60),
    rate_limit_burst: integer("rate_limit_burst").default(10),

    // Status
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").default(100),

    // Stats
    events_matched: bigint("events_matched", { mode: "number" }).default(0),
    events_routed: bigint("events_routed", { mode: "number" }).default(0),
    last_routed_at: timestamp("last_routed_at"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_idx: index("discord_event_routes_org_idx").on(table.organization_id),
    connection_idx: index("discord_event_routes_connection_idx").on(
      table.platform_connection_id,
    ),
    guild_idx: index("discord_event_routes_guild_idx").on(table.guild_id),
    channel_idx: index("discord_event_routes_channel_idx").on(
      table.guild_id,
      table.channel_id,
    ),
    type_idx: index("discord_event_routes_type_idx").on(table.event_type),
    enabled_idx: index("discord_event_routes_enabled_idx").on(table.enabled),
    priority_idx: index("discord_event_routes_priority_idx").on(table.priority),
  }),
);

// =============================================================================
// DISCORD EVENT QUEUE TABLE
// =============================================================================

/**
 * Discord event payload structure.
 */
export interface DiscordEventPayload {
  type: string;
  d: Record<string, unknown>;
  s?: number;
  t?: string;
}

/**
 * Temporary queue for Discord events awaiting processing.
 */
export const discordEventQueue = pgTable(
  "discord_event_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Event identification
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    route_id: uuid("route_id").references(() => discordEventRoutes.id, {
      onDelete: "set null",
    }),

    // Event data
    event_type: discordEventTypeEnum("event_type").notNull(),
    event_id: text("event_id").notNull(),
    guild_id: text("guild_id").notNull(),
    channel_id: text("channel_id"),

    // Payload
    payload: jsonb("payload").$type<DiscordEventPayload>().notNull(),

    // Processing state
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").default(0),
    max_attempts: integer("max_attempts").default(3),
    last_attempt_at: timestamp("last_attempt_at"),
    error_message: text("error_message"),

    // Timing
    created_at: timestamp("created_at").notNull().defaultNow(),
    process_after: timestamp("process_after").defaultNow(),
    completed_at: timestamp("completed_at"),
  },
  (table) => ({
    org_idx: index("discord_event_queue_org_idx").on(table.organization_id),
    status_idx: index("discord_event_queue_status_idx").on(table.status),
    process_idx: index("discord_event_queue_process_idx").on(
      table.status,
      table.process_after,
    ),
    event_idx: index("discord_event_queue_event_idx").on(table.event_id),
  }),
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type DiscordBotConnection = typeof discordBotConnections.$inferSelect;
export type NewDiscordBotConnection = typeof discordBotConnections.$inferInsert;

export type DiscordEventRoute = typeof discordEventRoutes.$inferSelect;
export type NewDiscordEventRoute = typeof discordEventRoutes.$inferInsert;

export type DiscordEventQueueItem = typeof discordEventQueue.$inferSelect;
export type NewDiscordEventQueueItem = typeof discordEventQueue.$inferInsert;

export type DiscordConnectionStatus =
  (typeof discordConnectionStatusEnum.enumValues)[number];
export type DiscordEventType = (typeof discordEventTypeEnum.enumValues)[number];
export type DiscordRouteType = (typeof discordRouteTypeEnum.enumValues)[number];
