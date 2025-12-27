/**
 * App Deploy API
 *
 * Deploy fragments as serverless apps with custom subdomains
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appDeployService } from "@/lib/services/app-deploy";
import { fragmentProjectsService } from "@/lib/services/fragment-projects";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { fragmentSchema } from "@/lib/fragments/schema";

const DeployAppSchema = z
  .object({
    // Either projectId OR fragment must be provided
    projectId: z.string().uuid().optional(),
    fragment: fragmentSchema.optional(),

    // App config
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    subdomain: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    customDomain: z.string().optional(),

    // Runtime options
    runtimeConfig: z
      .object({
        injectAuth: z.boolean().optional().default(true),
        injectStorage: z.boolean().optional().default(true),
        apiProxy: z.boolean().optional().default(true),
        customHead: z.string().optional(),
      })
      .optional(),
  })
  .refine((data) => data.projectId || data.fragment, {
    message: "Either projectId or fragment must be provided",
  });

async function handleDeploy(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  const validation = DeployAppSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: validation.error.format(),
      },
      { status: 400 },
    );
  }

  const {
    projectId,
    fragment: directFragment,
    name,
    description,
    subdomain,
    customDomain,
    runtimeConfig,
  } = validation.data;

  // Get fragment from project or use direct fragment
  let fragment;
  if (projectId) {
    const project = await fragmentProjectsService.getById(projectId);
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
    fragment = project.fragment_data;
  } else {
    fragment = directFragment!;
  }

  logger.info("[App Deploy API] Starting deployment", {
    userId: user.id,
    organizationId: user.organization_id,
    name,
    subdomain,
    projectId,
  });

  const result = await appDeployService.deploy({
    projectId,
    fragment,
    name,
    description,
    subdomain,
    customDomain,
    organizationId: user.organization_id!,
    userId: user.id,
    runtimeConfig: runtimeConfig || {
      injectAuth: true,
      injectStorage: true,
      apiProxy: true,
    },
  });

  logger.info("[App Deploy API] Deployment complete", {
    appId: result.appId,
    url: result.url,
  });

  return NextResponse.json({
    success: true,
    deployment: {
      appId: result.appId,
      bundleId: result.bundleId,
      url: result.url,
      subdomain: result.subdomain,
      customDomain: result.customDomain,
      verificationRecords: result.verificationRecords,
    },
  });
}

export const POST = withRateLimit(handleDeploy, RateLimitPresets.STRICT);
