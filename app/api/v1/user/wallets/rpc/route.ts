import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { executeServerWalletRpc } from "@/lib/services/server-wallets";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

const rpcPayloadSchema = z.object({
    clientAddress: z.string().min(10),
    payload: z.object({
        method: z.string(),
        params: z.array(z.any()),
    }),
    signature: z.string().startsWith("0x"),
    timestamp: z.number().int().positive(),
    nonce: z.string().min(1)
});

async function handlePOST(request: NextRequest) {
    try {
        const body = await request.json();
        const validated = rpcPayloadSchema.parse(body);

        const authenticatedUser = await verifyWalletSignature(request);
        if (!authenticatedUser) {
            return NextResponse.json({ success: false, error: "Wallet authentication required" }, { status: 401 });
        }

        // 2. Verify the request is coming from the actual wallet owner
        if (authenticatedUser.wallet_address.toLowerCase() !== validated.clientAddress.toLowerCase()) {
            return NextResponse.json(
                { success: false, error: "Unauthorized: clientAddress does not belong to your organization" },
                { status: 403 }
            );
        }

        // 3. Execute RPC via Privy Server Wallet
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

        // Auth errors are identified by error.name to avoid fragile string matching on messages
        const isAuthError = error instanceof Error && (
            error.name === "InvalidRpcSignatureError" ||
            error.name === "ServerWalletNotFoundError"
        );
        if (isAuthError) {
            return NextResponse.json(
                { success: false, error: error instanceof Error ? error.message : "Authentication failed" },
                { status: 401 }
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
