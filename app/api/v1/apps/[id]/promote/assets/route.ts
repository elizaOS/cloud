import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { appPromotionAssetsService, type AdSize, AD_SIZES } from "@/lib/services/app-promotion-assets";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const GenerateAssetsSchema = z.object({
  sizes: z.array(z.enum(Object.keys(AD_SIZES) as [AdSize, ...AdSize[]])).optional(),
  includeCopy: z.boolean().optional(),
  includeAdBanners: z.boolean().optional(),
  targetAudience: z.string().max(500).optional(),
});

const ASSET_GENERATION_COST = 0.05;
const COPY_GENERATION_COST = 0.02;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const app = await appsService.getById(id);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = GenerateAssetsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Calculate cost
  const imageCount = parsed.data.includeCopy !== false ? 3 : 0; // Default social cards
  const bannerCount = parsed.data.includeAdBanners ? 3 : 0;
  const totalImageCost = (imageCount + bannerCount) * ASSET_GENERATION_COST;
  const copyCost = parsed.data.includeCopy !== false ? COPY_GENERATION_COST : 0;
  const totalCost = totalImageCost + copyCost;

  // Deduct credits
  const deduction = await creditsService.deductCredits({
    organizationId: user.organization_id!,
    amount: totalCost,
    description: `Generate promotional assets for ${app.name}`,
    metadata: { appId: id, imageCount: imageCount + bannerCount },
  });

  if (!deduction.success) {
    return NextResponse.json(
      { error: "Insufficient credits", required: totalCost },
      { status: 402 }
    );
  }

  logger.info("[Promote Assets API] Generating assets", {
    appId: id,
    imageCount: imageCount + bannerCount,
    includeCopy: parsed.data.includeCopy !== false,
  });

  // Generate assets
  const result = await appPromotionAssetsService.generateAssetBundle(app, {
    includeSocialCards: true,
    includeAdBanners: parsed.data.includeAdBanners,
    includeCopy: parsed.data.includeCopy,
    targetAudience: parsed.data.targetAudience,
  });

  // Refund for failed generations
  const successfulImages = result.assets.length;
  const failedImages = (imageCount + bannerCount) - successfulImages;
  if (failedImages > 0) {
    await creditsService.refundCredits({
      organizationId: user.organization_id!,
      amount: failedImages * ASSET_GENERATION_COST,
      description: `Refund for failed asset generations`,
      metadata: { appId: id, failedCount: failedImages },
    });
  }

  return NextResponse.json({
    assets: result.assets.map((asset) => ({
      type: asset.type,
      size: asset.size,
      url: asset.url,
      format: asset.format,
      generatedAt: asset.generatedAt.toISOString(),
    })),
    copy: result.copy,
    errors: result.errors,
    creditsUsed: totalCost - (failedImages * ASSET_GENERATION_COST),
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const app = await appsService.getById(id);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") as "meta" | "google" | "twitter" | "linkedin" | null;

  const recommendedSizes = platform
    ? appPromotionAssetsService.getRecommendedSizes(platform)
    : Object.keys(AD_SIZES);

  return NextResponse.json({
    recommendedSizes,
    availableSizes: Object.entries(AD_SIZES).map(([name, dimensions]) => ({
      name,
      ...dimensions,
    })),
    estimatedCost: {
      perImage: ASSET_GENERATION_COST,
      copyGeneration: COPY_GENERATION_COST,
      fullBundle: ASSET_GENERATION_COST * 6 + COPY_GENERATION_COST, // 6 images + copy
    },
  });
}

