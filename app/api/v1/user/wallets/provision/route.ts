import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuth } from "@/lib/auth";
import { provisionServerWallet } from "@/lib/services/server-wallets";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { isAddress } from "ethers";

const provisionWalletSchema = z.object({
    chainType: z.enum(["evm", "solana"]),
    clientAddress: z.string().min(10).refine(
        (addr, ctx) => {
            if (ctx.parent.chainType === "evm") {
                return isAddress(addr);
            }
            return true;
        },
        { message: "Invalid EVM address" }
    ),
    characterId: z.string().uuid().optional().nullable(),
});

async function handlePOST(request: NextRequest) {
    try {
        // 1. Authenticate Request
        const user = await requireAuth();

        // 2. Parse Body
        const body = await request.json();
        const validated = provisionWalletSchema.parse(body);

        if (!user.organization?.id) {
            return NextResponse.json(
                { success: false, error: "User does not belong to an organization" },
                { status: 403 }
            );
        }

        // 3. Provision Server Wallet via Privy
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
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to provision wallet",
            },
            {
                status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500,
            }
        );
    }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
