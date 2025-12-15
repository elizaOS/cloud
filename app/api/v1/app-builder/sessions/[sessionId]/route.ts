import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await params;
  const session = await aiAppBuilderService.getSession(sessionId, user.id);

  return NextResponse.json({ success: true, session });
}

const ExtendSessionSchema = z.object({
  durationMs: z.number().min(60000).max(3600000).default(900000),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await params;

  const body = await request.json();
  const validationResult = ExtendSessionSchema.safeParse(body);

  if (!validationResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request data",
        details: validationResult.error.format(),
      },
      { status: 400 },
    );
  }

  await aiAppBuilderService.extendSession(
    sessionId,
    user.id,
    validationResult.data.durationMs,
  );

  return NextResponse.json({
    success: true,
    message: "Session extended successfully",
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await params;

  await aiAppBuilderService.stopSession(sessionId, user.id);

  return NextResponse.json({
    success: true,
    message: "Session stopped successfully",
  });
}
