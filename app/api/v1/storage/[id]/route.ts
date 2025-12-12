/**
 * Individual Storage Item API
 * 
 * GET /api/v1/storage/[id] - Get file metadata or download (x402 for paid retrieval)
 * DELETE /api/v1/storage/[id] - Delete file (requires ownership proof)
 * 
 * Retrieval is free for metadata, paid for content download.
 * 
 * @see https://x402.org
 */

import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { storageService, calculateRetrievalCost, formatPrice } from "@/lib/services/storage";
import { getFacilitator } from "@/lib/middleware/x402-payment";
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  getDefaultNetwork,
  isX402Configured,
} from "@/lib/config/x402";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET handler - get file metadata or download content
 * 
 * Query params:
 * - download=true: Download file content (x402 payment required)
 * - metadata=true: Get metadata only (free)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const wantDownload = searchParams.has("download");
  const url = searchParams.get("url");
  
  if (!url) {
    return NextResponse.json(
      { error: "URL parameter required" },
      { status: 400 }
    );
  }
  
  // Get metadata (free)
  const metadata = await storageService.getMetadata(url);
  if (!metadata) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 }
    );
  }
  
  // Return metadata only
  if (!wantDownload) {
    return NextResponse.json({
      id,
      url,
      size: metadata.size,
      contentType: metadata.contentType,
      uploadedAt: metadata.uploadedAt.toISOString(),
      retrievalCost: formatPrice(calculateRetrievalCost(metadata.size)),
    });
  }
  
  // Download requires x402 payment for large files
  const FREE_DOWNLOAD_LIMIT = 1024 * 1024; // 1MB free
  
  if (metadata.size <= FREE_DOWNLOAD_LIMIT) {
    // Small files are free - redirect to blob URL
    return NextResponse.redirect(url);
  }
  
  // Check for payment
  if (!request.headers.has("X-PAYMENT")) {
    const cost = calculateRetrievalCost(metadata.size);
    
    const paymentRequirement = {
      "x402-version": "1",
      accepts: [{
        scheme: "exact",
        network: `base-${getDefaultNetwork() === "base" ? "mainnet" : "sepolia"}`,
        maxAmountRequired: formatPrice(cost),
        resource: `/api/v1/storage/${id}`,
        payTo: X402_RECIPIENT_ADDRESS,
        description: `File download: ${(metadata.size / (1024 * 1024)).toFixed(2)} MB`,
        mimeType: metadata.contentType,
      }],
    };
    
    return NextResponse.json(
      {
        error: "Payment required for download",
        message: `Download requires payment of ${formatPrice(cost)} USDC`,
        size: metadata.size,
        paymentRequirement,
        freeLimit: FREE_DOWNLOAD_LIMIT,
      },
      {
        status: 402,
        headers: {
          "X-Payment-Requirement": JSON.stringify(paymentRequirement),
          "WWW-Authenticate": "x402",
          "Access-Control-Expose-Headers": "X-Payment-Requirement",
        },
      }
    );
  }
  
  // Payment provided - verify and redirect
  if (!X402_ENABLED || !isX402Configured()) {
    return NextResponse.json(
      { error: "x402 payments not configured" },
      { status: 501 }
    );
  }
  
  // For paid downloads, redirect to blob URL after payment verification
  // The x402-next wrapper handles verification
  const price = formatPrice(calculateRetrievalCost(metadata.size));
  
  const downloadHandler = async (): Promise<NextResponse> => {
    logger.info("[Storage API] Paid download", {
      id,
      url,
      size: metadata.size,
      price,
    });
    
    return NextResponse.redirect(url);
  };
  
  const handler = withX402(
    downloadHandler,
    X402_RECIPIENT_ADDRESS,
    { price, network: getDefaultNetwork() },
    getFacilitator()
  );
  
  return handler(request);
}

/**
 * DELETE handler - delete a file
 * Supports two authentication methods:
 * 1. Wallet signature (X-Signature + X-Signer-Address headers)
 * 2. Authenticated user session (via cookies/auth headers)
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");
  
  if (!url) {
    return NextResponse.json(
      { error: "URL parameter required" },
      { status: 400 }
    );
  }
  
  // Check if file exists first
  const metadata = await storageService.getMetadata(url);
  if (!metadata) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 }
    );
  }
  
  // Method 1: Check for wallet signature headers
  const signature = request.headers.get("X-Signature");
  const signerAddress = request.headers.get("X-Signer-Address");
  
  if (signature && signerAddress) {
    // Verify wallet ownership
    const pathParts = new URL(url).pathname.split("/");
    const ownerFromPath = pathParts.find(p => p.startsWith("0x"));
    
    if (ownerFromPath && ownerFromPath.toLowerCase() !== signerAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Not authorized to delete this file" },
        { status: 403 }
      );
    }
    
    await storageService.delete(url);
    
    logger.info("[Storage API] File deleted via wallet signature", {
      id,
      url,
      deletedBy: signerAddress,
    });
    
    return NextResponse.json({
      success: true,
      id,
      deleted: true,
    });
  }
  
  // Method 2: Check for authenticated user session
  const { getAuth } = await import("@/lib/auth");
  const user = await getAuth();
  
  if (!user) {
    return NextResponse.json(
      { 
        error: "Authentication required",
        message: "Sign in or provide X-Signature and X-Signer-Address headers",
      },
      { status: 401 }
    );
  }
  
  // Check if user owns this file (URL should contain org ID or user ID)
  const pathParts = new URL(url).pathname.split("/");
  const orgIdInPath = pathParts.find(p => p === user.organization_id);
  const userIdInPath = pathParts.find(p => p === user.id);
  const walletInPath = user.wallet_address ? 
    pathParts.find(p => p.toLowerCase() === user.wallet_address?.toLowerCase()) : null;
  
  if (!orgIdInPath && !userIdInPath && !walletInPath) {
    return NextResponse.json(
      { error: "You can only delete files you uploaded" },
      { status: 403 }
    );
  }
  
  await storageService.delete(url);
  
  logger.info("[Storage API] File deleted via authenticated session", {
    id,
    url,
    deletedBy: user.id,
    organizationId: user.organization_id,
  });
  
  return NextResponse.json({
    success: true,
    id,
    deleted: true,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-PAYMENT, X-Signature, X-Signer-Address",
      "Access-Control-Expose-Headers": "X-Payment-Requirement",
    },
  });
}


