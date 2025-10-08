/**
 * Client Environment Utilities
 *
 * Provides environment-aware configuration for client-side code
 */

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    // Server-side: use environment variable or default
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  }
  // Client-side: use current origin
  return window.location.origin;
}
