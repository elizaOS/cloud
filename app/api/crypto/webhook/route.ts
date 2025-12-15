import { type NextRequest, NextResponse } from "next/server";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { isOxaPayConfigured } from "@/lib/services/oxapay";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { createHmac, timingSafeEqual } from "crypto";
import { webhookEventsRepository } from "@/db/repositories/webhook-events";

/**
 * Get the merchant API key for audit hashing.
 * This key is required when crypto payments are enabled to ensure
 * audit hashes are consistent and portable across deployments.
 */
function getAuditHashKey(): string | null {
  return process.env.OXAPAY_MERCHANT_API_KEY || null;
}

/**
 * Maximum age of a webhook before it's considered stale and rejected (in seconds).
 * This prevents replay attacks using old webhook payloads.
 * Default: 5 minutes (300 seconds)
 */
const WEBHOOK_MAX_AGE_SECONDS = 300;

/**
 * Tolerance for clock skew between our server and the webhook sender (in seconds).
 * This prevents rejecting legitimate webhooks due to minor time differences.
 * Default: 30 seconds into the future
 */
const WEBHOOK_CLOCK_SKEW_TOLERANCE_SECONDS = 30;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function verifyOxaPaySignature(
  payload: string,
  signature: string | null,
  ip: string,
): boolean {
  const secret = process.env.OXAPAY_WEBHOOK_SECRET;
  
  if (!secret) {
    logger.error("[Crypto Webhook] Webhook secret not configured - rejecting request", { ip });
    return false;
  }

  if (!signature) {
    logger.warn("[Crypto Webhook] No signature provided", { ip });
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
        ip,
        expected: expectedBuffer.length,
        received: sigBuffer.length,
      });
      return false;
    }
    
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    logger.error("[Crypto Webhook] Signature verification error", { ip, error });
    return false;
  }
}

/**
 * Generates a unique event ID for webhook deduplication.
 * Combines track_id, status, and payload hash to create a unique identifier.
 */
function generateWebhookEventId(trackId: string, status: string, payloadHash: string): string {
  return `oxapay_${trackId}_${status}_${payloadHash}`;
}

/**
 * Validates webhook timestamp to prevent replay attacks.
 * 
 * @param timestampHeader - The timestamp from the webhook header (if available)
 * @param payload - The parsed webhook payload (may contain timestamp)
 * @returns Object with isValid flag and optional error message
 */
function validateWebhookTimestamp(
  timestampHeader: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): { isValid: boolean; timestamp?: Date; error?: string } {
  const now = Date.now();
  
  // Try to get timestamp from header first, then from payload
  let webhookTimestamp: number | undefined;
  
  if (timestampHeader) {
    // Header timestamp (could be Unix timestamp in seconds or milliseconds)
    const parsed = parseInt(timestampHeader, 10);
    if (!isNaN(parsed)) {
      // If it looks like seconds (before year 2100), convert to milliseconds
      webhookTimestamp = parsed < 10000000000 ? parsed * 1000 : parsed;
    }
  }
  
  // OxaPay may include timestamp in payload (e.g., 'date' or 'timestamp' field)
  if (!webhookTimestamp && payload.date) {
    const parsed = typeof payload.date === "number" 
      ? payload.date 
      : parseInt(payload.date, 10);
    if (!isNaN(parsed)) {
      webhookTimestamp = parsed < 10000000000 ? parsed * 1000 : parsed;
    }
  }
  
  if (!webhookTimestamp && payload.timestamp) {
    const parsed = typeof payload.timestamp === "number"
      ? payload.timestamp
      : parseInt(payload.timestamp, 10);
    if (!isNaN(parsed)) {
      webhookTimestamp = parsed < 10000000000 ? parsed * 1000 : parsed;
    }
  }

  // If no timestamp is available, we can't validate timing but we'll still check for duplicates
  // This is a graceful degradation - we rely on deduplication for security
  if (!webhookTimestamp) {
    return { isValid: true, timestamp: undefined };
  }

  const webhookDate = new Date(webhookTimestamp);
  const ageSeconds = (now - webhookTimestamp) / 1000;

  // Reject webhooks that are too old
  if (ageSeconds > WEBHOOK_MAX_AGE_SECONDS) {
    return {
      isValid: false,
      timestamp: webhookDate,
      error: `Webhook is too old (${Math.round(ageSeconds)} seconds). Maximum age: ${WEBHOOK_MAX_AGE_SECONDS} seconds`,
    };
  }

  // Reject webhooks that are too far in the future (possible clock manipulation)
  if (ageSeconds < -WEBHOOK_CLOCK_SKEW_TOLERANCE_SECONDS) {
    return {
      isValid: false,
      timestamp: webhookDate,
      error: `Webhook timestamp is ${Math.abs(Math.round(ageSeconds))} seconds in the future`,
    };
  }

  return { isValid: true, timestamp: webhookDate };
}

