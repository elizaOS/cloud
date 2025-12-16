import { type NextRequest, NextResponse } from "next/server";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { isOxaPayConfigured } from "@/lib/services/oxapay";
import { logger, redact } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { webhookEventsRepository } from "@/db/repositories/webhook-events";
import {
  type OxaPayWebhookPayload,
  normalizeWebhookPayload,
  extractWebhookTimestamp,
  validateWebhookTimestamp,
} from "@/lib/config/crypto";

/**
 * Get the merchant API key for audit hashing.
 * This key is required when crypto payments are enabled to ensure
 * audit hashes are consistent and portable across deployments.
 */
function getAuditHashKey(): string | null {
  return process.env.OXAPAY_MERCHANT_API_KEY || null;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * OxaPay Webhook IP Allowlist
 *
 * When configured, only webhooks from these IP addresses will be accepted.
 * Set OXAPAY_WEBHOOK_IPS as a comma-separated list of IPs (e.g., "1.2.3.4,5.6.7.8")
 *
 * If not configured (empty), IP validation is skipped and we rely solely on HMAC signature.
 * For production, it's recommended to configure this with OxaPay's official webhook IPs.
 */
function getWebhookAllowedIps(): string[] {
  const ips = process.env.OXAPAY_WEBHOOK_IPS;
  if (!ips) return [];
  return ips
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/**
 * Validates that the request IP is in the allowlist (if configured).
 * Returns true if the IP is allowed or if no allowlist is configured.
 */
function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  // If no allowlist configured, allow all IPs (rely on signature verification)
  if (allowedIps.length === 0) return true;

  // Check if IP matches any in the allowlist
  return allowedIps.includes(ip);
}

/**
 * Get the HMAC secret for webhook signature verification.
 *
 * Per OxaPay documentation: "OxaPay uses your MERCHANT_API_KEY as the HMAC
 * shared secret key to generate an HMAC (sha512) signature of the raw POST data."
 */
function getWebhookHmacSecret(): string | null {
  return process.env.OXAPAY_MERCHANT_API_KEY || null;
}

function verifyOxaPaySignature(
  payload: string,
  signature: string | null,
  ip: string
): boolean {
  const secret = getWebhookHmacSecret();

  if (!secret) {
    logger.error(
      "[Crypto Webhook] HMAC secret not configured - OXAPAY_MERCHANT_API_KEY is required for webhook verification",
      { ip: redact.ip(ip) }
    );
    return false;
  }

  if (!signature) {
    logger.warn("[Crypto Webhook] No HMAC signature header provided", {
      ip: redact.ip(ip),
    });
    return false;
  }

  const expectedSignature = createHmac("sha512", secret)
    .update(payload)
    .digest("hex");

  try {
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      logger.warn("[Crypto Webhook] Signature length mismatch", {
        ip: redact.ip(ip),
        expected: expectedBuffer.length,
        received: sigBuffer.length,
      });
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    logger.error("[Crypto Webhook] Signature verification error", {
      ip: redact.ip(ip),
      error,
    });
    return false;
  }
}

/**
 * Generates a unique event ID for webhook deduplication.
 * Combines track_id, status, and payload hash to create a unique identifier.
 */
function generateWebhookEventId(
  trackId: string,
  status: string,
  payloadHash: string
): string {
  return `oxapay_${trackId}_${status}_${payloadHash}`;
}

async function handleWebhook(req: NextRequest) {
  const ip = getClientIp(req);
  const allowedIps = getWebhookAllowedIps();

  // IP Allowlist Check - First line of defense before processing
  if (!isIpAllowed(ip, allowedIps)) {
    logger.warn(
      "[Crypto Webhook] Request from non-allowlisted IP - potential unauthorized access",
      {
        ip: redact.ip(ip),
        allowlistConfigured: allowedIps.length > 0,
      }
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    if (!isOxaPayConfigured()) {
      logger.warn("[Crypto Webhook] Service not configured", {
        ip: redact.ip(ip),
      });
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    // Validate that the merchant API key is set - required for portable audit hashes
    const auditHashKey = getAuditHashKey();
    if (!auditHashKey) {
      logger.error(
        "[Crypto Webhook] OXAPAY_MERCHANT_API_KEY is required when crypto payments are enabled",
        { ip: redact.ip(ip) }
      );
      return NextResponse.json(
        { error: "Service misconfigured" },
        { status: 503 }
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("hmac");
    const timestampHeader =
      req.headers.get("x-webhook-timestamp") || req.headers.get("timestamp");

    // Generate unique hash for audit logging and deduplication
    const payloadHash = createHmac("sha256", auditHashKey)
      .update(rawBody)
      .digest("hex")
      .slice(0, 16);

    if (!verifyOxaPaySignature(rawBody, signature, ip)) {
      logger.error(
        "[Crypto Webhook] Signature verification failed - potential security threat",
        {
          ip: redact.ip(ip),
          payloadHash,
          hasSignature: !!signature,
        }
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: OxaPayWebhookPayload;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn("[Crypto Webhook] Invalid JSON payload", {
        ip: redact.ip(ip),
        payloadHash,
      });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const normalizedPayload = normalizeWebhookPayload(payload);

    if (!normalizedPayload.trackId || !normalizedPayload.status) {
      logger.warn("[Crypto Webhook] Missing required fields", {
        ip: redact.ip(ip),
        payloadHash,
        hasTrackId: !!normalizedPayload.trackId,
        hasStatus: !!normalizedPayload.status,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate webhook timestamp to prevent replay attacks
    const webhookTimestampMs = extractWebhookTimestamp(
      timestampHeader,
      payload
    );
    const timestampValidation = validateWebhookTimestamp(webhookTimestampMs);
    if (!timestampValidation.isValid) {
      logger.warn(
        "[Crypto Webhook] Timestamp validation failed - potential replay attack",
        {
          ip: redact.ip(ip),
          payloadHash,
          trackId: redact.trackId(normalizedPayload.trackId),
          error: timestampValidation.error,
        }
      );
      return NextResponse.json(
        { error: `Webhook rejected: ${timestampValidation.error}` },
        { status: 400 }
      );
    }

    // Generate unique event ID for deduplication
    const eventId = generateWebhookEventId(
      normalizedPayload.trackId,
      normalizedPayload.status,
      payloadHash
    );

    // Atomic deduplication: Try to insert first, handle duplicate error.
    // This eliminates the race condition between check and insert.
    // The unique constraint on event_id ensures only one request wins.
    const insertResult = await webhookEventsRepository.tryCreate({
      event_id: eventId,
      provider: "oxapay",
      event_type: normalizedPayload.status,
      payload_hash: payloadHash,
      source_ip: ip,
      event_timestamp: timestampValidation.timestamp,
    });

    if (!insertResult.created) {
      // Duplicate - webhook already being processed or processed
      logger.warn("[Crypto Webhook] Duplicate webhook detected - ignoring", {
        ip: redact.ip(ip),
        payloadHash,
        trackId: redact.trackId(normalizedPayload.trackId),
        status: normalizedPayload.status,
        eventId,
      });
      return NextResponse.json({
        success: true,
        message: "Webhook already processed",
      });
    }

    logger.info("[Crypto Webhook] Valid webhook received", {
      ip: redact.ip(ip),
      trackId: redact.trackId(normalizedPayload.trackId),
      status: normalizedPayload.status,
      payloadHash,
      eventId,
    });

    const result = await cryptoPaymentsService.handleWebhook({
      track_id: normalizedPayload.trackId,
      status: normalizedPayload.status,
      amount: normalizedPayload.amount,
      pay_amount: normalizedPayload.payAmount,
      txID: normalizedPayload.txID,
    });

    logger.info("[Crypto Webhook] Webhook processed successfully", {
      ip: redact.ip(ip),
      trackId: redact.trackId(normalizedPayload.trackId),
      success: result.success,
      message: result.message,
      eventId,
    });

    // OxaPay requires exactly "ok" response with HTTP 200 for successful delivery
    // Per docs: "Merchant's callback_url must return an HTTP 200 response with content 'ok'"
    return new Response("ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    logger.error("[Crypto Webhook] Error processing webhook", {
      ip: redact.ip(ip),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Return 500 so OxaPay will retry the webhook
    return new Response("error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// Use STANDARD rate limit for webhooks to allow OxaPay retries
export const POST = withRateLimit(handleWebhook, RateLimitPresets.STANDARD);

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "OxaPay webhook endpoint",
  });
}
