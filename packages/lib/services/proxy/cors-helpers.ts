/**
 * @deprecated Use lib/services/proxy/cors.ts instead - this is a duplicate module
 *
 * Shared CORS helpers for Solana proxy route handlers.
 *
 * CORS: Unrestricted by design - see lib/services/proxy/cors.ts for security rationale.
 */
export { getCorsHeaders, handleCorsOptions } from "./cors";
