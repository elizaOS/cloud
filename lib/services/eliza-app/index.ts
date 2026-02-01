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
export {
  otpService,
  type SendOTPResult,
  type VerifyOTPResult,
  // Pure functions exported for unit testing
  generateOTP,
  hashOTP,
  verifyOTPHash,
  // Constants exported for testing
  OTP_LENGTH,
  OTP_EXPIRY_SECONDS,
  MAX_ATTEMPTS,
  COOLDOWN_SECONDS,
  OTP_KEY_PREFIX,
  COOLDOWN_KEY_PREFIX,
  DEV_OTP,
} from "./otp-service";
export { elizaAppConfig } from "./config";
