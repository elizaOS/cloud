
/**
 * Resolves the canonical application URL using the same fallback chain
 * across all endpoints: NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
 */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
