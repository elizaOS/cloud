
/**
 * Returns the canonical application URL using the same fallback chain
 * used throughout the codebase:
 *   1. NEXT_PUBLIC_APP_URL (explicit config)
 *   2. VERCEL_URL (auto-set by Vercel deployments)
 *   3. localhost fallback for local development
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
