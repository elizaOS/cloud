import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { usageQuotasService } from "@/lib/services";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handlePOST(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const body = await req.json();

    const { quota_type, model_name, credits_limit } = body;

    if (!quota_type || !credits_limit) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: quota_type, credits_limit",
        },
        { status: 400 },
      );
    }

    if (quota_type !== "global" && quota_type !== "model_specific") {
      return NextResponse.json(
        {
          success: false,
          error: "quota_type must be 'global' or 'model_specific'",
        },
        { status: 400 },
      );
    }

    if (quota_type === "model_specific" && !model_name) {
      return NextResponse.json(
        {
          success: false,
          error: "model_name is required for model_specific quotas",
        },
        { status: 400 },
      );
    }

    const quota = await usageQuotasService.createQuota({
      organization_id: user.organization_id,
      quota_type,
      model_name: quota_type === "model_specific" ? model_name : undefined,
      credits_limit: Number(credits_limit),
    });

    return NextResponse.json(
      {
        success: true,
        data: quota,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating quota:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create quota",
      },
      { status: 500 },
    );
  }
}

async function handleGET() {
  try {
    const user = await requireAuthWithOrg();

    const quotas = await usageQuotasService.getActiveQuotasByOrganization(
      user.organization_id,
    );

    return NextResponse.json({
      success: true,
      data: quotas,
    });
  } catch (error) {
    console.error("Error fetching quotas:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch quotas",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
