/**
 * N8N Workflow Generation API
 *
 * POST /api/v1/n8n/generate-workflow
 * Generates n8n workflows using Claude Opus 4.5 based on natural language prompts.
 */

import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
} from "@/lib/pricing";
import { endpointDiscoveryService } from "@/lib/services/endpoint-discovery";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const WORKFLOW_GENERATION_MODEL = "anthropic/claude-opus-4.1";

const GenerateWorkflowRequestSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe("Natural language description of the workflow"),
  context: z
    .object({
      availableNodes: z
        .array(z.unknown())
        .optional()
        .describe("Available n8n nodes"),
      existingWorkflows: z
        .array(z.unknown())
        .optional()
        .describe("Existing workflows for reference"),
      variables: z
        .record(z.string())
        .optional()
        .describe("Available variables"),
    })
    .optional(),
  autoSave: z
    .boolean()
    .optional()
    .default(false)
    .describe("Automatically save the generated workflow"),
  workflowName: z
    .string()
    .optional()
    .describe("Name for the workflow (required if autoSave is true)"),
  tags: z.array(z.string()).optional().describe("Tags for the workflow"),
});

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const { user, apiKey } = authResult;

    // Parse and validate request
    const body = await request.json();
    const validation = GenerateWorkflowRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400 },
      );
    }

    const { prompt, context, autoSave, workflowName, tags } = validation.data;

    // Discover available endpoints for node generation
    const availableEndpoints =
      await endpointDiscoveryService.discoverAllEndpoints();
    const endpointNodes = availableEndpoints.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      type: e.type,
      category: e.category,
      endpoint: e.endpoint,
      method: e.method,
    }));

    // Estimate cost
    const messages = [
      {
        role: "system" as const,
        content: buildSystemPrompt(context, endpointNodes),
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ];

    const provider = getProviderFromModel(WORKFLOW_GENERATION_MODEL);
    const estimatedCost = await estimateRequestCost(
      WORKFLOW_GENERATION_MODEL,
      messages,
    );

    // Check balance
    const { organizationsService } =
      await import("@/lib/services/organizations");
    const org = await organizationsService.getById(user.organization_id);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    if (Number(org.credit_balance) < estimatedCost) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: estimatedCost,
          available: Number(org.credit_balance),
        },
        { status: 402 },
      );
    }

    // Deduct credits
    const deduction = await creditsService.deductCredits({
      organizationId: user.organization_id,
      amount: estimatedCost,
      description: `N8N workflow generation: ${prompt.substring(0, 50)}...`,
      metadata: {
        user_id: user.id,
        model: WORKFLOW_GENERATION_MODEL,
      },
    });

    if (!deduction.success) {
      return NextResponse.json(
        { error: "Failed to deduct credits" },
        { status: 500 },
      );
    }

    logger.info("[N8N Workflow Generation] Starting generation", {
      userId: user.id,
      organizationId: user.organization_id,
      promptLength: prompt.length,
    });

    // Generate workflow
    const result = await streamText({
      model: gateway.languageModel(WORKFLOW_GENERATION_MODEL),
      messages,
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Collect full response
    let fullText = "";
    for await (const delta of result.textStream) {
      fullText += delta;
    }

    const usage = await result.usage;

    // Calculate actual cost
    const { inputCost, outputCost, totalCost } = await calculateCost(
      WORKFLOW_GENERATION_MODEL,
      provider,
      usage?.inputTokens || 0,
      usage?.outputTokens || 0,
    );

    // Adjust credits based on actual cost
    const costDiff = totalCost - estimatedCost;
    if (costDiff > 0) {
      await creditsService.deductCredits({
        organizationId: user.organization_id,
        amount: costDiff,
        description: `N8N workflow generation additional cost`,
        metadata: { user_id: user.id },
      });
    } else if (costDiff < 0) {
      await creditsService.refundCredits({
        organizationId: user.organization_id,
        amount: -costDiff,
        description: `N8N workflow generation refund`,
        metadata: { user_id: user.id },
      });
    }

    // Track usage
    await usageService.create({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "chat",
      model: WORKFLOW_GENERATION_MODEL,
      provider,
      input_tokens: usage?.inputTokens || 0,
      output_tokens: usage?.outputTokens || 0,
      input_cost: String(inputCost),
      output_cost: String(outputCost),
      is_successful: true,
    });

    // Parse workflow JSON from response
    let workflowData: Record<string, unknown>;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        workflowData = JSON.parse(jsonMatch[1]);
      } else {
        // Try parsing the entire response as JSON
        workflowData = JSON.parse(fullText);
      }
    } catch (parseError) {
      logger.error("[N8N Workflow Generation] Failed to parse workflow JSON", {
        error:
          parseError instanceof Error ? parseError.message : String(parseError),
        response: fullText.substring(0, 500),
      });

      return NextResponse.json(
        {
          error: "Failed to parse generated workflow",
          rawResponse: fullText,
        },
        { status: 500 },
      );
    }

    // Validate workflow structure
    if (!workflowData.nodes || !Array.isArray(workflowData.nodes)) {
      return NextResponse.json(
        {
          error: "Generated workflow is missing required 'nodes' array",
          workflowData,
        },
        { status: 500 },
      );
    }

    // Validate workflow using service
    const { n8nWorkflowsService } =
      await import("@/lib/services/n8n-workflows");
    const validationResult =
      await n8nWorkflowsService.validateWorkflow(workflowData);

    if (!validationResult.valid) {
      logger.warn(
        "[N8N Workflow Generation] Generated workflow has validation issues",
        {
          errors: validationResult.errors,
        },
      );
    }

    // Auto-save workflow if requested
    let savedWorkflow = null;
    if (autoSave) {
      if (!workflowName) {
        return NextResponse.json(
          { error: "workflowName is required when autoSave is true" },
          { status: 400 },
        );
      }

      savedWorkflow = await n8nWorkflowsService.createWorkflow({
        organizationId: user.organization_id,
        userId: user.id,
        name: workflowName,
        description: `AI-generated workflow: ${prompt.substring(0, 100)}`,
        workflowData,
        tags: tags || [],
      });

      logger.info("[N8N Workflow Generation] Auto-saved workflow", {
        workflowId: savedWorkflow.id,
        workflowName,
      });
    }

    logger.info("[N8N Workflow Generation] Success", {
      userId: user.id,
      workflowNodeCount: Array.isArray(workflowData.nodes)
        ? workflowData.nodes.length
        : 0,
      cost: totalCost,
      autoSaved: autoSave && savedWorkflow !== null,
    });

    return NextResponse.json({
      success: true,
      workflow: workflowData,
      savedWorkflow: savedWorkflow
        ? {
            id: savedWorkflow.id,
            name: savedWorkflow.name,
            status: savedWorkflow.status,
            version: savedWorkflow.version,
          }
        : null,
      validation: {
        valid: validationResult.valid,
        errors: validationResult.errors || [],
      },
      metadata: {
        model: WORKFLOW_GENERATION_MODEL,
        usage: {
          inputTokens: usage?.inputTokens || 0,
          outputTokens: usage?.outputTokens || 0,
          totalTokens: usage?.totalTokens || 0,
        },
        cost: totalCost,
      },
    });
  } catch (error) {
    logger.error("[N8N Workflow Generation] Error", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: "Failed to generate workflow",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Builds the system prompt for workflow generation.
 */
function buildSystemPrompt(
  context?: {
    availableNodes?: unknown[];
    existingWorkflows?: unknown[];
    variables?: Record<string, string>;
  },
  availableEndpoints?: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    category: string;
    endpoint: string;
    method?: string;
  }>,
): string {
  let prompt = `You are an expert n8n workflow generator. Your task is to generate valid n8n workflow JSON based on natural language descriptions.

The workflow JSON must follow this structure:
{
  "name": "Workflow Name",
  "nodes": [
    {
      "id": "unique-node-id",
      "type": "n8n-nodes-base.node-type",
      "name": "Node Name",
      "typeVersion": 1,
      "position": [x, y],
      "parameters": { ... }
    }
  ],
  "connections": {
    "Node Name": {
      "main": [
        [
          {
            "node": "Next Node Name",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {},
  "staticData": null,
  "tags": []
}

Important rules:
1. Every node must have a unique ID (use UUID format)
2. Node positions should be spaced appropriately (e.g., [250, 300], [450, 300])
3. Connections must reference node names exactly as they appear in the nodes array
4. Use appropriate n8n node types (e.g., n8n-nodes-base.httpRequest, n8n-nodes-base.set)
5. Include proper parameters for each node type
6. The workflow should be executable and logically connected

`;

  if (context?.availableNodes && context.availableNodes.length > 0) {
    prompt += `\nAvailable n8n nodes:\n${JSON.stringify(context.availableNodes, null, 2)}\n\n`;
  }

  if (availableEndpoints && availableEndpoints.length > 0) {
    prompt += `\nAvailable marketplace endpoints (A2A/MCP/REST) that can be used as n8n nodes:\n${JSON.stringify(availableEndpoints.slice(0, 150), null, 2)}\n\n`;
    prompt += `\nIMPORTANT: When using these endpoints in n8n workflows:\n`;
    prompt += `- For A2A endpoints: Create HTTP Request node with POST to /api/a2a, use JSON-RPC format:\n`;
    prompt += `  { "jsonrpc": "2.0", "method": "message/send", "params": { "message": { "parts": [{ "type": "data", "data": { "skill": "<skillId>", ... } }] } }, "id": 1 }\n`;
    prompt += `- For MCP endpoints: Create HTTP Request node with POST to the MCP endpoint, use JSON-RPC format:\n`;
    prompt += `  { "jsonrpc": "2.0", "method": "tools/call", "params": { "name": "<toolName>", "arguments": {...} }, "id": 1 }\n`;
    prompt += `- For REST endpoints: Create HTTP Request node with the specified HTTP method and URL\n`;
    prompt += `- Always set contentType to "json" and specifyBody to "json" for JSON-RPC requests\n`;
    prompt += `- Use jsonBody parameter (as string) for request body, not bodyParameters\n\n`;
  }

  if (context?.variables && Object.keys(context.variables).length > 0) {
    prompt += `\nAvailable variables:\n${JSON.stringify(context.variables, null, 2)}\n\n`;
  }

  prompt += `\nGenerate only valid JSON. Do not include any markdown formatting or explanations outside the JSON structure.`;

  return prompt;
}
