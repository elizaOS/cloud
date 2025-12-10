/**
 * Telegram MCP SSE Endpoint
 *
 * Exposes Telegram messaging tools via Streamable HTTP MCP protocol.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { telegramMcpServer } from "@/lib/mcp/telegram";
import { botsService } from "@/lib/services/bots";
import { telegramService } from "@/lib/services/telegram";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

// =============================================================================
// TOOL DEFINITIONS FOR MCP
// =============================================================================

const TOOLS = telegramMcpServer.tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: {
    type: "object" as const,
    properties: Object.fromEntries(
      Object.entries((tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape).map(
        ([key, schema]) => {
          const zodSchema = schema as z.ZodTypeAny;
          return [
            key,
            {
              type: getJsonSchemaType(zodSchema),
              description: zodSchema.description,
            },
          ];
        }
      )
    ),
    required: Object.entries((tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape)
      .filter(([_, schema]) => !(schema as z.ZodTypeAny).isOptional())
      .map(([key]) => key),
  },
}));

function getJsonSchemaType(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodArray) return "array";
  if (schema instanceof z.ZodObject) return "object";
  if (schema instanceof z.ZodOptional) return getJsonSchemaType(schema.unwrap());
  if (schema instanceof z.ZodUnion) return "string"; // Simplify for JSON schema
  return "string";
}

// =============================================================================
// HANDLERS
// =============================================================================

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json({
    name: "Telegram MCP",
    version: "1.0.0",
    description: "Telegram messaging and group management for AI agents",
    protocol: "2024-11-05",
    capabilities: { tools: {} },
    endpoints: {
      mcp: `${baseUrl}/api/mcp/telegram/sse`,
    },
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, X-App-Token",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  let user;
  try {
    const result = await requireAuthOrApiKey(request);
    user = result.user;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32002, message: "Authentication required" }, id: null },
      { status: 401, headers: corsHeaders }
    );
  }

  const body = await request.json();
  const { method, params, id: rpcId } = body;

  const context = {
    organizationId: user.organization_id,
    userId: user.id,
  };

  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "telegram-mcp", version: "1.0.0" },
          capabilities: { tools: {} },
        },
        id: rpcId,
      }, { headers: corsHeaders });

    case "tools/list":
      return NextResponse.json({
        jsonrpc: "2.0",
        result: { tools: TOOLS },
        id: rpcId,
      }, { headers: corsHeaders });

    case "tools/call":
      return handleToolCall(context, params ?? {}, rpcId);

    case "resources/list":
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {
          resources: telegramMcpServer.resources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
        },
        id: rpcId,
      }, { headers: corsHeaders });

    case "resources/read":
      return handleResourceRead(context, params ?? {}, rpcId);

    case "ping":
      return NextResponse.json(
        { jsonrpc: "2.0", result: {}, id: rpcId },
        { headers: corsHeaders }
      );

    default:
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id: rpcId },
        { status: 400, headers: corsHeaders }
      );
  }
}

async function handleToolCall(
  context: { organizationId: string; userId: string },
  params: Record<string, unknown>,
  rpcId: string | number
) {
  const { name, arguments: args } = params as {
    name: string;
    arguments: Record<string, unknown>;
  };

  const tool = telegramMcpServer.tools.find((t) => t.name === name);
  if (!tool) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32601, message: `Unknown tool: ${name}` }, id: rpcId },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const validatedArgs = tool.inputSchema.parse(args);
    const result = await tool.handler(validatedArgs as Record<string, unknown>, context);

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      },
      id: rpcId,
    }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("[Telegram MCP] Tool error", { tool: name, error: message });

    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: rpcId,
    }, { status: 500, headers: corsHeaders });
  }
}

async function handleResourceRead(
  context: { organizationId: string; userId: string },
  params: Record<string, unknown>,
  rpcId: string | number
) {
  const { uri } = params as { uri: string };

  if (uri === "telegram://bots") {
    const connections = await botsService.getConnections(context.organizationId);
    const telegramBots = connections.filter((c) => c.platform === "telegram");

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            bots: telegramBots.map((bot) => ({
              id: bot.id,
              botUsername: bot.platform_bot_username,
              status: bot.status,
            })),
          }),
        }],
      },
      id: rpcId,
    }, { headers: corsHeaders });
  }

  if (uri === "telegram://chats") {
    const connections = await botsService.getConnections(context.organizationId);
    const telegramBot = connections.find(
      (c) => c.platform === "telegram" && c.status === "active"
    );

    if (!telegramBot) {
      return NextResponse.json({
        jsonrpc: "2.0",
        result: { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ chats: [] }) }] },
        id: rpcId,
      }, { headers: corsHeaders });
    }

    const chats = await telegramService.listChats(telegramBot.id, context.organizationId);

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ chats }) }],
      },
      id: rpcId,
    }, { headers: corsHeaders });
  }

  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message: `Unknown resource: ${uri}` }, id: rpcId },
    { status: 404, headers: corsHeaders }
  );
}

