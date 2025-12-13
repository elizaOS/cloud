/**
 * Get the Eliza Cloud URL with smart defaults for production
 * 
 * Checks multiple environment variable names for backward compatibility
 * and auto-detects production URL if not set.
 */
export function getCloudUrl(): string {
  // Check both possible env var names
  const envUrl = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL || process.env.NEXT_PUBLIC_ELIZA_URL;
  
  // If set and not the marketing site, use it
  if (envUrl && envUrl !== "https://elizaos.ai") {
    return envUrl;
  }
  
  // In browser (production), use same origin as miniapp
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // If not localhost or local IP, use current origin
    if (hostname !== "localhost" && !hostname.startsWith("192.168") && !hostname.startsWith("127.")) {
      const protocol = window.location.protocol;
      return `${protocol}//${hostname}`;
    }
  }
  
  // Default for local development
  return "http://localhost:3000";
}
