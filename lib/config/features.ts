export const FEATURES = {
  CREDITS_SSE_ENABLED:
    process.env.NEXT_PUBLIC_CREDITS_SSE_ENABLED !== "false",
  CACHE_ENABLED: process.env.CACHE_ENABLED !== "false",
} as const;
