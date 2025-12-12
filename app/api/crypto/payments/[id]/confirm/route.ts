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

const confirmSchema = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
});

async function handleConfirmPayment(req: NextRequest, context: RouteContext) {
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
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.organization_id !== user.organization_id) {
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
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { transactionHash } = validation.data;

    const result = await cryptoPaymentsService.verifyAndConfirmByTxHash(
      id,
      transactionHash,
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        status: "confirmed",
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: result.message,
        status: payment.status,
      },
      { status: 400 },
    );
  } catch (error) {
    logger.error("[Crypto Payments API] Confirm payment error:", error);
    return NextResponse.json(
      { error: "Failed to confirm payment" },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleConfirmPayment, RateLimitPresets.STRICT);
