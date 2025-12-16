import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/v1/apps/[id]/pin
 * Toggles the pinned status of an app.
 * Pinned apps appear first in the dashboard list.
 * Requires ownership verification.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the app ID.
 * @returns Updated app with new pinned status.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await params;

    const existingApp = await appsService.getById(id);

    if (!existingApp) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    if (existingApp.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
    }

    const updatedApp = await appsService.togglePinned(id);

    logger.info(`Toggled pin status for app: ${id}`, {
      appId: id,
      userId: user.id,
      organizationId: user.organization_id,
      isPinned: updatedApp?.is_pinned,
    });

    return NextResponse.json({
      success: true,
      app: updatedApp,
      message: updatedApp?.is_pinned
        ? "App pinned successfully"
        : "App unpinned successfully",
    });
  } catch (error) {
    logger.error("Failed to toggle app pin status:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to toggle app pin status",
      },
      { status: 500 },
    );
  }
}
