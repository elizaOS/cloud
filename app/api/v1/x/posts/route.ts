import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { createXPost, XServiceError } from "@/lib/services/x";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z
  .object({
    confirmPost: z.literal(true).optional(),
    confirmSend: z.literal(true).optional(),
    text: z.string().trim().min(1).max(280),
    replyToTweetId: z.string().regex(/^\d+$/).optional(),
    quoteTweetId: z.string().regex(/^\d+$/).optional(),
  })
  .refine((value) => value.confirmPost === true || value.confirmSend === true, {
    message: "X posting requires explicit confirmation",
    path: ["confirmPost"],
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
          error: "Invalid X post request",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const result = await createXPost({
      organizationId: user.organization_id,
      text: parsed.data.text,
      replyToTweetId: parsed.data.replyToTweetId,
      quoteTweetId: parsed.data.quoteTweetId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof XServiceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
}
