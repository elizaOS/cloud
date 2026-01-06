import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { twitterAppAutomationService } from "@/lib/services/twitter-automation/app-automation";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PostTweetSchema = z.object({
  text: z.string().max(280).optional(),
  type: z.enum(["promotional", "engagement", "educational", "announcement"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const body = await request.json();
  const parsed = PostTweetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  logger.info("[Twitter Automation API] Posting tweet for app", {
    appId: id,
    userId: user.id,
    hasCustomText: !!parsed.data.text,
  });

  const result = await twitterAppAutomationService.postAppTweet(
    user.organization_id,
    id,
    parsed.data.text,
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to post tweet" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    tweetId: result.tweetId,
    tweetUrl: result.tweetUrl,
  });
}
