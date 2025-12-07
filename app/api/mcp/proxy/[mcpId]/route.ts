/**
 * User MCP Proxy Endpoint
 *
 * Proxies requests to user-created MCPs and handles monetization.
 * Supports both credit-based and x402 payments.
 *
 * Flow:
 * 1. Authenticate caller
 * 2. Look up MCP
 * 3. Check payment (credits or x402)
 * 4. Proxy request to MCP endpoint
 * 5. Record usage and distribute revenue
 *
 * POST /api/mcp/proxy/[mcpId] - Proxy MCP request
 * GET /api/mcp/proxy/[mcpId] - Get MCP info
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { userMcpsService } from "@/lib/services";
import { containersService } from "@/lib/services/containers";
import { hasX402Payment } from "@/lib/auth/x402-or-credits";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/mcp/proxy/[mcpId]
 * Get MCP info and endpoint details
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string }> }
) {
  const { mcpId } = await ctx.params;

  const mcp = await userMcpsService.getById(mcpId);

  if (!mcp) {
    return NextResponse.json({ error: "MCP not found" }, { status: 404 });
  }

  if (mcp.status !== "live") {
    return NextResponse.json(
      { error: "MCP is not available" },
      { status: 404 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  return NextResponse.json({
    id: mcp.id,
    name: mcp.name,
    description: mcp.description,
    tools: mcp.tools,
    pricing: {
      type: mcp.pricing_type,
      creditsPerRequest: mcp.credits_per_request,
      x402PriceUsd: mcp.x402_price_usd,
      x402Enabled: mcp.x402_enabled,
    },
    endpoint: userMcpsService.getEndpointUrl(mcp, baseUrl),
    transport: mcp.transport_type,
  });
}

/**
 * POST /api/mcp/proxy/[mcpId]
 * Proxy request to user MCP
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string }> }
) {
  const startTime = Date.now();
  const { mcpId } = await ctx.params;

  // Authenticate
  const authResult = await requireAuthOrApiKeyWithOrg(request);

  // Look up MCP
  const mcp = await userMcpsService.getById(mcpId);

  if (!mcp) {
    return NextResponse.json({ error: "MCP not found" }, { status: 404 });
  }

  if (mcp.status !== "live") {
    return NextResponse.json(
      { error: "MCP is not available" },
      { status: 404 }
    );
  }

  // Determine payment type
  const paymentType = hasX402Payment(request) ? "x402" : "credits";

  // Get the actual MCP endpoint URL
  let targetUrl: string;

  if (mcp.endpoint_type === "external" && mcp.external_endpoint) {
    targetUrl = mcp.external_endpoint;
  } else if (mcp.endpoint_type === "container" && mcp.container_id) {
    // Get container URL - use MCP creator's organization ID
    const container = await containersService.getById(mcp.container_id, mcp.organization_id);
    if (!container || !container.load_balancer_url) {
      return NextResponse.json(
        { error: "MCP container not available" },
        { status: 503 }
      );
    }
    targetUrl = `${container.load_balancer_url}${mcp.endpoint_path || "/mcp"}`;
  } else {
    return NextResponse.json(
      { error: "MCP endpoint not configured" },
      { status: 500 }
    );
  }

  // Parse the request body to extract tool name
  let body: Record<string, unknown>;
  let toolName = "unknown";
  
  const contentType = request.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    body = await request.json();
    // MCP protocol: look for tool name in the request
    if (body.method === "tools/call" && body.params && typeof body.params === "object") {
      const params = body.params as { name?: string };
      toolName = params.name || "unknown";
    }
  } else {
    body = {};
  }

  // Proxy the request to the MCP
  let mcpResponse: Response;
  try {
    mcpResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward relevant headers
        ...(request.headers.get("accept") && { Accept: request.headers.get("accept")! }),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    logger.error("[MCP Proxy] Failed to reach MCP endpoint", {
      mcpId,
      targetUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to reach MCP endpoint" },
      { status: 502 }
    );
  }

  // Record usage and distribute revenue (only on success)
  if (mcpResponse.ok) {
    try {
      await userMcpsService.recordUsage({
        mcpId: mcp.id,
        organizationId: authResult.user.organization_id,
        userId: authResult.user.id,
        toolName,
        paymentType,
        metadata: {
          responseTime: Date.now() - startTime,
          success: true,
        },
      });
    } catch (usageError) {
      // Log but don't fail the request - usage tracking is secondary
      logger.error("[MCP Proxy] Failed to record usage", {
        mcpId,
        error: usageError instanceof Error ? usageError.message : String(usageError),
      });
    }
  }

  // Return the MCP response
  const responseBody = await mcpResponse.text();
  
  return new NextResponse(responseBody, {
    status: mcpResponse.status,
    headers: {
      "Content-Type": mcpResponse.headers.get("content-type") || "application/json",
      "X-MCP-Id": mcp.id,
      "X-MCP-Name": mcp.name,
    },
  });
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-PAYMENT",
    },
  });
}

