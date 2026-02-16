
/**
 * Resolves the canonical app URL using the standard fallback chain:
 *   NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost
 *
 * This must be used consistently across nonce and verify endpoints
 * so that SIWE domain binding matches the actual deployed host.
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
