
/**
 * Resolves the canonical application URL.
 *
 * Uses the same fallback chain as the rest of the codebase:
 * 1. NEXT_PUBLIC_APP_URL (explicit configuration)
 * 2. VERCEL_URL (auto-set by Vercel deployments)
 * 3. localhost:3000 (local development)
 *
 * This ensures SIWE domain validation matches the actual deployed host
 * even when NEXT_PUBLIC_APP_URL is not explicitly configured.
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
