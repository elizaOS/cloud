/**
 * Get the Eliza Cloud URL with smart defaults for production
 *
 * Auto-detects production URL if NEXT_PUBLIC_ELIZA_CLOUD_URL is not set.
 * Filters out the marketing site (elizaos.ai) which doesn't have API endpoints.
 */
export function getCloudUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL;

  // Use environment variable if set AND it's not the marketing site
  if (envUrl && envUrl !== "https://elizaos.ai" && !envUrl.includes("elizaos.ai")) {
    return envUrl;
  }

  // Check for server-side production environment (Vercel, etc.)
  // VERCEL=1 is set on Vercel deployments, NODE_ENV=production for other prod envs
  const isServerProduction =
    typeof window === "undefined" &&
    (process.env.VERCEL === "1" || process.env.NODE_ENV === "production");

  if (isServerProduction) {
    // In production server-side, we MUST have a cloud URL configured
    // This prevents the proxy from silently trying to connect to localhost
    console.error(
      "[Cloud URL] NEXT_PUBLIC_ELIZA_CLOUD_URL is not set in production! " +
      "The miniapp proxy cannot connect to Eliza Cloud. " +
      "Please set this environment variable to your Eliza Cloud URL (e.g., https://eliza.elizaos.ai)"
    );
    // Return a placeholder that will fail fast with a clear error
    return "https://cloud-url-not-configured.invalid";
  }

  // In browser (production), use same origin as miniapp
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // If not localhost or local IP, use current origin
    if (
      hostname !== "localhost" &&
      !hostname.startsWith("192.168") &&
      !hostname.startsWith("127.")
    ) {
      const protocol = window.location.protocol;
      return `${protocol}//${hostname}`;
    }
  }

  // Default for local development
  return "http://localhost:3000";
}
