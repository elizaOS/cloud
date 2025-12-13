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
