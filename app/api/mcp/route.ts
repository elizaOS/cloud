import type { NextRequest } from "next/server";
import { apiFailureResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { enforceMcpOrganizationRateLimit } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";
import { authContextStorage } from "./lib/context";
import { getMcpHandler } from "./lib/handler";

export const maxDuration = 60;

/**
 * Response shape from mcp-handler's createMcpHandler().
 * We extract properties manually because undici polyfills Response,
 * breaking instanceof checks with Next.js native Response.
 */
interface McpHandlerResponse {
  status: number;
  statusText?: string;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return (
    typeof resp === "object" &&
    resp !== null &&
    typeof (resp as McpHandlerResponse).status === "number"
  );
}

/**
 * Handles MCP protocol requests (GET, POST, DELETE).
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimited = await enforceMcpOrganizationRateLimit(
      authResult.user.organization_id!,
    );
    if (rateLimited) return rateLimited;

    // Call MCP handler with auth context (lazy-loaded)
    const handler = await getMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, async () => {
      return await handler(req as Request);
    });

    if (!mcpResponse) {
      return new Response(JSON.stringify({ error: "no_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Convert MCP handler response (use type guard for safety)
    if (!isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    if (
      mcpResponse.headers &&
      typeof mcpResponse.headers.forEach === "function"
    ) {
      mcpResponse.headers.forEach((value: string, key: string) => {
        headers[key] = value;
      });
    }

    return new Response(bodyText, {
      status: mcpResponse.status,
      headers,
    });
  } catch (error) {
    logger.error("[MCP] Request failed:", error);
    // Native Response — polyfill breaks NextResponse instanceof checks (see Next.js #58611)
    return apiFailureResponse(error);
  }
}
