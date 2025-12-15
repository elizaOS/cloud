/**
 * MCP Endpoint for Organization Tools
 *
 * Exposes the org MCP server via HTTP for AI agents to use.
 * Supports both SSE streaming and standard HTTP requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAppAuth, requireAuth } from "@/lib/auth";
import orgMcpServer, { MCPContext, MCPToolDefinition } from "@/lib/mcp/org";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// SCHEMAS
// =============================================================================

const ToolCallSchema = z.object({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

const ListToolsSchema = z.object({
  method: z.literal("tools/list"),
});

const ListResourcesSchema = z.object({
  method: z.literal("resources/list"),
});

const ReadResourceSchema = z.object({
  method: z.literal("resources/read"),
  params: z.object({
    uri: z.string(),
  }),
});

const MCPRequestSchema = z.discriminatedUnion("method", [
  ToolCallSchema,
  ListToolsSchema,
  ListResourcesSchema,
  ReadResourceSchema,
]);

// =============================================================================
// HELPERS
// =============================================================================

async function getContext(request: NextRequest): Promise<MCPContext> {
  // Try app auth first, then regular auth
  try {
    const user = await requireAppAuth(request);
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      platform: "web",
    };
  } catch {
    // Fall back to regular auth
    const user = await requireAuth();
    return {
      organizationId: user.organization_id,
      userId: user.id,
      platform: "web",
    };
  }
}

function formatToolForMCP(tool: MCPToolDefinition) {
  // Convert Zod schema to JSON Schema for MCP
  const zodToJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const zodValue = value as z.ZodType;
        properties[key] = zodToJsonSchema(zodValue);

        if (!(zodValue instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: "string", description: schema.description };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: "number", description: schema.description };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: "boolean", description: schema.description };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: "array",
        items: zodToJsonSchema(schema.element),
        description: schema.description,
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: "string",
        enum: schema.options,
        description: schema.description,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return zodToJsonSchema(schema.unwrap());
    }

    if (schema instanceof z.ZodNullable) {
      const inner = zodToJsonSchema(schema.unwrap());
      return { ...inner, nullable: true };
    }

    if (schema instanceof z.ZodRecord) {
      return {
        type: "object",
        additionalProperties: zodToJsonSchema(schema.valueSchema),
      };
    }

    return { type: "string" };
  };

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema),
  };
}

// =============================================================================
// GET - Server info and capabilities
// =============================================================================

export async function GET() {
  return NextResponse.json({
    name: orgMcpServer.name,
    version: orgMcpServer.version,
    description: orgMcpServer.description,
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false },
    },
    toolCount: orgMcpServer.tools.length,
    resourceCount: orgMcpServer.resources.length,
  });
}

// =============================================================================
// POST - Handle MCP requests
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const context = await getContext(request);
    const body = await request.json();

    const validation = MCPRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            code: -32600,
            message: "Invalid request",
            data: validation.error.format(),
          },
        },
        { status: 400 },
      );
    }

    const mcpRequest = validation.data;

    switch (mcpRequest.method) {
      case "tools/list": {
        return NextResponse.json({
          tools: orgMcpServer.tools.map(formatToolForMCP),
        });
      }

      case "tools/call": {
        const { name, arguments: args } = mcpRequest.params;

        const tool = orgMcpServer.tools.find((t) => t.name === name);
        if (!tool) {
          return NextResponse.json(
            {
              error: {
                code: -32601,
                message: `Tool not found: ${name}`,
              },
            },
            { status: 404 },
          );
        }

        // Validate arguments
        const argsValidation = tool.inputSchema.safeParse(args || {});
        if (!argsValidation.success) {
          return NextResponse.json(
            {
              error: {
                code: -32602,
                message: "Invalid parameters",
                data: argsValidation.error.format(),
              },
            },
            { status: 400 },
          );
        }

        logger.info("[OrgMCP] Executing tool", {
          tool: name,
          organizationId: context.organizationId,
        });

        const result = await tool.handler(argsValidation.data, context);

        return NextResponse.json({
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      }

      case "resources/list": {
        return NextResponse.json({
          resources: orgMcpServer.resources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
        });
      }

      case "resources/read": {
        const { uri } = mcpRequest.params;

        const resource = orgMcpServer.resources.find((r) => r.uri === uri);
        if (!resource) {
          return NextResponse.json(
            {
              error: {
                code: -32601,
                message: `Resource not found: ${uri}`,
              },
            },
            { status: 404 },
          );
        }

        const data = await resource.handler(uri, context);

        return NextResponse.json({
          contents: [
            {
              uri,
              mimeType: resource.mimeType,
              text: JSON.stringify(data, null, 2),
            },
          ],
        });
      }
    }
  } catch (error) {
    logger.error("[OrgMCP] Error handling request:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        {
          error: {
            code: -32000,
            message: "Authentication required",
          },
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 },
    );
  }
}
