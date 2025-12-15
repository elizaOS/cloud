import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { cryptoPaymentsRepository } from "@/db/repositories/crypto-payments";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ethereumTxHashRegex = /^0x[a-fA-F0-9]{64}$/;
const tronTxHashRegex = /^[A-Za-z0-9]{64}$/;
const solanaTxHashRegex = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;

function validateTransactionHash(hash: string, network: string): boolean {
  const normalizedNetwork = network.toUpperCase();
  
  if (normalizedNetwork.includes("ERC20") || 
      normalizedNetwork.includes("BEP20") || 
      normalizedNetwork.includes("POLYGON") ||
      normalizedNetwork.includes("BASE") ||
      normalizedNetwork.includes("ARB") ||
      normalizedNetwork.includes("OP")) {
    return ethereumTxHashRegex.test(hash);
  }
  
  if (normalizedNetwork.includes("TRC20") || normalizedNetwork.includes("TRON")) {
    return tronTxHashRegex.test(hash);
  }
  
  if (normalizedNetwork.includes("SOL") || normalizedNetwork.includes("SOLANA")) {
    return solanaTxHashRegex.test(hash);
  }
  
  return ethereumTxHashRegex.test(hash);
}

const confirmSchema = z.object({
  transactionHash: z.string().min(1, "Transaction hash is required"),
});

async function handleConfirmPayment(req: NextRequest, context: RouteContext) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
             req.headers.get("x-real-ip") || 
             "unknown";

  try {
    const user = await requireAuthWithOrg();
    const { id } = await context.params;

    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const payment = await cryptoPaymentsRepository.findById(id);

    if (!payment) {
      logger.warn("[Crypto Payments API] Payment not found", { paymentId: id, ip, userId: user.id });
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.organization_id !== user.organization_id) {
      logger.warn("[Crypto Payments API] Unauthorized confirmation attempt", {
        paymentId: id,
        ip,
        userId: user.id,
        paymentOrg: payment.organization_id,
        userOrg: user.organization_id,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (payment.status === "confirmed") {
      return NextResponse.json({
        success: true,
        message: "Payment already confirmed",
        status: payment.status,
      });
    }

    if (payment.status === "expired") {
      return NextResponse.json(
        { error: "Payment has expired" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const validation = confirmSchema.safeParse(body);

    if (!validation.success) {
      logger.warn("[Crypto Payments API] Invalid confirmation request", {
        paymentId: id,
        ip,
        userId: user.id,
        errors: validation.error.flatten().fieldErrors,
      });
      return NextResponse.json(
        {
          error: "Invalid transaction hash format",
        },
        { status: 400 },
      );
    }

    const { transactionHash } = validation.data;

    if (!validateTransactionHash(transactionHash, payment.network)) {
      logger.warn("[Crypto Payments API] Invalid transaction hash format for network", {
        paymentId: id,
        ip,
        userId: user.id,
        network: payment.network,
        txHashLength: transactionHash.length,
      });
      return NextResponse.json(
        {
          error: `Invalid transaction hash format for ${payment.network} network`,
        },
        { status: 400 },
      );
    }

    logger.info("[Crypto Payments API] Processing manual confirmation", {
      paymentId: id,
      network: payment.network,
      userId: user.id,
      organizationId: user.organization_id,
      ip,
    });

    const result = await cryptoPaymentsService.verifyAndConfirmByTxHash(
      id,
      transactionHash,
    );

    if (result.success) {
      logger.info("[Crypto Payments API] Manual confirmation successful", {
        paymentId: id,
        userId: user.id,
        ip,
      });
      return NextResponse.json({
        success: true,
        message: "Payment confirmed successfully",
        status: "confirmed",
      });
    }

    logger.warn("[Crypto Payments API] Manual confirmation failed", {
      paymentId: id,
      userId: user.id,
      ip,
      reason: result.message,
    });

    return NextResponse.json(
      {
        success: false,
        message: "Unable to confirm payment",
        status: payment.status,
      },
      { status: 400 },
    );
  } catch (error) {
    logger.error("[Crypto Payments API] Confirm payment error", {
      paymentId: context.params.id,
      ip,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to process confirmation" },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleConfirmPayment, RateLimitPresets.STRICT);
