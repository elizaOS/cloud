/**
 * CORS Middleware
 *
 * Re-exports CORS utilities from the app CORS module.
 */

export {
  validateOrigin,
  addCorsHeaders,
  createPreflightResponse,
  withCors,
  withCorsValidation,
  type CorsValidationResult,
} from "./cors-apps";
