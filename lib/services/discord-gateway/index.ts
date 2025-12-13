/**
 * Discord Gateway Service
 *
 * Multi-tenant Discord gateway service for maintaining persistent WebSocket
 * connections and routing events to agents.
 *
 * @module discord-gateway
 */

// Types
export * from "./types";

// Services
export { discordGatewayService, DiscordGatewayService } from "./gateway-service";
export { discordEventRouter, DiscordEventRouter } from "./event-router";
export { discordStateManager, DiscordStateManager } from "./state-manager";
export { discordMessageSender, DiscordMessageSender } from "./message-sender";
export { communityModerationHandler, CommunityModerationHandler } from "./community-moderation-handler";
