/**
 * Miniapp N8N Instances API
 *
 * GET /api/v1/miniapp/n8n/instances - List n8n instances
 * POST /api/v1/miniapp/n8n/instances - Create n8n instance
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMiniappAuth } from "@/lib/middleware/miniapp-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Miniapp-Token, X-Api-Key",
};

const CreateInstanceSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().url(),
  apiKey: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/v1/miniapp/n8n/instances
 * Lists n8n instances for the authenticated app.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireMiniappAuth(request);

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found for this organization" },
        { status: 404, headers: corsHeaders }
      );
    }

    const instances = await n8nWorkflowsService.listInstances(user.organization_id);

    return NextResponse.json(
      {
        success: true,
        instances: instances.map((i) => ({
          id: i.id,
          name: i.name,
          endpoint: i.endpoint,
          isDefault: i.is_default,
          createdAt: i.created_at,
          updatedAt: i.updated_at,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[Miniapp N8N Instances] Error listing instances:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list instances",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/v1/miniapp/n8n/instances
 * Creates a new n8n instance connection.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireMiniappAuth(request);

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found for this organization" },
        { status: 404, headers: corsHeaders }
      );
    }

    const app = apps[0];

    const body = await request.json();
    const validation = CreateInstanceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400, headers: corsHeaders }
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
        { status: 400, headers: corsHeaders }
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

    logger.info(`[Miniapp N8N Instances] Created instance: ${name}`, {
      appId: app.id,
      instanceId: instance.id,
    });

    return NextResponse.json(
      {
        success: true,
        instance: {
          id: instance.id,
          name: instance.name,
          endpoint: instance.endpoint,
          isDefault: instance.is_default,
          createdAt: instance.created_at,
          updatedAt: instance.updated_at,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[Miniapp N8N Instances] Error creating instance:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create instance",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

