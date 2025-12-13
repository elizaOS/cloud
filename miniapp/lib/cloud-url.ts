/**
 * Get the Eliza Cloud URL with smart defaults for production
 * 
 * Auto-detects production URL if NEXT_PUBLIC_ELIZA_CLOUD_URL is not set.
 */
export function getCloudUrl(): string {
  // Use environment variable if set
  if (process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL) {
    return process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL;
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
