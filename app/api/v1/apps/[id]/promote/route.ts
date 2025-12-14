import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appPromotionService, type PromotionConfig } from "@/lib/services/app-promotion";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SocialPlatformSchema = z.enum([
  "twitter",
  "bluesky",
  "discord",
  "telegram",
  "slack",
  "reddit",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "mastodon",
]);

const PromotionConfigSchema = z.object({
  channels: z.array(z.enum(["social", "seo", "advertising"])).min(1),
  social: z.object({
      platforms: z.array(SocialPlatformSchema).min(1),
      customMessage: z.string().max(2000).optional(),
      includeScreenshot: z.boolean().optional(),
    }).optional(),
  seo: z.object({
      generateMeta: z.boolean().optional(),
      generateSchema: z.boolean().optional(),
      submitToIndexNow: z.boolean().optional(),
    }).optional(),
  advertising: z.object({
      platform: z.enum(["meta", "google", "tiktok"]),
      adAccountId: z.string().uuid(),
      budget: z.number().positive().max(10000),
      budgetType: z.enum(["daily", "lifetime"]),
      objective: z.enum(["awareness", "traffic", "engagement", "app_promotion"]),
      duration: z.number().int().positive().max(365).optional(),
      targetLocations: z.array(z.string().length(2)).max(50).optional(),
    }).optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const url = new URL(request.url);
  const isHistory = url.searchParams.get("history") === "true";

  if (isHistory) {
    const history = await appPromotionService.getPromotionHistory(
      user.organization_id!,
      id
    );
    return NextResponse.json(history);
  }

  const suggestions = await appPromotionService.getPromotionSuggestions(
    user.organization_id!,
    id
  );

  return NextResponse.json(suggestions);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const body = await request.json();
  const parsed = PromotionConfigSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const config = parsed.data as PromotionConfig;

  // Validate channel-specific config
  if (config.channels.includes("social") && !config.social) {
    return NextResponse.json(
      { error: "Social config required when social channel is selected" },
      { status: 400 }
    );
  }

  if (config.channels.includes("advertising") && !config.advertising) {
    return NextResponse.json(
      { error: "Advertising config required when advertising channel is selected" },
      { status: 400 }
    );
  }

  logger.info("[Promote API] Starting promotion", {
    appId: id,
    channels: config.channels,
    userId: user.id,
  });

  const result = await appPromotionService.promoteApp(
    user.organization_id!,
    user.id,
    id,
    config
  );

  logger.info("[Promote API] Promotion complete", {
    appId: id,
    creditsUsed: result.totalCreditsUsed,
    errors: result.errors.length,
  });

  return NextResponse.json(result, {
    status: result.errors.length > 0 ? 207 : 200, // Multi-status if partial success
  });
}

