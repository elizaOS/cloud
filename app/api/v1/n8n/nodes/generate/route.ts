/**
 * N8N Node Generation API
 *
 * POST /api/v1/n8n/nodes/generate - Generate n8n nodes from endpoints
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nNodeGeneratorService } from "@/lib/services/n8n-node-generator";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const GenerateNodeSchema = z.object({
  endpointId: z.string(),
  position: z.tuple([z.number(), z.number()]).optional(),
  credentials: z.record(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
});

const GenerateNodesFromSearchSchema = z.object({
  query: z.string(),
  types: z.array(z.enum(["a2a", "mcp", "rest"])).optional(),
  categories: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
  startPosition: z.tuple([z.number(), z.number()]).optional(),
  spacing: z.tuple([z.number(), z.number()]).optional(),
});

const GenerateWorkflowSchema = z.object({
  endpointIds: z.array(z.string()).min(1),
  workflowName: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();

    // Check which schema matches
    if (body.endpointId) {
      // Single node generation
      const validation = GenerateNodeSchema.safeParse(body);
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

      const node = await n8nNodeGeneratorService.generateNode(validation.data);

      return NextResponse.json({
        success: true,
        node,
      });
    } else if (body.query) {
      // Generate nodes from search
      const validation = GenerateNodesFromSearchSchema.safeParse(body);
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

      const nodes = await n8nNodeGeneratorService.generateNodesFromSearch(
        validation.data.query,
        {
          types: validation.data.types,
          categories: validation.data.categories,
          limit: validation.data.limit,
          startPosition: validation.data.startPosition,
          spacing: validation.data.spacing,
        },
      );

      return NextResponse.json({
        success: true,
        nodes,
        count: nodes.length,
      });
    } else if (body.endpointIds) {
      // Generate workflow from endpoints
      const validation = GenerateWorkflowSchema.safeParse(body);
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

      const workflow =
        await n8nNodeGeneratorService.generateWorkflowFromEndpoints(
          validation.data.endpointIds,
          validation.data.workflowName,
        );

      return NextResponse.json({
        success: true,
        workflow,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid request: must include endpointId, query, or endpointIds",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    logger.error("[N8N Node Generation] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to generate nodes",
      },
      { status: 500 },
    );
  }
}
