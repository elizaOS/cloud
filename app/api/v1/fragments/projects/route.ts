/**
 * Fragment Projects API
 * 
 * CRUD operations for fragment projects
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { fragmentProjectsService } from "@/lib/services/fragment-projects";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { fragmentSchema } from "@/lib/fragments/schema";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  fragment: fragmentSchema,
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  fragment: fragmentSchema.optional(),
  status: z.enum(["draft", "deployed", "archived"]).optional(),
});

/**
 * GET /api/v1/fragments/projects
 * List fragment projects for the organization
 */
async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status") || undefined;
    const userId = searchParams.get("userId") || undefined;

    const projects = await fragmentProjectsService.listByOrganization(
      user.organization_id!,
      { status, userId: userId || undefined }
    );

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    logger.error("[Fragment Projects] Error listing projects", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to list projects",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/fragments/projects
 * Create a new fragment project
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const body = await req.json();

    const validationResult = CreateProjectSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { name, description, fragment } = validationResult.data;

    const project = await fragmentProjectsService.create({
      name,
      description,
      organization_id: user.organization_id!,
      user_id: user.id,
      fragment,
    });

    return NextResponse.json(
      {
        success: true,
        project,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("[Fragment Projects] Error creating project", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create project",
      },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STRICT);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);

