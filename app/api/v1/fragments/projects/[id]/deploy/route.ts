/**
 * Deploy Fragment Project API
 * 
 * Deploy a fragment project as a app or container
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { fragmentProjectsService } from "@/lib/services/fragment-projects";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const DeployAppSchema = z.object({
  type: z.literal("app"),
  appUrl: z.string().url().optional(), // Optional - auto-generated if not provided
  allowedOrigins: z.array(z.string()).optional(),
  autoStorage: z.boolean().optional().default(true), // Auto-create storage collections
  autoInject: z.boolean().optional().default(true), // Auto-inject app helpers
});

const DeployContainerSchema = z.object({
  type: z.literal("container"),
  name: z.string().min(1).max(100),
  project_name: z.string().min(1).max(50),
  port: z.number().int().min(1).max(65535).optional(),
});

const DeploySchema = z.union([DeployAppSchema, DeployContainerSchema]);

/**
 * POST /api/v1/fragments/projects/:id/deploy
 * Deploy a fragment project
 */
async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);
    const { id } = await params;
    const body = await req.json();

    const validationResult = DeploySchema.safeParse(body);
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

    // Verify ownership
    const project = await fragmentProjectsService.getById(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    if (project.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    const deployData = validationResult.data;

    if (deployData.type === "app") {
      const result = await fragmentProjectsService.deployAsApp(id, {
        appUrl: deployData.appUrl,
        allowedOrigins: deployData.allowedOrigins,
        autoStorage: deployData.autoStorage,
        autoInject: deployData.autoInject,
      });

      return NextResponse.json({
        success: true,
        deployment: {
          type: "app",
          app: result.app,
          apiKey: result.apiKey,
          collections: result.collections,
          injectedCode: result.injectedCode,
          proxyRouteCode: result.proxyRouteCode,
        },
      });
    } else {
      const result = await fragmentProjectsService.deployAsContainer(id, {
        name: deployData.name,
        project_name: deployData.project_name,
        port: deployData.port,
      });

      return NextResponse.json({
        success: true,
        deployment: {
          type: "container",
          containerId: result.containerId,
        },
      });
    }
  } catch (error) {
    logger.error("[Fragment Projects] Error deploying project", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to deploy project",
      },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.CRITICAL);

