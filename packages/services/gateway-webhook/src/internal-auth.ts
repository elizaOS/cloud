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
 * - Header value does not match the secret
 *
 * Both buffers are padded to equal length so that timingSafeEqual
 * always runs regardless of input length, closing the timing oracle
 * that would otherwise let an attacker binary-search the secret length.
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
  const maxLen = Math.max(a.length, b.length);
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  a.copy(aPadded);
  b.copy(bPadded);

  const lengthMatch = a.length === b.length;
  const valueMatch = timingSafeEqual(aPadded, bPadded);
  if (!lengthMatch || !valueMatch) {
    logger.warn("Internal auth rejected: invalid secret");
    return false;
  }

  return true;
}
