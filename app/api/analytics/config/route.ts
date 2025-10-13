import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey, requireRole } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { db, schema, eq } from "@/lib/db";

export const maxDuration = 60;

const VALID_EXPORT_FORMATS = ["csv", "json", "excel", "xlsx", "pdf"] as const;

async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, user.organization_id),
      columns: {
        settings: true,
      },
    });

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
    logger.error("[Analytics Config GET] Error:", error);
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

async function handlePUT(req: NextRequest) {
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

    if (exportFormats !== undefined) {
      if (!Array.isArray(exportFormats)) {
        return NextResponse.json(
          {
            success: false,
            error: "exportFormats must be an array",
          },
          { status: 400 }
        );
      }

      const invalidFormats = exportFormats.filter(
        (format) => !VALID_EXPORT_FORMATS.includes(format as typeof VALID_EXPORT_FORMATS[number])
      );

      if (invalidFormats.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid export formats: ${invalidFormats.join(", ")}. Valid formats: ${VALID_EXPORT_FORMATS.join(", ")}`,
          },
          { status: 400 }
        );
      }

      if (exportFormats.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "exportFormats must contain at least one format",
          },
          { status: 400 }
        );
      }
    }

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, user.organization_id),
      columns: {
        settings: true,
      },
    });

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

    await db
      .update(schema.organizations)
      .set({
        settings: {
          ...currentSettings,
          analytics: updatedAnalyticsConfig,
        },
        updated_at: new Date(),
      })
      .where(eq(schema.organizations.id, user.organization_id));

    return NextResponse.json({
      success: true,
      data: updatedAnalyticsConfig,
    });
  } catch (error) {
    logger.error("[Analytics Config PUT] Error:", error);
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

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
export const PUT = withRateLimit(handlePUT, RateLimitPresets.STRICT);
