/**
 * Permissionless Storage API
 * 
 * Fully permissionless storage with x402 micropayments.
 * No authentication required - just pay and store.
 * 
 * POST /api/v1/storage - Upload file (x402 payment required)
 * GET /api/v1/storage - List files (optional auth for private files)
 * 
 * Payment flow:
 * 1. Client sends request without X-PAYMENT header
 * 2. Server returns 402 with payment requirements
 * 3. Client signs payment and resends with X-PAYMENT header
 * 4. Server verifies payment and processes upload
 * 
 * @see https://x402.org
 */

import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { storageService, calculateUploadCost, formatPrice } from "@/lib/services/storage";
import { getFacilitator } from "@/lib/middleware/x402-payment";
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  getDefaultNetwork,
  isX402Configured,
} from "@/lib/config/x402";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

// Dynamic pricing wrapper for x402
async function getStoragePrice(request: NextRequest): Promise<string> {
  const contentLength = parseInt(request.headers.get("content-length") || "0");
  if (contentLength === 0) {
    // Return minimum fee for GET/info requests
    return "$0.01";
  }
  const cost = calculateUploadCost(contentLength);
  return formatPrice(cost);
}

/**
 * POST handler for uploading files
 * Wrapped with x402 for permissionless payment
 */
async function uploadHandler(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  
  if (!file) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }
  
  // Get payer address from x402 payment header
  let payerAddress = "anonymous";
  const paymentHeader = request.headers.get("X-PAYMENT");
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      payerAddress = decoded.payload?.authorization?.from || "anonymous";
    } catch {
      // Continue with anonymous
    }
  }
  
  // Read file content
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  logger.info("[Storage API] Processing upload", {
    filename: file.name,
    size: buffer.length,
    contentType: file.type,
    payerAddress,
  });
  
  // Upload to storage
  const result = await storageService.upload(buffer, {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    ownerAddress: payerAddress,
  });
  
  logger.info("[Storage API] Upload complete", {
    id: result.id,
    url: result.url,
    size: result.size,
    cost: result.cost,
  });
  
  return NextResponse.json({
    success: true,
    id: result.id,
    url: result.url,
    pathname: result.pathname,
    contentType: result.contentType,
    size: result.size,
    costPaid: formatPrice(result.cost),
    ownerAddress: payerAddress,
  });
}

/**
 * GET handler for listing files and getting storage info
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const ownerAddress = searchParams.get("owner");
  const prefix = searchParams.get("prefix");
  const limit = parseInt(searchParams.get("limit") || "100");
  const cursor = searchParams.get("cursor") || undefined;
  
  // Get storage stats if requested
  if (searchParams.has("stats")) {
    const stats = await storageService.getStats(ownerAddress || undefined);
    const pricing = storageService.getPricing();
    
    return NextResponse.json({
      stats,
      pricing,
      x402Enabled: X402_ENABLED,
      x402Configured: isX402Configured(),
      network: getDefaultNetwork(),
    });
  }
  
  // List files
  const result = await storageService.list({
    prefix: prefix || undefined,
    ownerAddress: ownerAddress || undefined,
    limit,
    cursor,
  });
  
  return NextResponse.json({
    items: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
    count: result.items.length,
  });
}

/**
 * Handle payment requirement response for uploads
 */
async function handlePaymentRequired(request: NextRequest): Promise<NextResponse> {
  const contentLength = parseInt(request.headers.get("content-length") || "0");
  const cost = calculateUploadCost(contentLength);
  
  const paymentRequirement = {
    "x402-version": "1",
    accepts: [{
      scheme: "exact",
      network: `base-${getDefaultNetwork() === "base" ? "mainnet" : "sepolia"}`,
      maxAmountRequired: formatPrice(cost),
      resource: "/api/v1/storage",
      payTo: X402_RECIPIENT_ADDRESS,
      description: `File upload: ${(contentLength / (1024 * 1024)).toFixed(2)} MB`,
      mimeType: "application/json",
    }],
  };
  
  return NextResponse.json(
    {
      error: "Payment required",
      message: `Upload requires payment of ${formatPrice(cost)} USDC`,
      paymentRequirement,
      pricing: storageService.getPricing(),
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

// Wrap POST handler with x402 if enabled
export const POST = X402_ENABLED && isX402Configured()
  ? async (request: NextRequest) => {
      // Check if payment header present
      if (!request.headers.has("X-PAYMENT")) {
        return handlePaymentRequired(request);
      }
      
      // Process with x402 wrapper
      const price = await getStoragePrice(request);
      const handler = withX402(
        uploadHandler,
        X402_RECIPIENT_ADDRESS,
        { price, network: getDefaultNetwork() },
        getFacilitator()
      );
      
      return handler(request);
    }
  : async () => {
      return NextResponse.json(
        {
          error: "x402 payments not configured",
          message: "Storage requires x402 payment configuration",
          docs: "https://x402.org",
        },
        { status: 501 }
      );
    };

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-PAYMENT",
      "Access-Control-Expose-Headers": "X-Payment-Requirement",
    },
  });
}


