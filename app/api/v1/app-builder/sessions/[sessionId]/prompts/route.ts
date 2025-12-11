import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const SendPromptSchema = z.object({
  prompt: z.string().min(1).max(10000),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await params;

  const body = await request.json();
  const validationResult = SendPromptSchema.safeParse(body);

  if (!validationResult.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request data", details: validationResult.error.format() },
      { status: 400 }
    );
  }

  const result = await aiAppBuilderService.sendPrompt(sessionId, validationResult.data.prompt, user.id);

  return NextResponse.json({
    success: result.success,
    output: result.output,
    filesAffected: result.filesAffected,
    error: result.error,
  });
}
