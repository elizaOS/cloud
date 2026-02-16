
/**
 * Resolves the canonical application URL using the same fallback chain
 * used across the codebase:
 *   1. NEXT_PUBLIC_APP_URL (explicit config)
 *   2. VERCEL_URL (auto-set by Vercel deployments)
 *   3. localhost:3000 (local development)
 *
 * Both the SIWE nonce and verify endpoints use this to derive the expected
 * domain and URI for EIP-4361 message validation.
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
