
/**
 * Resolves the canonical application URL.
 *
 * Uses the same resolution strategy across the codebase:
 * 1. NEXT_PUBLIC_APP_URL (explicitly configured)
 * 2. VERCEL_URL (auto-set by Vercel deployments)
 * 3. localhost:3000 (local development)
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
