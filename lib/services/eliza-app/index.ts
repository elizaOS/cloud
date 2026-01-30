/**
 * Eliza App Services
 *
 * Authentication and user management services for the Eliza App.
 * Supports Telegram Login Widget and phone (iMessage) authentication.
 */

export { telegramAuthService, type TelegramAuthData } from "./telegram-auth";
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
