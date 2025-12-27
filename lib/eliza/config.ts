export function getElizaCloudApiUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;

  if (
    appUrl?.includes("localhost") ||
    appUrl?.includes("127.0.0.1") ||
    process.env.NODE_ENV === "development"
  ) {
    return "http://localhost:3000/api/v1";
  }
  if (appUrl?.includes("dev.elizacloud.ai")) {
    return "https://www.dev.elizacloud.ai/api/v1";
  }
  return "https://www.elizacloud.ai/api/v1";
}

export function getDefaultModels() {
  return {
    small: process.env.ELIZAOS_CLOUD_SMALL_MODEL || "openai/gpt-4o-mini",
    large: process.env.ELIZAOS_CLOUD_LARGE_MODEL || "openai/gpt-4o",
    embedding:
      process.env.ELIZAOS_CLOUD_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

// Models verified to work with Vercel AI Gateway
export const ALLOWED_CHAT_MODELS = [
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4-turbo",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-haiku-4",
  "anthropic/claude-3-5-sonnet-20241022",
  "google/gemini-2.0-flash",
  "google/gemini-1.5-pro",
  "google/gemini-1.5-flash",
] as const;
