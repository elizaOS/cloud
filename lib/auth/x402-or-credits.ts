/**
 * x402 or Credits Authentication
 *
 * Provides permissionless access via x402 payment OR authenticated access via API key/credits.
 * This enables agents to use our services without pre-registration.
 *
 * Flow:
 * 1. Check for X-PAYMENT header (x402 payment)
 * 2. If present, verify payment and proceed (no account needed)
 * 3. If not, fall back to standard auth and credit deduction
 *
 * @see https://x402.org
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg, type AuthResult } from "@/lib/auth";
import { X402_ENABLED, isX402Configured, getDefaultNetwork, X402_RECIPIENT_ADDRESS } from "@/lib/config/x402";
import { getFacilitator } from "@/lib/middleware/x402-payment";
import { creditsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * Payment context returned by x402 or credits auth
 */
export interface PaymentContext {
  /** How the request was paid for */
  paymentMethod: "x402" | "credits";
  /** User context if authenticated (null for x402-only) */
  auth: AuthResult | null;
  /** Amount paid (in USD) */
  amountPaid: number;
  /** Payer address for x402 */
  payerAddress?: string;
}

/**
 * Check if request has x402 payment
 */
export function hasX402Payment(request: NextRequest): boolean {
  return request.headers.has("X-PAYMENT");
}

/**
 * Get estimated price for x402 payment based on model
 * Returns price string like "$0.01"
 */
export function getX402Price(model: string): string {
  // Pricing based on model tier
  const modelLower = model.toLowerCase();
  
  // Premium models
  if (modelLower.includes("gpt-4o") && !modelLower.includes("mini")) return "$0.05";
  if (modelLower.includes("claude-3-5-sonnet")) return "$0.05";
  if (modelLower.includes("claude-3-opus")) return "$0.10";
  
  // Standard models
  if (modelLower.includes("gpt-4o-mini")) return "$0.02";
  if (modelLower.includes("claude-3-haiku")) return "$0.01";
  if (modelLower.includes("gemini")) return "$0.02";
  
  // Default for unknown models
  return "$0.03";
}

/**
 * Generate 402 Payment Required response with x402 details
 */
export function generate402Response(
  price: string,
  description: string,
  request: NextRequest
): NextResponse {
  const network = getDefaultNetwork();
  const accepts = {
    "x402-version": "1",
    accepts: [
      {
        scheme: "exact",
        network: `base-${network === "base" ? "mainnet" : "sepolia"}`,
        maxAmountRequired: price,
        resource: request.nextUrl.pathname,
        payTo: X402_RECIPIENT_ADDRESS,
        description,
      },
    ],
  };

  return NextResponse.json(
    {
      error: {
        message: `Payment required. Send ${price} via x402 to access this endpoint.`,
        type: "payment_required",
        code: "x402_required",
        x402: accepts,
      },
    },
    {
      status: 402,
      headers: {
        "X-Payment-Requirement": JSON.stringify(accepts),
        "Access-Control-Expose-Headers": "X-Payment-Requirement",
      },
    }
  );
}

/**
 * Authenticate via x402 OR credits
 *
 * Checks for x402 payment first (permissionless), then falls back to credits auth.
 *
 * @param request - The incoming request
 * @param estimatedCost - Estimated cost in USD for credit check
 * @param description - Description for credit transaction
 * @returns PaymentContext with payment method and auth info
 * @throws Error if neither payment method is valid
 */
export async function requireX402OrCredits(
  request: NextRequest,
  estimatedCost: number,
  description: string
): Promise<PaymentContext> {
  // Check for x402 payment first
  if (X402_ENABLED && isX402Configured() && hasX402Payment(request)) {
    const paymentHeader = request.headers.get("X-PAYMENT");
    
    // Verify x402 payment using the facilitator
    // Note: In production, you'd verify the payment here
    // For now, we trust the withX402 wrapper to handle this
    
    let payerAddress = "unknown";
    if (paymentHeader) {
      try {
        const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
        payerAddress = decoded.payload?.authorization?.from || "unknown";
      } catch {
        // Ignore decode errors
      }
    }

    logger.info("[x402OrCredits] x402 payment detected", {
      payerAddress,
      path: request.nextUrl.pathname,
    });

    // Try to get auth context if available (optional for x402)
    let auth: AuthResult | null = null;
    try {
      auth = await requireAuthOrApiKeyWithOrg(request);
    } catch {
      // x402 doesn't require auth
    }

    return {
      paymentMethod: "x402",
      auth,
      amountPaid: estimatedCost,
      payerAddress,
    };
  }

  // Fall back to credits auth
  const auth = await requireAuthOrApiKeyWithOrg(request);

  // Deduct credits
  const deductResult = await creditsService.deductCredits({
    organizationId: auth.user.organization_id,
    amount: estimatedCost,
    description,
    metadata: { user_id: auth.user.id },
    session_token: auth.session_token,
  });

  if (!deductResult.success) {
    // If x402 is enabled, offer it as an alternative
    if (X402_ENABLED && isX402Configured()) {
      throw new Error(
        `Insufficient credits ($${deductResult.newBalance.toFixed(2)} available). ` +
        `You can pay via x402 instead: send $${estimatedCost.toFixed(4)} USDC.`
      );
    }
    throw new Error(
      `Insufficient credits. Required: $${estimatedCost.toFixed(4)}, ` +
      `Available: $${deductResult.newBalance.toFixed(2)}`
    );
  }

  return {
    paymentMethod: "credits",
    auth,
    amountPaid: estimatedCost,
  };
}

/**
 * Refund credits if using credit payment method
 */
export async function refundIfCredits(
  ctx: PaymentContext,
  amount: number,
  description: string
): Promise<void> {
  if (ctx.paymentMethod === "credits" && ctx.auth) {
    await creditsService.refundCredits({
      organizationId: ctx.auth.user.organization_id,
      amount,
      description,
      metadata: { user_id: ctx.auth.user.id },
    });
  }
  // x402 payments are non-refundable (already settled on-chain)
}

/**
 * Additional credit deduction if actual cost exceeds estimate
 */
export async function chargeAdditionalIfCredits(
  ctx: PaymentContext,
  additionalAmount: number,
  description: string
): Promise<void> {
  if (ctx.paymentMethod === "credits" && ctx.auth && additionalAmount > 0) {
    await creditsService.deductCredits({
      organizationId: ctx.auth.user.organization_id,
      amount: additionalAmount,
      description,
      metadata: { user_id: ctx.auth.user.id },
    });
  }
  // x402 already paid fixed price
}

