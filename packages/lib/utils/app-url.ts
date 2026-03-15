/**
 * Application URL for SIWE domain validation and redirects.
 * WHY: SIWE EIP-4361 requires the message domain to match the relying party;
 * we use this as the canonical app origin (no trailing slash).
 */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const base = url.startsWith("http") ? url : `https://${url}`;
  return base.replace(/\/$/, "");
}

export function getAppHost(): string {
  return new URL(getAppUrl()).host;
}
