import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/v1/apps/[id]/regenerate-api-key
 * Regenerate the API key for an app
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;

    // Verify the app exists and belongs to the user's organization
    const existingApp = await appsService.getById(id);

    if (!existingApp) {
      return NextResponse.json(
        {
          success: false,
          error: "App not found",
        },
        { status: 404 },
      );
    }

    if (existingApp.organization_id !== user.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Access denied",
        },
        { status: 403 },
      );
    }

    // Regenerate the API key
    const newApiKey = await appsService.regenerateApiKey(id);

    logger.info(`Regenerated API key for app: ${id}`, {
      appId: id,
      userId: user.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      apiKey: newApiKey, // Only returned once
      message: "API key regenerated successfully. Make sure to save it securely.",
    });
  } catch (error) {
    logger.error("Failed to regenerate API key:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to regenerate API key",
      },
      { status: 500 },
    );
  }
}

