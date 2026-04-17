import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";
import { getErrorStatusCode, nextJsonFromCaughtError } from "@/lib/api/errors";
import { requireAuthOrApiKey } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { provisionServerWallet } from "@/lib/services/server-wallets";
import { logger } from "@/lib/utils/logger";
import { dbWrite } from "@/packages/db/helpers";
import { agentServerWallets } from "@/packages/db/schemas/agent-server-wallets";

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
  let user: Awaited<ReturnType<typeof requireAuthOrApiKey>>["user"] | undefined;
  let validated: z.infer<typeof provisionWalletSchema> | undefined;

  try {
    ({ user } = await requireAuthOrApiKey(request));
    const body = await request.json();
    validated = provisionWalletSchema.parse(body);

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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }

    // Make provisioning idempotent: if wallet already exists, return it
    if (
      error instanceof Error &&
      error.name === "WalletAlreadyExistsError" &&
      user?.organization?.id &&
      validated
    ) {
      try {
        const [existing] = await dbWrite
          .select({
            id: agentServerWallets.id,
            address: agentServerWallets.address,
            chain_type: agentServerWallets.chain_type,
            client_address: agentServerWallets.client_address,
          })
          .from(agentServerWallets)
          .where(
            and(
              eq(agentServerWallets.organization_id, user.organization.id),
              eq(agentServerWallets.client_address, validated.clientAddress),
              eq(agentServerWallets.chain_type, validated.chainType),
            ),
          )
          .limit(1);

        if (existing) {
          return NextResponse.json({
            success: true,
            data: {
              id: existing.id,
              address: existing.address,
              chainType: existing.chain_type,
              clientAddress: existing.client_address,
            },
          });
        }
      } catch (lookupError) {
        logger.error("Error looking up existing wallet:", lookupError);
      }
    }

    if (getErrorStatusCode(error) >= 500) {
      logger.error("Error provisioning server wallet:", error);
    }
    return nextJsonFromCaughtError(error);
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
