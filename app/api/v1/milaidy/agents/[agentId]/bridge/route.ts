import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import type { BridgeRequest } from "@/lib/services/milaidy-sandbox";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;
  const body = await request.json();

  const parsed = bridgeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON-RPC request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const rpcRequest = parsed.data as BridgeRequest;
  const response = await miladySandboxService.bridge(
    agentId,
    user.organization_id,
    rpcRequest,
  );

  return NextResponse.json(response);
}
