import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { createXDmGroup } from "@/lib/services/x";
import { xRouteErrorResponse } from "../../error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  confirmSend: z.literal(true),
  connectionRole: z.enum(["owner", "agent"]).optional(),
  participantIds: z.array(z.string().trim().regex(/^\d+$/)).min(2),
  text: z.string().trim().min(1).max(10_000),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid X group DM request",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const result = await createXDmGroup({
      organizationId: user.organization_id,
      connectionRole: parsed.data.connectionRole,
      participantIds: parsed.data.participantIds,
      text: parsed.data.text,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return xRouteErrorResponse(error);
  }
}
