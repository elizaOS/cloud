
/**
 * Shared CORS utilities for proxy services
 *
 * Security Rationale:
 * These endpoints are public APIs consumed by browser-based dApps.
 * CORS is unrestricted by design because:
 * 1. Authentication is handled via API keys (X-API-Key header)
 * 2. Rate limiting is per API key
 * 3. Billing is per organization
 *
 * The API key requirement provides the actual access control,
 * not CORS restrictions.
 */

export function getCorsHeaders(methods?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods || "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, Cache-Control",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsOptions(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(methods),
  });
}

export function applyCorsHeaders(
  response: Response,
  methods?: string,
): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(getCorsHeaders(methods))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
