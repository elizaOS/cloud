import { type NextRequest, NextResponse } from "next/server";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { isOxaPayConfigured } from "@/lib/services/oxapay";
import { logger } from "@/lib/utils/logger";
import { createHmac } from "crypto";

function verifyOxaPaySignature(
  payload: string,
  signature: string | null,
): boolean {
  const secret = process.env.OXAPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("[Crypto Webhook] No webhook secret configured, skipping verification");
    return true;
  }

  if (!signature) {
    logger.warn("[Crypto Webhook] No signature provided");
    return false;
  }

  const expectedSignature = createHmac("sha512", secret)
    .update(payload)
    .digest("hex");

  return signature === expectedSignature;
}

export async function POST(req: NextRequest) {
  try {
    if (!isOxaPayConfigured()) {
      return NextResponse.json(
        { error: "Crypto payments not configured" },
        { status: 503 },
      );
    }

    const rawBody = await req.text();
    const signature = req.headers.get("hmac");

    if (!verifyOxaPaySignature(rawBody, signature)) {
      logger.warn("[Crypto Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!payload.track_id || !payload.status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    logger.info("[Crypto Webhook] Received callback", {
      track_id: payload.track_id,
      status: payload.status,
    });

    const result = await cryptoPaymentsService.handleWebhook(payload);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[Crypto Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "OxaPay webhook endpoint" });
}
