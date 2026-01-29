/**
 * Blooio API Utilities
 *
 * Shared constants and helpers for Blooio iMessage/SMS API interactions.
 */

import { z } from "zod";

export const BLOOIO_API_BASE = "https://backend.blooio.com/v2/api";

export interface BlooioSendMessageRequest {
  text?: string;
  attachments?: Array<string | { url: string; name?: string }>;
  metadata?: Record<string, unknown>;
  use_typing_indicator?: boolean;
  fromNumber?: string;
  idempotencyKey?: string;
}

export interface BlooioSendMessageResponse {
  message_id?: string;
  message_ids?: string[];
  status?: string;
}

export interface BlooioWebhookEvent {
  event: string;
  message_id?: string;
  external_id?: string;
  internal_id?: string;
  sender?: string;
  text?: string;
  attachments?: Array<string | { url: string; name?: string }>;
  protocol?: string;
  is_group?: boolean;
  received_at?: number;
  timestamp?: number;
}

/**
 * Zod schema for validating Blooio webhook payloads
 * Prevents malformed data from causing runtime errors
 */
export const BlooioWebhookEventSchema = z.object({
  event: z.string().min(1, "Event type is required"),
  message_id: z.string().optional(),
  external_id: z.string().optional(),
  internal_id: z.string().optional(),
  sender: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(
    z.union([
      z.string(),
      z.object({
        url: z.string().url(),
        name: z.string().optional(),
      }),
    ])
  ).optional(),
  protocol: z.string().optional(),
  is_group: z.boolean().optional(),
  received_at: z.number().optional(),
  timestamp: z.number().optional(),
});

/**
 * Parse and validate a Blooio webhook payload
 * Returns the validated payload or throws a ZodError
 */
export function parseBlooioWebhookEvent(data: unknown): BlooioWebhookEvent {
  return BlooioWebhookEventSchema.parse(data);
}

/**
 * Make a Blooio API request
 */
export async function blooioApiRequest<T>(
  apiKey: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  options?: {
    fromNumber?: string;
    idempotencyKey?: string;
  },
): Promise<T> {
  const url = `${BLOOIO_API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (options?.fromNumber) {
    headers["X-From-Number"] = options.fromNumber;
  }

  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Blooio API error (${response.status}): ${responseText}`);
  }

  if (!responseText) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`Invalid JSON response from Blooio: ${responseText}`);
  }
}

/**
 * Verify Blooio webhook signature
 *
 * Blooio uses HMAC-SHA256 with the webhook secret.
 * Signature format: t=timestamp,v1=signature
 */
export async function verifyBlooioSignature(
  webhookSecret: string,
  signatureHeader: string,
  rawBody: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  try {
    // Parse signature header: t=timestamp,v1=signature
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p): p is string => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = Number.parseInt(timestampPart.substring(2), 10);
    const expectedSignature = signaturePart.substring(3);

    // Check timestamp tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }

    // Compute HMAC-SHA256 signature
    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload),
    );
    const computedSignature = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSignature === expectedSignature;
  } catch {
    return false;
  }
}

/**
 * Validate E.164 phone number format
 */
export function isE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
}

/**
 * Validate chat ID format
 * Accepts: E.164 phone numbers, email addresses, or group IDs (grp_*)
 */
export function validateBlooioChatId(chatId: string): boolean {
  if (!chatId || typeof chatId !== "string") {
    return false;
  }

  const parts = chatId
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  return parts.every((part) => {
    // E.164 phone number
    if (isE164(part)) return true;
    // Email address
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) return true;
    // Group ID
    if (part.startsWith("grp_")) return true;
    return false;
  });
}
