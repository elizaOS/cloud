/**
 * Workflow Share API
 *
 * POST /api/v1/workflows/[id]/share - Share workflow as MCP
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { generatedWorkflowsRepository } from "@/db/repositories";
import { userMcpsService } from "@/lib/services/user-mcps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ShareRequest {
  /** Pricing type for the shared workflow */
  pricingType?: "free" | "credits";
  /** Credits per request (if pricingType is "credits") */
  creditsPerRequest?: number;
  /** Custom description for the shared workflow */
  description?: string;
  /** Tags for discovery */
  tags?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    const workflow = await generatedWorkflowsRepository.getById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Not authorized to share this workflow" },
        { status: 403 },
      );
    }

    // Check if already shared
    if (workflow.mcp_id) {
      return NextResponse.json(
        {
          error: "Workflow is already shared",
          mcpId: workflow.mcp_id,
        },
        { status: 400 },
      );
    }

    // Check workflow status
    if (workflow.status === "draft") {
      return NextResponse.json(
        { error: "Cannot share a draft workflow. Test it first." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as ShareRequest;
    const { pricingType = "free", creditsPerRequest = 1, description, tags } = body;

    // Generate slug from workflow name
    const slug = workflow.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Create MCP entry
    const mcp = await userMcpsService.create({
      name: workflow.name,
      slug: `workflow-${slug}-${Date.now()}`,
      description: description || workflow.description || workflow.user_intent,
      organizationId: user.organization_id,
      userId: user.id,
      category: workflow.category || "workflows",
      endpointType: "external",
      externalEndpoint: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/workflows/${workflow.id}/execute`,
      transportType: "http",
      tools: [
        {
          name: "execute",
          description: `Execute workflow: ${workflow.user_intent}`,
          inputSchema: {
            type: "object",
            properties: {
              params: {
                type: "object",
                description: "Parameters to pass to the workflow",
              },
            },
          },
        },
      ],
      pricingType,
      creditsPerRequest: pricingType === "credits" ? creditsPerRequest : 0,
      tags: tags || workflow.tags || [],
      icon: "workflow",
      color: "#10B981",
    });

    // Update workflow with MCP reference
    await generatedWorkflowsRepository.setMcpId(workflow.id, mcp.id);

    logger.info("[Workflows] Workflow shared as MCP", {
      workflowId: workflow.id,
      mcpId: mcp.id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      message: "Workflow shared successfully",
      mcpId: mcp.id,
      mcpSlug: mcp.slug,
    });
  } catch (error) {
    logger.error("[Workflows] Failed to share workflow", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: id,
    });

    return NextResponse.json(
      { error: "Failed to share workflow" },
      { status: 500 },
    );
  }
}
