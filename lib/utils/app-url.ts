
/**
 * Get the canonical application URL for the current environment.
 * 
 * Falls back through multiple environment variables to ensure correct
 * domain resolution in all deployment contexts (production, preview, local).
 * 
 * @returns The full application URL (e.g., "https://example.com")
 */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
