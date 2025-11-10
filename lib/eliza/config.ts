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

  console.log("[ElizaCloudConfig] Environment detection:", {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    NODE_ENV: nodeEnv,
    appUrl,
  });

  // Local development
  if (
    appUrl?.includes("localhost") ||
    appUrl?.includes("127.0.0.1") ||
    nodeEnv === "development"
  ) {
    console.log(
      "[ElizaCloudConfig] Using LOCAL API URL: http://localhost:3000/api/v1",
    );
    return "http://localhost:3000/api/v1";
  }

  // Development environment
  if (appUrl?.includes("dev.elizacloud.ai")) {
    console.log(
      "[ElizaCloudConfig] Using DEV API URL: https://www.dev.elizacloud.ai/api/v1",
    );
    return "https://www.dev.elizacloud.ai/api/v1";
  }

  // Production (default)
  console.log(
    "[ElizaCloudConfig] Using PROD API URL: https://www.elizacloud.ai/api/v1",
  );
  return "https://www.elizacloud.ai/api/v1";
}

/**
 * Get default models configuration
 */
export function getDefaultModels() {
  return {
    small: process.env.ELIZAOS_CLOUD_SMALL_MODEL || "moonshotai/kimi-k2-0905",
    large: process.env.ELIZAOS_CLOUD_LARGE_MODEL || "moonshotai/kimi-k2-0905",
    embedding:
      process.env.ELIZAOS_CLOUD_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

/**
 * Allowed models for chat interface
 * These are the curated models we want to offer to users
 */
export const ALLOWED_CHAT_MODELS = [
  // Moonshot AI Models
  "moonshotai/kimi-k2-thinking",
  "moonshotai/kimi-k2",
  "moonshotai/kimi-k2-0905",
  "moonshotai/kimi-k2-thinking-turbo",
  "moonshotai/kimi-k2-turbo",
  // Anthropic Claude Models
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.7-sonnet",
  "anthropic/claude-opus-4.1",
] as const;
