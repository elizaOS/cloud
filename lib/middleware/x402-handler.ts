/**
 * x402 Payment Handler Middleware
 * Intercepts HTTP 402 responses and handles x402 payment flow
 */

import {
  facilitatorService,
  type PaymentRequirement,
} from "../services/facilitator";
import type { Address } from "viem";

export interface X402PaymentResponse {
  status: 402;
  headers: {
    "X-Payment-Requirement": string;
    "WWW-Authenticate": string;
  };
  body: {
    error: {
      message: string;
      type: string;
      code: string;
    };
    paymentRequirement?: PaymentRequirement;
  };
}

export interface X402HandlerOptions {
  network?: string;
  defaultAsset?: Address;
  onPaymentVerified?: (payer: Address, amount: string) => Promise<void>;
  onPaymentSettled?: (txHash: string) => Promise<void>;
}

/**
 * Check if a response is an x402 payment requirement
 */
export function isX402Response(response: Response): boolean {
  return (
    response.status === 402 &&
    response.headers.get("X-Payment-Requirement") !== null
  );
}

/**
 * Parse x402 payment requirement from response headers
 */
export function parsePaymentRequirement(
  response: Response,
): PaymentRequirement | null {
  const requirementHeader = response.headers.get("X-Payment-Requirement");
  if (!requirementHeader) return null;

  try {
    const decoded = Buffer.from(requirementHeader, "base64").toString("utf-8");
    return JSON.parse(decoded) as PaymentRequirement;
  } catch {
    return null;
  }
}

/**
 * Handle x402 payment flow
 * Returns payment header if payment successful, null if failed
 */
export async function handleX402Payment(
  requirement: PaymentRequirement,
  options?: X402HandlerOptions,
): Promise<{ paymentHeader: string; payer: Address } | null> {
  // This would typically be called from client-side with wallet
  // For server-side, we can only verify, not create payments
  // Return null to indicate client-side handling needed
  return null;
}

/**
 * Verify a payment header against requirements
 */
export async function verifyX402Payment(
  paymentHeader: string,
  requirement: PaymentRequirement,
): Promise<{ isValid: boolean; payer: Address | null; error: string | null }> {
  const result = await facilitatorService.verify(paymentHeader, requirement);
  return {
    isValid: result.isValid,
    payer: result.payer,
    error: result.invalidReason,
  };
}

/**
 * Settle a verified payment
 */
export async function settleX402Payment(
  paymentHeader: string,
  requirement: PaymentRequirement,
): Promise<{ success: boolean; txHash: string | null; error: string | null }> {
  return facilitatorService.settle(paymentHeader, requirement);
}