async function handleWebhook(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    if (!isOxaPayConfigured()) {
      logger.warn("[Crypto Webhook] Service not configured", { ip });
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 },
      );
    }

    // Validate that the merchant API key is set - required for portable audit hashes
    const auditHashKey = getAuditHashKey();
    if (!auditHashKey) {
      logger.error("[Crypto Webhook] OXAPAY_MERCHANT_API_KEY is required when crypto payments are enabled", { ip });
      return NextResponse.json(
        { error: "Service misconfigured" },
        { status: 503 },
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("hmac");
    const timestampHeader = req.headers.get("x-webhook-timestamp") || req.headers.get("timestamp");
    
    // Generate unique hash for audit logging and deduplication
    const payloadHash = createHmac("sha256", auditHashKey)
      .update(rawBody)
      .digest("hex")
      .slice(0, 16);

    if (!verifyOxaPaySignature(rawBody, signature, ip)) {
      logger.error("[Crypto Webhook] Signature verification failed - potential security threat", {
        ip,
        payloadHash,
        hasSignature: !!signature,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: {
      track_id: string;
      status: string;
      amount?: number;
      pay_amount?: number;
      address?: string;
      txID?: string;
      date?: number | string;
      timestamp?: number | string;
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn("[Crypto Webhook] Invalid JSON payload", { ip, payloadHash });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!payload.track_id || !payload.status) {
      logger.warn("[Crypto Webhook] Missing required fields", {
        ip,
        payloadHash,
        hasTrackId: !!payload.track_id,
        hasStatus: !!payload.status,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Validate webhook timestamp to prevent replay attacks
    const timestampValidation = validateWebhookTimestamp(timestampHeader, payload);
    if (!timestampValidation.isValid) {
      logger.warn("[Crypto Webhook] Timestamp validation failed - potential replay attack", {
        ip,
        payloadHash,
        track_id: payload.track_id,
        error: timestampValidation.error,
      });
      return NextResponse.json(
        { error: "Webhook rejected: " + timestampValidation.error },
        { status: 400 },
      );
    }

    // Generate unique event ID for deduplication
    const eventId = generateWebhookEventId(payload.track_id, payload.status, payloadHash);

    // Check if this webhook has already been processed (replay attack prevention)
    const alreadyProcessed = await webhookEventsRepository.isProcessed(eventId);
    if (alreadyProcessed) {
      logger.warn("[Crypto Webhook] Duplicate webhook detected - ignoring replay", {
        ip,
        payloadHash,
        track_id: payload.track_id,
        status: payload.status,
        eventId,
      });
      // Return success to prevent the sender from retrying
      return NextResponse.json({ 
        success: true, 
        message: "Webhook already processed" 
      });
    }

    logger.info("[Crypto Webhook] Valid webhook received", {
      ip,
      track_id: payload.track_id,
      status: payload.status,
      payloadHash,
      eventId,
    });

    // Record the webhook event BEFORE processing to prevent race conditions
    // If processing fails, we'll still have a record and the sender can retry with a new signature
    try {
      await webhookEventsRepository.create({
        event_id: eventId,
        provider: "oxapay",
        event_type: payload.status,
        payload_hash: payloadHash,
        source_ip: ip,
        event_timestamp: timestampValidation.timestamp,
      });
    } catch (error) {
      // If we fail to record (likely due to unique constraint = duplicate), treat as already processed
      if (error instanceof Error && error.message.includes("unique")) {
        logger.warn("[Crypto Webhook] Race condition - webhook already being processed", {
          ip,
          payloadHash,
          track_id: payload.track_id,
          eventId,
        });
        return NextResponse.json({ 
          success: true, 
          message: "Webhook already processed" 
        });
      }
      // For other errors, log but continue processing
      logger.error("[Crypto Webhook] Failed to record webhook event", {
        ip,
        eventId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const result = await cryptoPaymentsService.handleWebhook(payload);

    logger.info("[Crypto Webhook] Webhook processed successfully", {
      ip,
      track_id: payload.track_id,
      success: result.success,
      eventId,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[Crypto Webhook] Error processing webhook", {
      ip,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleWebhook, RateLimitPresets.AGGRESSIVE);

export async function GET() {
  return NextResponse.json({ status: "ok", message: "OxaPay webhook endpoint" });
}
