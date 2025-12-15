/**
 * IPFS Storage API
 *
 * Permissionless IPFS pinning with x402 micropayments.
 * Files are stored on IPFS for decentralized, content-addressed storage.
 *
 * POST /api/v1/storage/ipfs - Pin file to IPFS (x402 payment required)
 * GET /api/v1/storage/ipfs - List pins
 *
 * @see https://x402.org
 */

import { NextRequest, NextResponse } from "next/server";
import { ipfsService, IPFSPaymentRequiredError } from "@/lib/services/ipfs";
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  getDefaultNetwork,
  isX402Configured,
} from "@/lib/config/x402";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

/**
 * POST - Upload and pin file to IPFS
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check IPFS service availability
  const isAvailable = await ipfsService.health().catch(() => null);
  if (!isAvailable) {
    return NextResponse.json(
      {
        error: "IPFS service unavailable",
        message: "IPFS pinning API is not running",
      },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Get payment header if present
  const paymentHeader = request.headers.get("X-PAYMENT") || undefined;

  logger.info("[IPFS API] Processing upload", {
    filename: file.name,
    size: file.size,
    hasPayment: !!paymentHeader,
  });

  const result = await ipfsService
    .upload(file, {
      filename: file.name,
      paymentHeader,
    })
    .catch((error) => {
      if (error instanceof IPFSPaymentRequiredError) {
        return { paymentRequired: true, ...error.paymentRequirement };
      }
      throw error;
    });

  // Handle payment required response
  if ("paymentRequired" in result) {
    return NextResponse.json(
      {
        error: "Payment required",
        message: `IPFS pinning requires x402 payment`,
        ...result,
      },
      {
        status: 402,
        headers: {
          "X-Payment-Requirement": JSON.stringify(result),
          "WWW-Authenticate": "x402",
          "Access-Control-Expose-Headers": "X-Payment-Requirement",
        },
      },
    );
  }

  logger.info("[IPFS API] Upload complete", {
    cid: result.cid,
    size: result.size,
  });

  return NextResponse.json({
    success: true,
    id: result.id,
    cid: result.cid,
    name: result.name,
    status: result.status,
    size: result.size,
    gatewayUrl: ipfsService.getGatewayUrl(result.cid),
  });
}

/**
 * GET - List pins or get pin status
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const cid = searchParams.get("cid");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // Get single pin by ID
  if (id) {
    const pin = await ipfsService.getPin(id);
    return NextResponse.json({
      ...pin,
      gatewayUrl: ipfsService.getGatewayUrl(pin.cid),
    });
  }

  // List pins
  const result = await ipfsService.listPins({
    cid: cid || undefined,
    status: status || undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    count: result.count,
    pins: result.results.map((pin) => ({
      ...pin,
      gatewayUrl: ipfsService.getGatewayUrl(pin.cid),
    })),
  });
}

/**
 * DELETE - Unpin content
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Pin ID required" }, { status: 400 });
  }

  await ipfsService.unpin(id);

  return NextResponse.json({
    success: true,
    id,
    unpinned: true,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-PAYMENT",
      "Access-Control-Expose-Headers": "X-Payment-Requirement",
    },
  });
}
