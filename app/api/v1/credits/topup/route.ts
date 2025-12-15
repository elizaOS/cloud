/**
 * x402 Credit Top-Up Endpoint
 *
 * Allows users to top up their credits via x402 payment.
 * Uses the official x402-next package for payment handling.
 *
 * Flow:
 * 1. withX402 wrapper verifies payment BEFORE this handler runs
 * 2. This handler adds credits (payment is already verified)
 * 3. withX402 wrapper settles payment AFTER successful response
 *
 * IMPORTANT: If settlement fails after credits are added, the x402-next
 * wrapper returns 402 to the client. We log this for manual reconciliation.
 * The user's EIP-3009 authorization remains valid until maxTimeoutSeconds.
 *
 * POST /api/v1/credits/topup
 */

import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { organizationsService } from "@/lib/services/organizations";
import { agentReputationService } from "@/lib/services/agent-reputation";
import { getFacilitator } from "@/lib/middleware/x402-payment";
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  getDefaultNetwork,
  isX402Configured,
  TOPUP_PRICE,
  CREDITS_PER_DOLLAR,
} from "@/lib/config/x402";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

/**
 * Handler that runs AFTER x402 payment is verified.
 * If we reach this point, payment verification succeeded.
 */
async function topupHandler(request: NextRequest): Promise<NextResponse> {
  // Authenticate user - required to know which org to credit
  // If auth fails, return 401 - withX402 will NOT settle payment (status >= 400)
  const authResult = await requireAuthOrApiKeyWithOrg(request).catch(
    () => null,
  );

  if (!authResult) {
    logger.warn(
      "[Credits TopUp] Auth failed after payment verification - payment NOT settled",
    );
    return NextResponse.json(
      {
        error:
          "Authentication required for credit top-up. Payment was NOT charged.",
      },
      { status: 401 },
    );
  }

  // Calculate credits to add based on the fixed price
  const priceValue = parseFloat(TOPUP_PRICE.replace("$", ""));
  const creditsToAdd = Math.floor(priceValue * CREDITS_PER_DOLLAR);

  // Extract payer info from X-PAYMENT header for logging/audit
  let payerAddress = "unknown";
  const paymentHeader = request.headers.get("X-PAYMENT");
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString(),
      );
      payerAddress = decoded.payload?.authorization?.from || "unknown";
    } catch {
      // Ignore decode errors - payer address is just for logging
    }
  }

  // Add credits to user's organization
  // NOTE: If settlement fails after this, we need manual reconciliation
  const result = await creditsService.addCredits({
    organizationId: authResult.user.organization_id,
    amount: creditsToAdd,
    description: `Credit top-up via x402 (${TOPUP_PRICE})`,
    metadata: {
      user_id: authResult.user.id,
      payment_source: "x402",
      payer_address: payerAddress,
      network: getDefaultNetwork(),
      // Store payment header hash for potential reconciliation
      payment_header_hash: paymentHeader
        ? Buffer.from(paymentHeader).toString("base64").slice(0, 32)
        : null,
    },
  });

  logger.info("[Credits TopUp] Credits added, settlement pending", {
    creditsAdded: creditsToAdd,
    organizationId: authResult.user.organization_id,
    transactionId: result.transaction.id,
    payerAddress,
    network: getDefaultNetwork(),
  });

  // Track payment in agent reputation system (fire and forget)
  const agentIdentifier = `org:${authResult.user.organization_id}`;
  agentReputationService
    .recordPayment({
      agentIdentifier,
      amountUsd: priceValue,
      paymentType: "x402",
      transactionId: result.transaction.id,
    })
    .catch((err) => {
      logger.error("[Credits TopUp] Failed to record payment for reputation", {
        error: err,
      });
    });

  const org = await organizationsService.getById(
    authResult.user.organization_id,
  );

  // Return success - withX402 wrapper will settle payment after this
  // If settlement fails, client gets 402 but credits are already added (manual reconciliation needed)
  return NextResponse.json({
    success: true,
    creditsAdded: creditsToAdd,
    newBalance: org ? Number(org.credit_balance) : result.newBalance,
    transactionId: result.transaction.id,
    paymentSource: "x402",
    network: getDefaultNetwork(),
  });
}

// Wrap handler with x402 if enabled and configured
export const POST =
  X402_ENABLED && isX402Configured()
    ? withX402(
        topupHandler,
        X402_RECIPIENT_ADDRESS,
        { price: TOPUP_PRICE, network: getDefaultNetwork() },
        getFacilitator(),
      )
    : async () => {
        return NextResponse.json(
          {
            error: "x402 payments not configured",
            message:
              "Set X402_RECIPIENT_ADDRESS to your wallet address in .env.local",
            docs: "https://x402.org",
          },
          { status: 501 },
        );
      };

export async function GET(request: NextRequest) {
  // Return current balance and pricing info
  const authResult = await requireAuthOrApiKeyWithOrg(request).catch(
    () => null,
  );

  if (!authResult) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const org = await organizationsService.getById(
    authResult.user.organization_id,
  );
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    balance: Number(org.credit_balance),
    x402Enabled: X402_ENABLED,
    x402Configured: isX402Configured(),
    pricing: {
      rate: `${CREDITS_PER_DOLLAR} credits per $1 USDC`,
      minimumPayment: TOPUP_PRICE,
      networks: X402_ENABLED ? ["base-sepolia", "base"] : [],
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-PAYMENT",
    },
  });
}
