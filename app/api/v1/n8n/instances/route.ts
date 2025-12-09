/**
 * N8N Instances API
 *
 * GET /api/v1/n8n/instances - List n8n instances
 * POST /api/v1/n8n/instances - Create n8n instance
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { type N8nInstance } from "@/db/schemas/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const CreateInstanceSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().url(),
  apiKey: z.string().min(1),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/v1/n8n/instances
 * Lists n8n instances for the authenticated organization.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    if (!user.organization_id) {
      return NextResponse.json(
        { success: false, error: "User has no organization" },
        { status: 400 }
      );
    }

    const instances = await n8nWorkflowsService.listInstances(user.organization_id);

    return NextResponse.json({
      success: true,
      instances: instances.map((i) => ({
        id: i.id,
        name: i.name,
        endpoint: i.endpoint,
        isDefault: i.is_default,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      })),
    });
  } catch (error) {
    logger.error("[N8N Instances] Error listing instances:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list instances",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/n8n/instances
 * Creates a new n8n instance connection.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    if (!user.organization_id) {
      return NextResponse.json(
        { success: false, error: "User has no organization" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = CreateInstanceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { name, endpoint, apiKey, isDefault } = validation.data;

    // Test connection
    const testInstance = {
      id: "test",
      organization_id: user.organization_id,
      user_id: user.id,
      name,
      endpoint,
      api_key: apiKey,
      is_default: isDefault || false,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const isConnected = await n8nWorkflowsService.testInstanceConnection(testInstance);
    if (!isConnected) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot connect to n8n instance. Please check your endpoint and API key.",
        },
        { status: 400 }
      );
    }

    const instance = await n8nWorkflowsService.createInstance(
      user.organization_id,
      user.id,
      name,
      endpoint,
      apiKey,
      isDefault || false
    );

    logger.info(`[N8N Instances] Created instance: ${name}`, {
      organizationId: user.organization_id,
      instanceId: instance.id,
    });

    return NextResponse.json({
      success: true,
      instance: {
        id: instance.id,
        name: instance.name,
        endpoint: instance.endpoint,
        isDefault: instance.is_default,
        createdAt: instance.created_at,
        updatedAt: instance.updated_at,
      },
    });
  } catch (error) {
    logger.error("[N8N Instances] Error creating instance:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create instance",
      },
      { status: 500 }
    );
  }
}

