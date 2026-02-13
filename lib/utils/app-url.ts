
/**
 * Shared base URL resolution.
 *
 * Precedence:
 * 1. NEXT_PUBLIC_APP_URL (explicitly configured canonical URL)
 * 2. VERCEL_URL (auto-set by Vercel deployments — needs https:// prefix)
 * 3. localhost:3000 (local development fallback)
 *
 * Used by SIWE nonce/verify for domain binding and anywhere else that needs
 * the canonical app URL.
 */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}
