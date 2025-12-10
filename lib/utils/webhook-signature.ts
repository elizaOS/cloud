/**
 * Webhook Signature Verification Utilities
 * 
 * Provides HMAC-based signature verification for webhook security.
 * Follows industry best practices (similar to Stripe, GitHub webhooks).
 * 
 * Signature format: t=<timestamp>,v1=<signature>
 * - timestamp: Unix timestamp when signature was generated
 * - signature: HMAC-SHA256 of "<timestamp>.<payload>" using webhook secret
 */

import crypto from "crypto";

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookSignatureConfig {
  /** Header name for the signature (default: x-webhook-signature) */
  signatureHeader?: string;
  /** HMAC algorithm (default: sha256) */
  algorithm?: "sha256" | "sha512";
  /** Maximum age of request in seconds (default: 300 = 5 minutes) */
  timestampTolerance?: number;
  /** Version prefix for signature (default: v1) */
  version?: string;
}

export interface VerifySignatureParams {
  payload: string;
  signature: string;
  secret: string;
  config?: WebhookSignatureConfig;
}

export interface VerifySignatureResult {
  valid: boolean;
  error?: string;
  timestamp?: number;
}

export interface GenerateSignatureParams {
  payload: string;
  secret: string;
  timestamp?: number;
  config?: WebhookSignatureConfig;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIG: Required<WebhookSignatureConfig> = {
  signatureHeader: "x-webhook-signature",
  algorithm: "sha256",
  timestampTolerance: 300, // 5 minutes
  version: "v1",
};

// =============================================================================
// SIGNATURE VERIFICATION
// =============================================================================

/**
 * Verify a webhook signature.
 * 
 * Expected signature format: t=<timestamp>,v1=<signature>
 * 
 * @param params - Verification parameters
 * @returns Result with valid flag and optional error
 */
export function verifyWebhookSignature(params: VerifySignatureParams): VerifySignatureResult {
  const { payload, signature, secret, config = {} } = params;
  const { algorithm, timestampTolerance, version } = { ...DEFAULT_CONFIG, ...config };

  if (!signature) {
    return { valid: false, error: "Missing signature" };
  }

  if (!secret) {
    return { valid: false, error: "Webhook secret not configured" };
  }

  // Parse signature: t=<timestamp>,v1=<signature>
  const parts = signature.split(",");
  const timestampPart = parts.find(p => p.startsWith("t="));
  const signaturePart = parts.find(p => p.startsWith(`${version}=`));

  if (!timestampPart) {
    return { valid: false, error: "Missing timestamp in signature" };
  }

  if (!signaturePart) {
    return { valid: false, error: `Missing ${version} signature` };
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  const providedSignature = signaturePart.slice(version.length + 1);

  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp format" };
  }

  // Check timestamp is within tolerance (prevents replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(now - timestamp);
  
  if (timeDiff > timestampTolerance) {
    return { 
      valid: false, 
      error: `Request expired (${timeDiff}s old, max ${timestampTolerance}s)`,
      timestamp,
    };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(signedPayload)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  let isValid: boolean;
  try {
    isValid = crypto.timingSafeEqual(
      Buffer.from(providedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    // If buffers are different lengths, timingSafeEqual throws
    isValid = false;
  }

  if (!isValid) {
    return { valid: false, error: "Invalid signature", timestamp };
  }

  return { valid: true, timestamp };
}

// =============================================================================
// SIGNATURE GENERATION
// =============================================================================

/**
 * Generate a webhook signature for a payload.
 * 
 * @param params - Generation parameters
 * @returns Signature string in format "t=<timestamp>,v1=<signature>"
 */
export function generateWebhookSignature(params: GenerateSignatureParams): string {
  const { payload, secret, config = {} } = params;
  const { algorithm, version } = { ...DEFAULT_CONFIG, ...config };
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);

  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac(algorithm, secret)
    .update(signedPayload)
    .digest("hex");

  return `t=${timestamp},${version}=${signature}`;
}

/**
 * Generate a secure webhook secret.
 * 
 * @returns 32-byte hex-encoded secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get signature from request headers.
 * 
 * @param headers - Request headers
 * @param headerName - Header name to look for (default: x-webhook-signature)
 * @returns Signature string or null
 */
export function getSignatureFromHeaders(
  headers: Headers,
  headerName: string = DEFAULT_CONFIG.signatureHeader
): string | null {
  return headers.get(headerName);
}

/**
 * Create signature headers for outgoing webhook requests.
 * 
 * @param payload - Request body as string
 * @param secret - Webhook secret
 * @param config - Optional configuration
 * @returns Headers object with signature
 */
export function createSignatureHeaders(
  payload: string,
  secret: string,
  config?: WebhookSignatureConfig
): Record<string, string> {
  const { signatureHeader } = { ...DEFAULT_CONFIG, ...config };
  const signature = generateWebhookSignature({ payload, secret, config });
  
  return {
    [signatureHeader]: signature,
    "Content-Type": "application/json",
  };
}

