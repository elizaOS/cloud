
/**
 * Resolves the canonical application URL using the same fallback chain
 * across the entire codebase:
 *   1. NEXT_PUBLIC_APP_URL (explicitly configured)
 *   2. VERCEL_URL (auto-set by Vercel deployments)
 *   3. localhost:3000 (local development)
 *
 * This ensures nonce issuance and SIWE verify use the same domain/uri
 * regardless of the deployment environment.
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
