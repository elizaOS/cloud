import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

// Schema for updating an app
const UpdateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  app_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  allowed_origins: z.array(z.string()).optional(),
  features_enabled: z
    .object({
      chat: z.boolean().optional(),
      image: z.boolean().optional(),
      video: z.boolean().optional(),
      voice: z.boolean().optional(),
      agents: z.boolean().optional(),
      embedding: z.boolean().optional(),
    })
    .optional(),
  custom_pricing_enabled: z.boolean().optional(),
  custom_pricing_markup: z.string().optional(),
  rate_limit_per_minute: z.number().int().positive().optional(),
  rate_limit_per_hour: z.number().int().positive().optional(),
  logo_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/v1/apps/[id]
 * Get a specific app by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;

    const app = await appsService.getById(id);

    if (!app) {
      return NextResponse.json(
        {
          success: false,
          error: "App not found",
        },
        { status: 404 },
      );
    }

    // Verify the app belongs to the user's organization
    if (app.organization_id !== user.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Access denied",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      app,
    });
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
 * Update an app
 */
export async function PUT(
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

    // Parse and validate request body
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

    const data = validationResult.data;

    // Update the app
    const updatedApp = await appsService.update(id, data);

    logger.info(`Updated app: ${id}`, {
      appId: id,
      userId: user.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      app: updatedApp,
    });
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
 * Delete an app
 */
export async function DELETE(
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

    // Delete the app
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
