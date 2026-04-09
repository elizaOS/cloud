import { timingSafeEqual } from "crypto";
import { logger } from "./logger";

/**
 * Validates the X-Internal-Secret header against the K8s-mounted secret
 * using constant-time comparison to prevent timing attacks.
 *
 * The secret is read from process.env on each call (same pattern as
 * AGENT_SERVER_SHARED_SECRET in tryTarget) so runtime config changes
 * are picked up without a restart.
 *
 * Returns false (and logs at warn level) when:
 * - GATEWAY_INTERNAL_SECRET env var is not configured
 * - Header is missing from the request
 * - Header length does not match the secret length
 * - Header value does not match the secret
 */
export function validateInternalSecret(request: Request): boolean {
  const secret = process.env.GATEWAY_INTERNAL_SECRET ?? "";
  const header = request.headers.get("X-Internal-Secret") ?? "";

  if (!secret) {
    logger.warn("Internal auth rejected: GATEWAY_INTERNAL_SECRET not configured");
    return false;
  }

  if (!header) {
    logger.warn("Internal auth rejected: missing X-Internal-Secret header");
    return false;
  }

  const a = Buffer.from(header);
  const b = Buffer.from(secret);

  if (a.length !== b.length) {
    logger.warn("Internal auth rejected: secret length mismatch");
    return false;
  }

  if (!timingSafeEqual(a, b)) {
    logger.warn("Internal auth rejected: invalid secret");
    return false;
  }

  return true;
}
