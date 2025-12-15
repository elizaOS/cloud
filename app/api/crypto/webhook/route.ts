import { type NextRequest, NextResponse } from "next/server";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { isOxaPayConfigured } from "@/lib/services/oxapay";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { createHmac, timingSafeEqual } from "crypto";

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

    const rawBody = await req.text();
    const signature = req.headers.get("hmac");
    const auditSecret = process.env.WEBHOOK_AUDIT_SECRET || process.env.CRON_SECRET || "default-audit-secret";
    const payloadHash = createHmac("sha256", auditSecret)
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

    logger.info("[Crypto Webhook] Valid webhook received", {
      ip,
      track_id: payload.track_id,
      status: payload.status,
      payloadHash,
    });

    const result = await cryptoPaymentsService.handleWebhook(payload);

    logger.info("[Crypto Webhook] Webhook processed successfully", {
      ip,
      track_id: payload.track_id,
      success: result.success,
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
