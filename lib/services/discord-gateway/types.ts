/**
 * Discord Gateway Types
 *
 * Shared types for Discord gateway communication.
 */

export interface DiscordEventPayload {
  connection_id: string;
  organization_id: string;
  platform_connection_id: string;
  event_type: DiscordEventType;
  event_id: string;
  guild_id: string;
  channel_id: string;
  data: DiscordEventData;
  timestamp: string;
}

export type DiscordEventType =
  | "MESSAGE_CREATE"
  | "MESSAGE_UPDATE"
  | "MESSAGE_DELETE"
  | "MESSAGE_REACTION_ADD"
  | "MESSAGE_REACTION_REMOVE"
  | "GUILD_MEMBER_ADD"
  | "GUILD_MEMBER_REMOVE"
  | "INTERACTION_CREATE"
  | "TYPING_START";

export interface DiscordAuthor {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
  global_name?: string | null;
}

export interface DiscordMember {
  nick?: string | null;
  roles?: string[];
}

export interface DiscordAttachment {
  id: string;
  filename?: string;
  url: string;
  content_type?: string | null;
  size?: number;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
}

export interface DiscordMention {
  id: string;
  username: string;
  bot?: boolean;
}

export interface VoiceAttachment {
  url: string;
  expires_at: string;
  size: number;
  content_type: string;
  filename: string;
}

export interface MessageCreateData {
  id: string;
  channel_id: string;
  guild_id?: string | null;
  author: DiscordAuthor;
  member?: DiscordMember;
  content: string;
  timestamp: string;
  attachments?: DiscordAttachment[];
  embeds?: DiscordEmbed[];
  mentions?: DiscordMention[];
  referenced_message?: { id: string };
  voice_attachments?: VoiceAttachment[];
}

export interface MessageUpdateData {
  id: string;
  channel_id: string;
  guild_id?: string | null;
  content?: string;
  edited_timestamp?: string;
  author?: DiscordAuthor;
}

export interface MessageDeleteData {
  id: string;
  channel_id: string;
  guild_id?: string | null;
}

export interface ReactionData {
  message_id: string;
  channel_id: string;
  guild_id?: string | null;
  emoji: { name?: string | null; id?: string | null };
  user_id: string;
}

export interface GuildMemberData {
  guild_id: string;
  user: DiscordAuthor;
  nick?: string | null;
  roles?: string[];
  joined_at?: string;
}

export interface InteractionData {
  id: string;
  type: number;
  channel_id?: string | null;
  guild_id?: string | null;
  user: DiscordAuthor;
  data?: {
    name?: string;
    options?: unknown[];
  };
}

export type DiscordEventData =
  | MessageCreateData
  | MessageUpdateData
  | MessageDeleteData
  | ReactionData
  | GuildMemberData
  | InteractionData
  | Record<string, unknown>;

export interface GatewayAssignment {
  connectionId: string;
  organizationId: string;
  applicationId: string;
  botToken: string;
  intents: number;
}

export interface ConnectionStatusUpdate {
  connection_id: string;
  pod_name: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  error_message?: string;
}

export interface FailoverRequest {
  claiming_pod: string;
  dead_pod: string;
}

export interface FailoverResponse {
  claimed: number;
}
