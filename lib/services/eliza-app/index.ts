/**
 * Eliza App Services
 *
 * Authentication and user management services for the Eliza App.
 * Auth methods: Telegram OAuth, Discord OAuth2, and iMessage (auto-provision).
 */

export { telegramAuthService, type TelegramAuthData } from "./telegram-auth";
export { discordAuthService, type DiscordUserData } from "./discord-auth";
export {
  elizaAppSessionService,
  type ElizaAppSessionPayload,
  type SessionResult,
  type ValidatedSession,
} from "./session-service";
export {
  elizaAppUserService,
  type FindOrCreateResult,
} from "./user-service";
export { elizaAppConfig } from "./config";
export { connectionEnforcementService } from "./connection-enforcement";
