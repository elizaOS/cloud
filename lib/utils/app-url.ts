
/**
 * Resolves the canonical app URL from environment variables.
 *
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL (explicitly configured)
 * 2. VERCEL_URL (auto-set by Vercel deployments, prefixed with https://)
 * 3. http://localhost:3000 (local development fallback)
 *
 * Used by SIWE nonce/verify endpoints for domain binding and anywhere
 * else that needs the canonical app origin.
 */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
}
