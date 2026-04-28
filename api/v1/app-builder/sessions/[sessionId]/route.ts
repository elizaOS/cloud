import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nextJsonFromCaughtError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;
    const session = await aiAppBuilder.getSession(sessionId, user.id);

    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, session });
  } catch (error) {
    return nextJsonFromCaughtError(error);
  }
}

const ExtendSessionSchema = z.object({
  durationMs: z.number().min(60000).max(3600000).default(900000),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
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

    const result = await aiAppBuilder.extendSession(
      sessionId,
      user.id,
      validationResult.data.durationMs,
    );

    return NextResponse.json({
      success: true,
      message: "Session extended successfully",
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    return nextJsonFromCaughtError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    await aiAppBuilder.stopSession(sessionId, user.id);

    return NextResponse.json({
      success: true,
      message: "Session stopped successfully",
    });
  } catch (error) {
    return nextJsonFromCaughtError(error);
  }
}
