import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAuthOrApiKey } from "@/lib/auth";
import {
  listContainers,
  createContainer,
  type NewContainer,
} from "@/lib/queries/containers";
import { getCloudflareService } from "@/lib/services/cloudflare";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  image_tag: z.string().optional(),
  dockerfile_path: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  max_instances: z.number().int().min(1).max(10).default(1),
  environment_vars: z.record(z.string(), z.string()).optional(),
  health_check_path: z.string().default("/health"),
});

/**
 * GET /api/v1/containers
 * List all containers for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    const containers = await listContainers(user.organization_id);

    return NextResponse.json({
      success: true,
      data: containers,
    });
  } catch (error) {
    console.error("Error fetching containers:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch containers",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/containers
 * Create and deploy a new container
 */
export async function POST(request: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKey(request);
    const body = await request.json();

    // Validate request body
    const validatedData = createContainerSchema.parse(body);

    // Check if name is unique for organization
    const existingContainers = await listContainers(user.organization_id);
    if (existingContainers.some((c) => c.name === validatedData.name)) {
      return NextResponse.json(
        {
          success: false,
          error: "A container with this name already exists",
        },
        { status: 400 },
      );
    }

    // Create container record
    const containerData: NewContainer = {
      name: validatedData.name,
      description: validatedData.description,
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      image_tag: validatedData.image_tag,
      dockerfile_path: validatedData.dockerfile_path,
      port: validatedData.port,
      max_instances: validatedData.max_instances,
      environment_vars: validatedData.environment_vars || {},
      health_check_path: validatedData.health_check_path,
      status: "pending",
    };

    const container = await createContainer(containerData);

    // Start async deployment process (in real implementation, this would be a background job)
    deployContainerAsync(container.id, validatedData).catch((error) => {
      console.error("Async deployment failed:", error);
    });

    return NextResponse.json(
      {
        success: true,
        data: container,
        message:
          "Container deployment initiated. Check status for deployment progress.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating container:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create container",
      },
      { status: 500 },
    );
  }
}

/**
 * Background deployment function
 * In production, this should be handled by a job queue
 */
async function deployContainerAsync(
  containerId: string,
  config: z.infer<typeof createContainerSchema>,
): Promise<void> {
  const { updateContainerStatus } = await import("@/lib/queries/containers");

  try {
    // Update status to building
    await updateContainerStatus(containerId, "building");

    // Initialize Cloudflare service
    const cloudflare = getCloudflareService();

    // Deploy to Cloudflare
    await updateContainerStatus(containerId, "deploying");

    const deployment = await cloudflare.deployContainer({
      name: config.name,
      imageTag: config.image_tag || "latest",
      port: config.port,
      maxInstances: config.max_instances,
      environmentVars: config.environment_vars,
      healthCheckPath: config.health_check_path,
    });

    // Update container with deployment info
    await updateContainerStatus(containerId, "running", {
      cloudflareWorkerId: deployment.workerId,
      cloudflareContainerId: deployment.containerId,
      deploymentLog: `Deployed successfully to ${deployment.url}`,
    });
  } catch (error) {
    console.error("Deployment failed:", error);
    await updateContainerStatus(containerId, "failed", {
      errorMessage:
        error instanceof Error ? error.message : "Unknown deployment error",
      deploymentLog: `Deployment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

