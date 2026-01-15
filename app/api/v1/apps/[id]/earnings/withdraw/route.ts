import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { appEarningsService } from "@/lib/services/app-earnings";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const WithdrawRequestSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
});

/**
 * POST /api/v1/apps/[id]/earnings/withdraw
 * Request a withdrawal of app earnings.
 *
 * Request Body:
 * - `amount`: number - Amount to withdraw (must be >= payout threshold)
 *
 * Validates:
 * - App exists and belongs to the authenticated user's organization
 * - User is the app creator (only creators can withdraw)
 * - Monetization is enabled for the app
 * - Amount meets the minimum payout threshold ($25)
 * - Sufficient withdrawable balance
 *
 * @returns Success status, transaction ID, and new balance
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const app = await appsService.getById(id);

  if (!app) {
    return NextResponse.json(
      { success: false, error: "App not found" },
      { status: 404 },
    );
  }

  if (app.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Access denied" },
      { status: 403 },
    );
  }

  // CRITICAL: Only the app creator can withdraw earnings
  if (app.created_by_user_id !== user.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Only the app creator can withdraw earnings",
      },
      { status: 403 },
    );
  }

  if (!app.monetization_enabled) {
    return NextResponse.json(
      { success: false, error: "Monetization is not enabled for this app" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const validationResult = WithdrawRequestSchema.safeParse(body);

  if (!validationResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request data",
        details: validationResult.error.format(),
      },
      { status: 400 },
    );
  }

  const { amount } = validationResult.data;

  const result = await appEarningsService.requestWithdrawal(id, amount);

  if (!result.success) {
    logger.warn("[Withdrawal] Request failed", {
      appId: id,
      userId: user.id,
      amount,
      error: result.message,
    });

    return NextResponse.json(
      { success: false, error: result.message },
      { status: 400 },
    );
  }

  logger.info("[Withdrawal] Request successful", {
    appId: id,
    userId: user.id,
    amount,
    transactionId: result.transactionId,
  });

  // Get updated summary to return new balance
  const summary = await appEarningsService.getEarningsSummary(id);

  return NextResponse.json({
    success: true,
    message: result.message,
    transactionId: result.transactionId,
    newBalance: summary?.withdrawableBalance ?? 0,
  });
}
