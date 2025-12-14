/**
 * Discord Gateway Types
 *
 * Type definitions for the multi-tenant Discord gateway service.
 */

import type {
  DiscordBotConnection,
  DiscordEventRoute,
  DiscordConnectionStatus,
  DiscordEventType,
  DiscordRouteType,
} from "@/db/schemas/discord-gateway";

// =============================================================================
// DISCORD API TYPES
// =============================================================================

/**
 * Discord gateway opcodes.
 */
export enum GatewayOpcode {
  DISPATCH = 0,
  HEARTBEAT = 1,
  IDENTIFY = 2,
  PRESENCE_UPDATE = 3,
  VOICE_STATE_UPDATE = 4,
  RESUME = 6,
  RECONNECT = 7,
  REQUEST_GUILD_MEMBERS = 8,
  INVALID_SESSION = 9,
  HELLO = 10,
  HEARTBEAT_ACK = 11,
}

/**
 * Discord gateway close codes.
 */
export enum GatewayCloseCode {
  UNKNOWN_ERROR = 4000,
  UNKNOWN_OPCODE = 4001,
  DECODE_ERROR = 4002,
  NOT_AUTHENTICATED = 4003,
  AUTHENTICATION_FAILED = 4004,
  ALREADY_AUTHENTICATED = 4005,
  INVALID_SEQ = 4007,
  RATE_LIMITED = 4008,
  SESSION_TIMED_OUT = 4009,
  INVALID_SHARD = 4010,
  SHARDING_REQUIRED = 4011,
  INVALID_API_VERSION = 4012,
  INVALID_INTENTS = 4013,
  DISALLOWED_INTENTS = 4014,
}

/**
 * Discord gateway intents bitmask values.
 */
export enum GatewayIntents {
  GUILDS = 1 << 0,
  GUILD_MEMBERS = 1 << 1,
  GUILD_MODERATION = 1 << 2,
  GUILD_EMOJIS_AND_STICKERS = 1 << 3,
  GUILD_INTEGRATIONS = 1 << 4,
  GUILD_WEBHOOKS = 1 << 5,
  GUILD_INVITES = 1 << 6,
  GUILD_VOICE_STATES = 1 << 7,
  GUILD_PRESENCES = 1 << 8,
  GUILD_MESSAGES = 1 << 9,
  GUILD_MESSAGE_REACTIONS = 1 << 10,
  GUILD_MESSAGE_TYPING = 1 << 11,
  DIRECT_MESSAGES = 1 << 12,
  DIRECT_MESSAGE_REACTIONS = 1 << 13,
  DIRECT_MESSAGE_TYPING = 1 << 14,
  MESSAGE_CONTENT = 1 << 15,
  GUILD_SCHEDULED_EVENTS = 1 << 16,
  AUTO_MODERATION_CONFIGURATION = 1 << 20,
  AUTO_MODERATION_EXECUTION = 1 << 21,
}

/**
 * Default intents for agent bots (messages, reactions, guild info).
 */
export const DEFAULT_INTENTS =
  GatewayIntents.GUILDS |
  GatewayIntents.GUILD_MESSAGES |
  GatewayIntents.GUILD_MESSAGE_REACTIONS |
  GatewayIntents.DIRECT_MESSAGES |
  GatewayIntents.MESSAGE_CONTENT;

/**
 * Gateway payload from Discord.
 */
export interface GatewayPayload {
  op: GatewayOpcode;
  d: unknown;
  s?: number;
  t?: string;
}

/**
 * Discord user object.
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
  global_name?: string | null;
}

/**
 * Discord guild member object.
 */
export interface DiscordMember {
  user?: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
  joined_at: string;
  premium_since?: string | null;
  deaf: boolean;
  mute: boolean;
  pending?: boolean;
}

/**
 * Discord channel object.
 */
export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string | null;
  position?: number;
  parent_id?: string | null;
}

/**
 * Discord message object.
 */
export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  member?: DiscordMember;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  reactions?: DiscordReaction[];
  pinned: boolean;
  type: number;
  referenced_message?: DiscordMessage | null;
  thread?: DiscordChannel;
}

/**
 * Discord attachment object.
 */
export interface DiscordAttachment {
  id: string;
  filename: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url: string;
  height?: number | null;
  width?: number | null;
}

/**
 * Discord embed object.
 */
export interface DiscordEmbed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  image?: { url: string; height?: number; width?: number };
  thumbnail?: { url: string; height?: number; width?: number };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

/**
 * Discord reaction object.
 */
export interface DiscordReaction {
  count: number;
  me: boolean;
  emoji: { id: string | null; name: string | null };
}

/**
 * Discord guild object (partial).
 */
export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner_id: string;
  member_count?: number;
  channels?: DiscordChannel[];
}

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Bot registration request.
 */
