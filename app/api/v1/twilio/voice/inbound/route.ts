/**
 * Twilio voice inbound webhook.
 *
 * Records the incoming call envelope and returns TwiML that plays a short
 * acknowledgement. Full voice-AI routing (Media Streams → agent → TwiML
 * Say/Gather loop) is deliberately out of scope for T9e; this lands the call
 * receipt on the DB so downstream voice plugins (future work) can pick it up.
 *
 * The route intentionally does not require a bearer token — Twilio does not
 * send one. Signature verification uses `X-Twilio-Signature` against the
 * account-level auth token. If the token is not configured we refuse to
 * record the call to avoid trusting unsigned payloads in production.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbWrite } from "@/db/helpers";
import { twilioInboundCalls } from "@/db/schemas";
import { logger } from "@/lib/utils/logger";
import { verifyTwilioSignature } from "@/lib/utils/twilio-api";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const TwilioVoicePayloadSchema = z
  .object({
    CallSid: z.string().min(1),
    AccountSid: z.string().min(1),
    From: z.string().min(1),
    To: z.string().min(1),
    CallStatus: z.string().min(1),
  })
  .passthrough();

const TWIML_ACK = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thanks — your call is being routed to the assistant.</Say></Response>`;

function resolveForwardedUrl(request: NextRequest): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto) url.protocol = `${forwardedProto}:`;
  if (forwardedHost) url.host = forwardedHost;
  if (process.env.TWILIO_PUBLIC_URL) {
    const publicBase = new URL(process.env.TWILIO_PUBLIC_URL);
    url.protocol = publicBase.protocol;
    url.host = publicBase.host;
  }
  return url.toString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    logger.warn("[twilio-voice-inbound] TWILIO_AUTH_TOKEN not configured — refusing call");
    return new NextResponse("Twilio auth token not configured", {
      status: 503,
    });
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const fullUrl = resolveForwardedUrl(request);
  if (!signature || !(await verifyTwilioSignature(authToken, signature, fullUrl, params))) {
    logger.warn("[twilio-voice-inbound] signature verification failed", {
      url: fullUrl,
    });
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const parsed = TwilioVoicePayloadSchema.safeParse(params);
  if (!parsed.success) {
    logger.warn("[twilio-voice-inbound] invalid payload", {
      errors: parsed.error.format(),
    });
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const event = parsed.data;

  await dbWrite
    .insert(twilioInboundCalls)
    .values({
      call_sid: event.CallSid,
      account_sid: event.AccountSid,
      from_number: event.From,
      to_number: event.To,
      call_status: event.CallStatus,
      raw_payload: params,
    })
    .onConflictDoNothing({ target: twilioInboundCalls.call_sid });

  logger.info("[twilio-voice-inbound] recorded call", {
    callSid: event.CallSid,
    from: event.From,
    to: event.To,
    status: event.CallStatus,
  });

  return new NextResponse(TWIML_ACK, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
