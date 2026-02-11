import { NextResponse } from "next/server";

/**
 * CORS Configuration for Public APIs
 * 
 * SECURITY NOTE: Unrestricted CORS (Access-Control-Allow-Origin: "*") is INTENTIONAL
 * 
 * WHY OPEN CORS IS REQUIRED:
 * 
 * 1. Public API Design
 *    - These endpoints are designed as public, consumable APIs
 *    - Meant to be called from any web application, mobile app, or third-party service
 *    - Unknown consumer domains (we cannot predict who will integrate)
 * 
 * 2. Revenue Model
 *    - Access control is handled via API keys (X-API-Key header)
 *    - Rate limiting is enforced per API key
 *    - Billing is tied to API key usage, not origin domain
 * 
 * 3. Use Cases
 *    - Developer tools and integrations
 *    - Browser-based dApps and wallets
 *    - Third-party analytics and monitoring tools
 *    - Cross-origin blockchain data access
 * 
 * 4. Protection Mechanisms
 *    - API key authentication (required for most endpoints)
 *    - Rate limiting per key
 *    - Input validation (e.g., Solana address verification)
 *    - Request size limits
 *    - Cost tracking and billing
 * 
 * CORS is NOT a security boundary for:
 *    - Authentication (handled by API keys)
 *    - Authorization (handled by user/org validation)
 *    - Rate limiting (handled by proxy layer)
 * 
 * Restricting CORS would:
 *    ❌ Break legitimate third-party integrations
 *    ❌ Prevent browser-based apps from using the API
 *    ❌ Reduce API adoption and revenue
 *    ❌ Force workarounds like CORS proxies
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 */
export function getCorsHeaders(allowedMethods: string = "GET, POST, OPTIONS") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, Cache-Control",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Standard OPTIONS handler for CORS preflight requests
 * 
 * Handles browser preflight checks for cross-origin requests.
 * Required for public API consumption from web applications.
 */
export function handleCorsOptions(allowedMethods?: string) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(allowedMethods),
  });
}
