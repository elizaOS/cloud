/**
 * API Utilities
 *
 * Re-exports commonly used authentication utilities for API routes.
 */

export {
  requireAuth,
  requireAuthOrApiKeyWithOrg,
  getCurrentUser,
  type AuthResult,
} from "@/lib/auth";
