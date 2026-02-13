
/**
 * Resolves the canonical application URL using the same strategy across
 * the entire codebase: NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost.
 *
 * This ensures that SIWE domain binding, nonce issuance, and any other
 * URL-dependent logic all agree on the deployed host.
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
