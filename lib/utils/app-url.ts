
/**
 * Resolves the canonical application URL using the same fallback chain
 * used throughout the codebase: NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
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
