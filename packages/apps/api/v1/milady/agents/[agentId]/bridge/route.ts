import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import type { BridgeRequest } from "@/lib/services/eliza-sandbox";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

const bridgeRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/v1/milady/agents/[agentId]/bridge
 * Forward a JSON-RPC request to the sandbox bridge server.
 *
 * Supported methods:
 *   - message.send  { text: string, roomId?: string }
 *   - status.get    {}
 *   - heartbeat     {}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;
    const body = await request.json();

    const parsed = bridgeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: "Invalid JSON-RPC request",
            details: parsed.error.issues,
          },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const rpcRequest = parsed.data as BridgeRequest;
    const response = await elizaSandboxService.bridge(agentId, user.organization_id, rpcRequest);

    return applyCorsHeaders(NextResponse.json(response), CORS_METHODS);
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
