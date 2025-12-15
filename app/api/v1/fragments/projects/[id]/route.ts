/**
 * Fragment Project API (by ID)
 *
 * Get, update, delete individual fragment projects
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { fragmentProjectsService } from "@/lib/services/fragment-projects";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { fragmentSchema } from "@/lib/fragments/schema";

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  fragment: fragmentSchema.optional(),
  status: z.enum(["draft", "deployed", "archived"]).optional(),
});

/**
 * GET /api/v1/fragments/projects/:id
 * Get a fragment project by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const { id } = await params;

    const project = await fragmentProjectsService.getById(id);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    // Verify ownership
    if (project.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    logger.error("[Fragment Projects] Error getting project", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get project",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/v1/fragments/projects/:id
 * Update a fragment project
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const { id } = await params;
    const body = await req.json();

    const validationResult = UpdateProjectSchema.safeParse(body);
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

    // Verify ownership
    const project = await fragmentProjectsService.getById(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    if (project.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }

    const updated = await fragmentProjectsService.update(
      id,
      validationResult.data,
    );

    return NextResponse.json({
      success: true,
      project: updated,
    });
  } catch (error) {
    logger.error("[Fragment Projects] Error updating project", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update project",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/fragments/projects/:id
 * Delete a fragment project
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const { id } = await params;

    // Verify ownership
    const project = await fragmentProjectsService.getById(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    if (project.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }

    await fragmentProjectsService.delete(id);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("[Fragment Projects] Error deleting project", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete project",
      },
      { status: 500 },
    );
  }
}
