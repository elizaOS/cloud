/**
 * ElizaOS Cloud Configuration
 * Determines API URL based on environment
 */

/**
 * Get the ElizaOS Cloud API base URL based on environment
 * - Local: http://localhost:3000/api/v1
 * - Development: https://www.dev.elizacloud.ai/api/v1
 * - Production: https://www.elizacloud.ai/api/v1
 */
export function getElizaCloudApiUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const nodeEnv = process.env.NODE_ENV;

  // Local development
  if (
    appUrl?.includes("localhost") ||
    appUrl?.includes("127.0.0.1") ||
    nodeEnv === "development"
  ) {
    return "http://localhost:3000/api/v1";
  }

  // Development environment
  if (appUrl?.includes("dev.elizacloud.ai")) {
    return "https://www.dev.elizacloud.ai/api/v1";
  }

  // Production (default)
  return "https://www.elizacloud.ai/api/v1";
}

/**
 * Get default models configuration
 */
export function getDefaultModels() {
  return {
    small: process.env.ELIZAOS_CLOUD_SMALL_MODEL || "openai/gpt-oss-120b",
    large: process.env.ELIZAOS_CLOUD_LARGE_MODEL || "openai/gpt-oss-120b",
    embedding:
      process.env.ELIZAOS_CLOUD_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

/**
 * Allowed models for chat interface
 * These are the curated models we want to offer to users
 */
export const ALLOWED_CHAT_MODELS = [
  // OpenAI Models
  "openai/gpt-oss-120b",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  // Moonshot AI Models
  "moonshotai/kimi-k2-0905",
  "moonshotai/kimi-k2-turbo",
  // OpenAI Models
  "openai/gpt-5",
  "openai/gpt-5-mini",
  // Anthropic Claude Models
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.1",
  // Google Gemini Models
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-3-pro-preview",
  // DeepSeek Models
  "deepseek/deepseek-v3.2-exp",
  "deepseek/deepseek-r1",
] as const;
