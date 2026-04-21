import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { sendXDm, XServiceError } from "@/lib/services/x";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  confirmSend: z.literal(true),
  participantId: z.string().trim().regex(/^\d+$/),
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
          error: "Invalid X DM send request",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const result = await sendXDm({
      organizationId: user.organization_id,
      participantId: parsed.data.participantId,
      text: parsed.data.text,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof XServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
