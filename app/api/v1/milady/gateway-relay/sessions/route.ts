import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladyGatewayRelayService } from "@/lib/services/milady-gateway-relay";

export const dynamic = "force-dynamic";

const registerSessionSchema = z.object({
  runtimeAgentId: z.string().trim().min(1).max(200),
  agentName: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const body = await request.json().catch(() => ({}));
    const parsed = registerSessionSchema.safeParse(body);

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

    const session = await miladyGatewayRelayService.registerSession({
      organizationId: user.organization_id,
      userId: user.id,
      runtimeAgentId: parsed.data.runtimeAgentId,
      agentName: parsed.data.agentName,
    });

    return NextResponse.json({
      success: true,
      data: {
        session,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
