import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { twitterAppAutomationService } from "@/lib/services/twitter-automation/app-automation";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

const TwitterAutomationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  autoPost: z.boolean().optional(),
  autoReply: z.boolean().optional(),
  autoEngage: z.boolean().optional(),
  discovery: z.boolean().optional(),
  postIntervalMin: z.number().int().min(30).max(1440).optional(),
  postIntervalMax: z.number().int().min(60).max(1440).optional(),
  vibeStyle: z.string().max(100).optional(),
  topics: z.array(z.string().max(50)).max(10).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const status = await twitterAppAutomationService.getAutomationStatus(
    user.organization_id,
    id,
  );

  return NextResponse.json(status);
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const body = await request.json();
  const parsed = TwitterAutomationConfigSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  logger.info("[Twitter Automation API] Enabling automation", {
    appId: id,
    userId: user.id,
    config: parsed.data,
  });

  const app = await twitterAppAutomationService.enableAutomation(
    user.organization_id,
    id,
    parsed.data,
  );

  return NextResponse.json({
    success: true,
    app: {
      id: app.id,
      name: app.name,
      twitterAutomation: app.twitter_automation,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  logger.info("[Twitter Automation API] Disabling automation", {
    appId: id,
    userId: user.id,
  });

  const app = await twitterAppAutomationService.disableAutomation(
    user.organization_id,
    id,
  );

  return NextResponse.json({
    success: true,
    app: {
      id: app.id,
      name: app.name,
      twitterAutomation: app.twitter_automation,
    },
  });
}
