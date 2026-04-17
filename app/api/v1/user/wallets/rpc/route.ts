import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { executeServerWalletRpc } from "@/lib/services/server-wallets";
import { logger } from "@/lib/utils/logger";

const rpcPayloadSchema = z.object({
  clientAddress: z.string().min(10),
  payload: z.object({
    method: z.string(),
    params: z.array(z.any()),
  }),
  signature: z.string().startsWith("0x"),
  timestamp: z.number().int().positive(),
  nonce: z.string().min(1),
});

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = rpcPayloadSchema.parse(body);

    const authenticatedUser = await verifyWalletSignature(request);
    if (!authenticatedUser) {
      return NextResponse.json(
        { success: false, error: "Wallet authentication required" },
        { status: 401 },
      );
    }

    const authenticatedWallet = authenticatedUser.wallet_address?.toLowerCase();
    if (
      !authenticatedWallet ||
      authenticatedWallet !== validated.clientAddress.toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized: clientAddress does not belong to the authenticated wallet",
        },
        { status: 403 },
      );
    }

    const result = await executeServerWalletRpc({
      clientAddress: validated.clientAddress,
      payload: {
        ...validated.payload,
        timestamp: validated.timestamp,
        nonce: validated.nonce,
      },
      signature: validated.signature as `0x${string}`,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error executing server wallet RPC:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }

    if (
      error instanceof Error &&
      (error.message.includes("Invalid wallet signature") ||
        error.message.includes("Wallet authentication failed") ||
        error.message.includes("Signature has already been used") ||
        error.message.includes("Signature timestamp expired") ||
        error.message.includes("Service temporarily unavailable"))
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    if (error instanceof Error && error.name === "RpcRequestExpiredError") {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.name === "RpcReplayError") {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.name === "InvalidRpcSignatureError") {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    if (error instanceof Error && error.name === "ServerWalletNotFoundError") {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute RPC",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
