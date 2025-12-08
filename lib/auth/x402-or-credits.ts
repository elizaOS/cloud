/**
 * x402 or Credits Authentication Utilities
 *
 * IMPORTANT: For direct x402 payment verification on API routes, use:
 * - `withX402` from 'x402-next' - wraps handler with payment verification
 * - `createPaidMcpHandler` from 'x402-mcp' - for MCP servers
 *
 * This module provides helper functions for:
 * - Checking if x402 payment header is present
 * - Generating 402 responses with payment requirements
 * - Getting estimated prices for different models
 * - Credit-based authentication with x402 fallback messaging
 *
 * The recommended pattern is:
 * 1. For credit topup: use withX402 wrapper (see /api/v1/credits/topup)
 * 2. For paid MCP: use createPaidMcpHandler (see /api/mcp/demos/*)
 * 3. For credit-based routes: use requireAuthOrApiKeyWithOrg, return 402 with topup info on failure
 *
 * @see https://x402.org
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg, type AuthResult } from "@/lib/auth";
import { X402_ENABLED, isX402Configured, getDefaultNetwork, X402_RECIPIENT_ADDRESS } from "@/lib/config/x402";
import { creditsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * Payment context returned by credits auth
 * 
 * NOTE: x402 direct payment is handled by the `withX402` wrapper from 'x402-next'.
 * This module only deals with credit-based authentication.
 * The "x402" payment method type is kept for compatibility but is not used here.
 */
export interface PaymentContext {
  /** How the request was paid for (always "credits" from this module) */
  paymentMethod: "credits";
  /** User context (required for credit-based auth) */
  auth: AuthResult;
  /** Amount paid (in USD) */
  amountPaid: number;
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
 * Authenticate via credits, with messaging about x402 as alternative
 *
 * NOTE: This does NOT accept x402 payments directly. For accepting x402 payments:
 * - Use `withX402` wrapper from 'x402-next' for your route handler
 * - Use `createPaidMcpHandler` from 'x402-mcp' for MCP servers
 *
 * This function:
 * 1. Requires API key or session authentication
 * 2. Deducts credits from the organization
 * 3. Returns helpful error messages mentioning x402 as an alternative if credits are insufficient
 *
 * @param request - The incoming request
 * @param estimatedCost - Estimated cost in USD for credit check
 * @param description - Description for credit transaction
 * @returns PaymentContext with payment method and auth info
 * @throws Error if auth fails or insufficient credits
 */
export async function requireCreditsWithX402Fallback(
  request: NextRequest,
  estimatedCost: number,
  description: string
): Promise<PaymentContext> {
  // Require standard auth
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
        `Top up via x402 at /api/v1/credits/topup with $${Math.max(1, estimatedCost).toFixed(2)} USDC.`
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
 * @deprecated Use requireCreditsWithX402Fallback instead.
 * This function name was misleading - it doesn't actually verify x402 payments.
 */
export const requireX402OrCredits = requireCreditsWithX402Fallback;

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