export interface BotRegistrationRequest {
  organizationId: string;
  platformConnectionId: string;
  botToken: string;
  applicationId: string;
  intents?: number;
}

/**
 * Bot registration result.
 */
export interface BotRegistrationResult {
  success: boolean;
  connectionId?: string;
  botUserId?: string;
  botUsername?: string;
  error?: string;
}

/**
 * Bot status information.
 */
export interface BotStatus {
  connectionId: string;
  organizationId: string;
  status: DiscordConnectionStatus;
  botUserId: string | null;
  botUsername: string | null;
  guildCount: number;
  eventsReceived: number;
  eventsRouted: number;
  lastHeartbeat: Date | null;
  lastEventAt: Date | null;
  connectedAt: Date | null;
  gatewayPod: string | null;
  shardId: number;
  shardCount: number;
}

/**
 * Shard status information.
 */
export interface ShardStatus {
  shardId: number;
  podName: string;
  botsCount: number;
  guildsCount: number;
  status: "healthy" | "degraded" | "unhealthy";
  lastHeartbeat: Date | null;
}

/**
 * Gateway service health status.
 */
export interface GatewayHealth {
  status: "healthy" | "degraded" | "unhealthy";
  totalBots: number;
  connectedBots: number;
  disconnectedBots: number;
  totalGuilds: number;
  shards: ShardStatus[];
  queueStats: {
    pending: number;
    processing: number;
    deadLetter: number;
  };
  lastCheck: Date;
}

/**
 * Event to route to an agent.
 */
export interface RoutableEvent {
  eventType: DiscordEventType;
  eventId: string;
  guildId: string;
  channelId?: string;
  organizationId: string;
  platformConnectionId: string;
  data: {
    message?: DiscordMessage;
    member?: DiscordMember;
    user?: DiscordUser;
    reaction?: {
      userId: string;
      channelId: string;
      messageId: string;
      guildId?: string;
      emoji: { id: string | null; name: string | null };
    };
    raw: unknown;
  };
  timestamp: Date;
}

/**
 * Route match result.
 */
export interface RouteMatch {
  route: DiscordEventRoute;
  shouldRoute: boolean;
  reason?: string;
}

/**
 * Event routing result.
 */
export interface EventRoutingResult {
  success: boolean;
  routeId: string;
  routeType: DiscordRouteType;
  routeTarget: string;
  responseTime: number;
  error?: string;
}

/**
 * Send message request.
 */
export interface SendMessageRequest {
  channelId: string;
  content?: string;
  embeds?: DiscordEmbed[];
  replyTo?: string;
  allowedMentions?: {
    parse?: ("roles" | "users" | "everyone")[];
    roles?: string[];
    users?: string[];
    repliedUser?: boolean;
  };
}

/**
 * Send message result.
 */
export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  channelId?: string;
  error?: string;
}

// =============================================================================
// REDIS STATE TYPES
// =============================================================================

/**
 * Bot connection state stored in Redis.
 */
export interface BotConnectionState {
  connectionId: string;
  organizationId: string;
  applicationId: string;
  botToken: string;
  shardId: number;
  shardCount: number;
  podId: string;
  sessionId: string | null;
  resumeGatewayUrl: string | null;
  sequence: number;
  guilds: string[];
  status: DiscordConnectionStatus;
  lastHeartbeat: number;
  connectedAt: number | null;
}

/**
 * Pod heartbeat state stored in Redis.
 */
export interface PodHeartbeatState {
  podId: string;
  connections: string[];
  lastHeartbeat: number;
  startedAt: number;
}

// =============================================================================
// CALLBACK TYPES
// =============================================================================

/**
 * A2A callback request.
 */
export interface A2ACallbackRequest {
  jsonrpc: "2.0";
  method: "message/send";
  params: {
    message: {
      role: "user";
      content: string;
      metadata: {
        source: "discord";
        connection_id: string;
        guild_id: string;
        channel_id: string;
        message_id: string;
        author_id: string;
        author_username: string;
        mentions_bot: boolean;
        reply_to?: string;
        attachments?: Array<{
          url: string;
          filename: string;
          content_type?: string;
        }>;
      };
    };
  };
  id: string;
}

/**
 * MCP callback request.
 */
export interface MCPCallbackRequest {
  tool: "discord_message_received";
  input: {
    event_type: DiscordEventType;
    guild_id: string;
    channel_id: string;
    message_id?: string;
    content?: string;
    author?: DiscordUser;
    attachments?: DiscordAttachment[];
  };
}

/**
 * Webhook callback request.
 */
export interface WebhookCallbackRequest {
  event_type: DiscordEventType;
  timestamp: string;
  organization_id: string;
  connection_id: string;
  guild_id: string;
  channel_id?: string;
  data: unknown;
  signature: string;
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export type {
  DiscordBotConnection,
  DiscordEventRoute,
  DiscordConnectionStatus,
  DiscordEventType,
  DiscordRouteType,
};

