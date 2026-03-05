import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { executeServerWalletRpc } from "@/lib/services/server-wallets";
import { requireAuthOrApiKey } from "@/lib/auth";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { organizationsService } from "@/lib/services/organizations";

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
        const authResult = await requireAuthOrApiKey(request);

        // 1. Parse Body
        const body = await request.json();
        const validated = rpcPayloadSchema.parse(body);

        // 2. Verify `clientAddress` belongs to the authenticated organization
        const organizationId = authResult.user.organization_id;
        const organization = await organizationsService.getByWalletAddress(validated.clientAddress);

        if (organizationId !== organization.id) {
            return NextResponse.json(
                { success: false, error: "Unauthorized: clientAddress does not belong to user organization" },
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

