import { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import type { BridgeRequest } from "@/lib/services/milady-sandbox";
import { z } from "zod";

export const dynamic = "force-dynamic";
// Streaming responses can be long-running
export const maxDuration = 120;

const streamRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.literal("message.send"),
  params: z.object({
    text: z.string().min(1),
    roomId: z.string().optional(),
  }),
});

/**
 * POST /api/v1/milady/agents/[agentId]/stream
 * Forward a message to the sandbox and stream the response as SSE events.
 *
 * Events:
 *   connected  - initial connection established
 *   chunk      - a piece of the agent's response text
 *   done       - response is complete
 *   error      - an error occurred
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;
  const body = await request.json();

  const parsed = streamRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const rpcRequest = parsed.data as BridgeRequest;

  // Get the raw SSE stream from the sandbox
  const upstreamResponse = await miladySandboxService.bridgeStream(
    agentId,
    user.organization_id,
    rpcRequest,
  );

  if (!upstreamResponse || !upstreamResponse.body) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send error as SSE then close
    (async () => {
      await writer.write(
        encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "Sandbox is not running or unreachable" })}\n\n`),
      );
      await writer.close();
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Proxy the upstream SSE stream directly to the client.
  // The sandbox bridge/stream endpoint already emits proper SSE events
  // (connected, chunk, done), so we just pipe the body through.
  return new Response(upstreamResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
