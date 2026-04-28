import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladyGatewayRelayService } from "@/lib/services/milady-gateway-relay";

export const dynamic = "force-dynamic";

const bridgeResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
    })
    .optional(),
});

const respondSchema = z.object({
  requestId: z.string().trim().min(1),
  response: bridgeResponseSchema,
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;
    const session = await miladyGatewayRelayService.getSession(sessionId);

    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    if (session.organizationId !== user.organization_id || session.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const accepted = await miladyGatewayRelayService.respondToRequest({
      sessionId,
      requestId: parsed.data.requestId,
      response: parsed.data.response,
    });

    if (!accepted) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
