import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const UpdateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  app_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  allowed_origins: z.array(z.string()).optional(),
  logo_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
  is_pinned: z.boolean().optional(),
});

/**
 * GET /api/v1/apps/[id]
 * Gets details for a specific app by ID.
 * Requires ownership verification.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the app ID.
 * @returns App details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await params;

    const app = await appsService.getById(id);

    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    if (app.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true, app });
  } catch (error) {
    logger.error("Failed to get app:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get app",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/v1/apps/[id]
 * Updates an app's properties.
 * Requires ownership verification.
 *
 * @param request - Request body with optional fields to update.
 * @param params - Route parameters containing the app ID.
 * @returns Updated app details.
 */
export async function PUT(
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

    const body = await request.json();
    const validationResult = UpdateAppSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const updatedApp = await appsService.update(id, validationResult.data);

    logger.info(`Updated app: ${id}`, {
      appId: id,
      userId: user.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({ success: true, app: updatedApp });
  } catch (error) {
    logger.error("Failed to update app:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update app",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/apps/[id]
 * Deletes an app and its associated API key.
 * Requires ownership verification.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the app ID.
 * @returns Success status.
 */
export async function DELETE(
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

    await appsService.delete(id);

    logger.info(`Deleted app: ${id}`, {
      appId: id,
      userId: user.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      message: "App deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete app:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete app",
      },
      { status: 500 },
    );
  }
}
