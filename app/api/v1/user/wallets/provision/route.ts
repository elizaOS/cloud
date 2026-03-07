import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { provisionServerWallet } from "@/lib/services/server-wallets";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { isAddress } from "viem";

const SOLANA_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const provisionWalletSchema = z
  .object({
    chainType: z.enum(["evm", "solana"]),
    clientAddress: z.string().min(10),
    characterId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.chainType === "evm" && !isAddress(data.clientAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid EVM address",
        path: ["clientAddress"],
      });
    }
    if (
      data.chainType === "solana" &&
      !SOLANA_BASE58.test(data.clientAddress)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid Solana address (base58, 32–44 chars)",
        path: ["clientAddress"],
      });
    }
  });

async function handlePOST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const body = await request.json();
    const validated = provisionWalletSchema.parse(body);

    if (!user.organization?.id) {
      return NextResponse.json(
        { success: false, error: "User does not belong to an organization" },
        { status: 403 },
      );
    }

    const walletRecord = await provisionServerWallet({
      organizationId: user.organization.id,
      userId: user.id,
      characterId: validated.characterId || null,
      clientAddress: validated.clientAddress,
      chainType: validated.chainType,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: walletRecord.id,
        address: walletRecord.address,
        chainType: walletRecord.chain_type,
        clientAddress: walletRecord.client_address,
      },
    });
  } catch (error) {
    logger.error("Error provisioning server wallet:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Failed to provision wallet";
    const isAuthError =
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication required") ||
      errorMessage.includes("Invalid or expired token") ||
      errorMessage.includes("Invalid or expired API key") ||
      errorMessage.includes("Invalid wallet signature") ||
      errorMessage.includes("Wallet authentication failed");

    if (isAuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: errorMessage.includes("Forbidden") ? 403 : 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
