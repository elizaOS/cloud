/**
 * Individual Storage Deal API
 *
 * GET /api/v1/storage/deals/[dealId] - Get deal details
 * DELETE /api/v1/storage/deals/[dealId] - Terminate deal
 */

import { NextRequest, NextResponse } from "next/server";
import { storageProviderService } from "@/lib/services/storage-provider";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

/**
 * GET - Get deal details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { dealId } = await params;

  const deal = storageProviderService.getDeal(dealId);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Check health if requested
  const searchParams = request.nextUrl.searchParams;
  if (searchParams.has("health")) {
    const health = await storageProviderService.checkDealHealth(dealId);
    return NextResponse.json({
      deal: {
        ...deal,
        price: deal.price.toString(),
      },
      health,
    });
  }

  return NextResponse.json({
    deal: {
      ...deal,
      price: deal.price.toString(),
    },
  });
}

/**
 * DELETE - Terminate deal
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { dealId } = await params;

  // Get user from signature header
  const signerAddress = request.headers.get("X-Signer-Address");
  if (!signerAddress) {
    return NextResponse.json(
      {
        error: "Authorization required",
        message: "Provide X-Signer-Address header",
      },
      { status: 401 },
    );
  }

  logger.info("[Storage Deals] Terminating deal", {
    dealId,
    user: signerAddress,
  });

  const { refundWei } = await storageProviderService.terminateDeal(
    dealId,
    signerAddress,
  );

  return NextResponse.json({
    success: true,
    dealId,
    terminated: true,
    refundWei: refundWei.toString(),
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Signer-Address",
    },
  });
}
