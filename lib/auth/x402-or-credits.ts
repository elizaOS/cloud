// x402 or Credits Authentication
// For direct x402 payment, use withX402 from 'x402-next' or createPaidMcpHandler from 'x402-mcp'

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg, type AuthResult } from "@/lib/auth";
import {
  X402_ENABLED,
  isX402Configured,
  getDefaultNetwork,
  X402_RECIPIENT_ADDRESS,
} from "@/lib/config/x402";
import { creditsService } from "@/lib/services/credits";

export interface PaymentContext {
  paymentMethod: "credits";
  auth: AuthResult;
  amountPaid: number;
}

export function hasX402Payment(request: NextRequest): boolean {
  return request.headers.has("X-PAYMENT");
}

// x402 pricing tiers based on model
export function getX402Price(model: string): string {
  const m = model.toLowerCase();

  // Enterprise ($0.20)
  if (m.includes("gpt-5.2-pro")) return "$0.20";

  // Premium ($0.10)
  if (m.includes("claude-opus-4.5") || m.includes("claude-4-opus"))
    return "$0.10";
  if (m.includes("gpt-5.2") && !m.includes("pro")) return "$0.10";

  // Standard ($0.05)
  if (m.includes("gpt-4o") && !m.includes("mini")) return "$0.05";
  if (m.includes("claude-sonnet-4") || m.includes("claude-3-5-sonnet"))
    return "$0.05";
  if (m.includes("gemini") && m.includes("pro")) return "$0.05";
  if (m.includes("grok-4.1") && !m.includes("fast")) return "$0.05";
  if (m.includes("command-r-plus") || m.includes("command-r+")) return "$0.05";

  // Budget ($0.02)
  if (m.includes("gpt-4o-mini") || m.includes("gpt-5-mini")) return "$0.02";
  if (m.includes("claude-haiku") || m.includes("claude-3-haiku"))
    return "$0.02";
  if (m.includes("gemini") && !m.includes("pro")) return "$0.02";
  if (m.includes("grok") && m.includes("fast")) return "$0.02";
  if (m.includes("command-r") && !m.includes("plus")) return "$0.02";

  // Ultra-cheap ($0.01)
  if (m.includes("groq/") || m.includes("llama-3.1")) return "$0.01";
  if (m.includes("cerebras/") || m.includes("qwen-3")) return "$0.01";
  if (m.includes("fireworks/") || m.includes("gpt-oss")) return "$0.01";
  if (m.includes("deepseek")) return "$0.01";

  return "$0.03";
}

export function generate402Response(
  price: string,
  description: string,
  request: NextRequest,
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
    },
  );
}

export async function requireCreditsWithX402Fallback(
  request: NextRequest,
  estimatedCost: number,
  description: string,
): Promise<PaymentContext> {
  const auth = await requireAuthOrApiKeyWithOrg(request);

  const deductResult = await creditsService.deductCredits({
    organizationId: auth.user.organization_id,
    amount: estimatedCost,
    description,
    metadata: { user_id: auth.user.id },
    session_token: auth.session_token,
  });

  if (!deductResult.success) {
    if (X402_ENABLED && isX402Configured()) {
      throw new Error(
        `Insufficient credits ($${deductResult.newBalance.toFixed(2)} available). ` +
          `Top up via x402 at /api/v1/credits/topup with $${Math.max(1, estimatedCost).toFixed(2)} USDC.`,
      );
    }
    throw new Error(
      `Insufficient credits. Required: $${estimatedCost.toFixed(4)}, Available: $${deductResult.newBalance.toFixed(2)}`,
    );
  }

  return { paymentMethod: "credits", auth, amountPaid: estimatedCost };
}

export async function refundIfCredits(
  ctx: PaymentContext,
  amount: number,
  description: string,
): Promise<void> {
  if (ctx.paymentMethod === "credits" && ctx.auth) {
    await creditsService.refundCredits({
      organizationId: ctx.auth.user.organization_id,
      amount,
      description,
      metadata: { user_id: ctx.auth.user.id },
    });
  }
}

export async function chargeAdditionalIfCredits(
  ctx: PaymentContext,
  additionalAmount: number,
  description: string,
): Promise<void> {
  if (ctx.paymentMethod === "credits" && ctx.auth && additionalAmount > 0) {
    await creditsService.deductCredits({
      organizationId: ctx.auth.user.organization_id,
      amount: additionalAmount,
      description,
      metadata: { user_id: ctx.auth.user.id },
    });
  }
}
