import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { advertisingService } from "@/lib/services/advertising";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/advertising/campaigns/[id]/analytics
 * Gets campaign analytics/metrics.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const dateRange =
    startDate && endDate
      ? { start: new Date(startDate), end: new Date(endDate) }
      : undefined;

  const metrics = await advertisingService.getCampaignMetrics(
    id,
    user.organization_id!,
    dateRange,
  );

  return NextResponse.json({
    campaignId: id,
    metrics: {
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpm: metrics.cpm,
      roas: metrics.roas,
    },
    dateRange: dateRange
      ? {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        }
      : null,
  });
}
