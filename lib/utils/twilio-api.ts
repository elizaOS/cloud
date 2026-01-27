/**
 * Twilio API Utilities
 *
 * Shared constants and helpers for Twilio SMS/MMS/Voice API interactions.
 */

export const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export interface TwilioSendMessageRequest {
  to: string;
  body?: string;
  mediaUrl?: string[];
  statusCallback?: string;
}

export interface TwilioSendMessageResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body?: string;
  date_created: string;
  error_code?: string;
  error_message?: string;
}

export interface TwilioWebhookEvent {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaUrl1?: string;
  MediaUrl2?: string;
  MediaContentType0?: string;
  MediaContentType1?: string;
  MediaContentType2?: string;
  FromCity?: string;
  FromState?: string;
  FromCountry?: string;
  FromZip?: string;
}

/**
 * Make a Twilio API request
 */
export async function twilioApiRequest<T>(
  accountSid: string,
  authToken: string,
  method: string,
  endpoint: string,
  body?: URLSearchParams,
): Promise<T> {
  const url = `${TWILIO_API_BASE}/Accounts/${accountSid}${endpoint}`;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body?.toString(),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Twilio API error (${response.status}): ${responseText}`);
  }

  if (!responseText) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`Invalid JSON response from Twilio: ${responseText}`);
  }
}

/**
 * Verify Twilio webhook signature
 *
 * Twilio uses HMAC-SHA1 signature verification.
 */
export async function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!signature || !authToken) {
    return false;
  }

  try {
    // Sort params alphabetically and concatenate
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join("");

    const data = url + sortedParams;

    // Compute HMAC-SHA1 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(authToken),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(data),
    );

    // Convert to base64
    const computedSignature = btoa(
      String.fromCharCode(...new Uint8Array(signatureBuffer)),
    );

    return computedSignature === signature;
  } catch {
    return false;
  }
}

/**
 * Validate E.164 phone number format
 */
export function isE164PhoneNumber(phoneNumber: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
}

/**
 * Extract media URLs from Twilio webhook event
 */
export function extractMediaUrls(event: TwilioWebhookEvent): string[] {
  const urls: string[] = [];
  const numMedia = Number.parseInt(event.NumMedia || "0", 10);

  for (let i = 0; i < numMedia; i++) {
    const urlKey = `MediaUrl${i}` as keyof TwilioWebhookEvent;
    const url = event[urlKey];
    if (url && typeof url === "string") {
      urls.push(url);
    }
  }

  return urls;
}
