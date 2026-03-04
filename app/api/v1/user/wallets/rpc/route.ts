import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { executeServerWalletRpc } from "@/lib/services/server-wallets";
import { requireAuthOrApiKey } from "@/lib/auth";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

const rpcPayloadSchema = z.object({
    clientAddress: z.string().min(10),
    payload: z.object({
        method: z.string(),
        params: z.array(z.any()),
    }),
    signature: z.string().startsWith("0x"),
});

async function handlePOST(request: NextRequest) {
    try {
        await requireAuthOrApiKey(request);
        // Note: We authenticate this request via the Ed25519/Secp256k1 client signature
        // passed in the body, verifying against the clientAddress registered in the DB.

        // 1. Parse Body
        const body = await request.json();
        const validated = rpcPayloadSchema.parse(body);

        // 2. Execute RPC via Privy Server Wallet
        const result = await executeServerWalletRpc({
            clientAddress: validated.clientAddress,
            payload: validated.payload,
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
                { status: 400 }
            );
        }

        if (error instanceof Error && (error.message.includes("Invalid RPC signature") || error.message.includes("Server wallet not found"))) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 401 } // Unauthorized
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to execute RPC",
            },
            { status: 500 }
        );
    }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
