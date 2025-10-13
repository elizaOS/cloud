import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey, requireRole } from "@/lib/auth";
import { organizationsService } from "@/lib/services";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);

    const org = await organizationsService.getById(user.organization_id);

    const settings = (org?.settings as Record<string, unknown>) || {};
    const analyticsConfig = (settings.analytics as Record<string, unknown>) || {
      markupPercentage: 20,
      autoRefreshInterval: 30,
      defaultTimeRange: "daily",
      exportFormats: ["csv", "json"],
    };

    return NextResponse.json({
      success: true,
      data: {
        markupPercentage:
          (analyticsConfig.markupPercentage as number) || 20,
        autoRefreshInterval:
          (analyticsConfig.autoRefreshInterval as number) || 30,
        defaultTimeRange:
          (analyticsConfig.defaultTimeRange as string) || "daily",
        exportFormats:
          (analyticsConfig.exportFormats as string[]) || ["csv", "json"],
      },
    });
  } catch (error) {
    console.error("[Analytics Config GET] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch analytics config",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole(["owner", "admin"]);

    const body = await req.json();
    const { markupPercentage, autoRefreshInterval, defaultTimeRange, exportFormats } =
      body;

    if (
      markupPercentage !== undefined &&
      (typeof markupPercentage !== "number" ||
        markupPercentage < 0 ||
        markupPercentage > 100)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "markupPercentage must be a number between 0 and 100",
        },
        { status: 400 }
      );
    }

    if (
      autoRefreshInterval !== undefined &&
      (typeof autoRefreshInterval !== "number" || autoRefreshInterval < 10)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "autoRefreshInterval must be a number >= 10 seconds",
        },
        { status: 400 }
      );
    }

    if (
      defaultTimeRange !== undefined &&
      !["daily", "weekly", "monthly"].includes(defaultTimeRange)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "defaultTimeRange must be 'daily', 'weekly', or 'monthly'",
        },
        { status: 400 }
      );
    }

    const org = await organizationsService.getById(user.organization_id);

    const currentSettings = (org?.settings as Record<string, unknown>) || {};
    const currentAnalyticsConfig =
      (currentSettings.analytics as Record<string, unknown>) || {};

    const updatedAnalyticsConfig = {
      ...currentAnalyticsConfig,
      ...(markupPercentage !== undefined && { markupPercentage }),
      ...(autoRefreshInterval !== undefined && { autoRefreshInterval }),
      ...(defaultTimeRange !== undefined && { defaultTimeRange }),
      ...(exportFormats !== undefined && { exportFormats }),
      updatedAt: new Date().toISOString(),
    };

    await organizationsService.update(user.organization_id, {
      settings: {
        ...currentSettings,
        analytics: updatedAnalyticsConfig,
      },
      updated_at: new Date(),
    });

    return NextResponse.json({
      success: true,
      data: updatedAnalyticsConfig,
    });
  } catch (error) {
    console.error("[Analytics Config PUT] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update analytics config",
      },
      { status: 500 }
    );
  }
}
